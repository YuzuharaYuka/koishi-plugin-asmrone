import { Context, Session, h, Logger, Element } from 'koishi'
import { ApiSearchResponse, BaseWork, DisplayItem, AdvancedSearchParams } from '../common/types'
import { Config } from '../config'
import { AsmrApi } from '../services/api'
import { Renderer } from '../services/renderer'
import { TrackSender } from '../services/sender'
import { formatRjCode, formatWorkDuration, processFileTree, parseTrackIndices } from '../common/utils'
import { AccessMode, SendMode } from '../common/constants'

const orderMap: Record<string, { order: string; sort: string }> = {
  '发售日': { order: 'release', sort: 'desc' },
  '最新收录': { order: 'create_date', sort: 'desc' },
  '发售日-正序': { order: 'release', sort: 'asc' },
  '销量': { order: 'dl_count', sort: 'desc' },
  '价格-正序': { order: 'price', sort: 'asc' },
  '价格': { order: 'price', sort: 'desc' },
  '评分': { order: 'rate_average_2dp', sort: 'desc' },
  '评价数': { order: 'review_count', sort: 'desc' },
  'RJ号': { order: 'id', sort: 'desc' },
  'RJ号-正序': { order: 'id', sort: 'asc' },
  '随机': { order: 'random', sort: 'desc' },
};
// [FIXED] 导出 orderKeys，以便其他文件可以导入和使用
export const orderKeys = Object.keys(orderMap);


export class CommandHandler {
  private logger: Logger
  private activeInteractions = new Set<string>();

  constructor(
    private ctx: Context,
    private config: Config,
    private api: AsmrApi,
    private renderer: Renderer,
    private sender: TrackSender,
  ) {
    this.logger = ctx.logger('asmrone')
  }

  isAccessAllowed(session: Session): boolean {
    if (session.isDirect) return true;
    if (!session.guildId) return false;
    if (this.config.accessMode === AccessMode.WHITELIST) return this.config.whitelist.includes(session.guildId);
    if (this.config.accessMode === AccessMode.BLACKLIST) return !this.config.blacklist.includes(session.guildId);
    return true;
  }

  isInteractionActive(session: Session): boolean {
    const interactionKey = `${session.platform}:${session.userId}`;
    if (this.activeInteractions.has(interactionKey)) {
      session.send('操作中，请稍后再试。');
      return true;
    }
    return false;
  }
  
  async handlePopular(session: Session, page: number = 1) {
    if (!this.isAccessAllowed(session) || this.isInteractionActive(session)) return;
    
    const fetcher = (p: number) => this.api.getPopular(p);
    const onNextPage = (nextSession: Session, nextPage: number) => this.handleListInteraction(nextSession, nextPage, fetcher, '热门音声', onNextPage);
    
    await this.handleListInteraction(session, page, fetcher, '热门音声', onNextPage);
  }

  private parseAdvancedSearch(query: string): AdvancedSearchParams {
    const args = query.trim().split(/\s+/);
    const params: AdvancedSearchParams = {
        keyword: '',
        page: 1,
        include: {},
        exclude: {},
    };
    const keywords: string[] = [];
    const validKeys = ['tag', 'va', 'circle', 'rate', 'price', 'sell', 'duration', 'age', 'lang', 'order'];

    for (const arg of args) {
      if (/^\d+$/.test(arg) && !arg.includes(':')) {
          params.page = parseInt(arg, 10);
          continue;
      }

      const match = arg.match(/^(-)?([a-zA-Z]+):(.*)$/);
      if (match) {
        const [, excludeFlag, key, value] = match;
        if (validKeys.includes(key) && value) {
            if (key === 'order') {
                const mapping = orderMap[value];
                if (mapping) {
                    params.order = mapping.order;
                    params.sort = mapping.sort;
                }
                continue;
            }

            const target = excludeFlag ? params.exclude : params.include;
            if (!target[key]) target[key] = [];
            target[key].push(value);
            continue;
        }
      }
      
      keywords.push(arg);
    }

    params.keyword = keywords.join(' ');
    return params;
  }

  async handleSearch(session: Session, query: string) {
    if (!this.isAccessAllowed(session)) return;
    if (!query) {
        await session.send('请输入关键词。');
        return;
    }
    if (this.isInteractionActive(session)) return;

    const searchParams = this.parseAdvancedSearch(query);
    
    const apiKeywordParts: string[] = [];
    if (searchParams.keyword) {
      apiKeywordParts.push(searchParams.keyword);
    }

    const numericKeys = ['rate', 'price', 'sell', 'duration'];
    for (const key in searchParams.include) {
      for (let value of searchParams.include[key]) {
        if (numericKeys.includes(key)) {
          const match = value.match(/(\d+(\.\d+)?)$/);
          if (match) value = match[0];
        }
        apiKeywordParts.push(`$${key}:${value}$`);
      }
    }
    for (const key in searchParams.exclude) {
      for (const value of searchParams.exclude[key]) {
        apiKeywordParts.push(`$-${key}:${value}$`);
      }
    }
    const apiKeyword = apiKeywordParts.join(' ');

    const fetcher = (p: number) => this.api.search(apiKeyword, p, searchParams.order, searchParams.sort);
    const onNextPage = (nextSession: Session, nextPage: number) => this.handleListInteraction(nextSession, nextPage, fetcher, query, onNextPage);

    await this.handleListInteraction(session, searchParams.page, fetcher, query, onNextPage);
  }

  async handleListen(session: Session, query: string) {
    if (!this.isAccessAllowed(session)) return;
    if (!query) {
      await session.send('请输入 RJ 号。');
      return;
    }
    if (this.isInteractionActive(session)) return;

    try {
        const args = query.trim().split(/\s+/).filter(Boolean);
        const formattedRjCode = formatRjCode(args[0]);
        if (!formattedRjCode) {
          await session.send('RJ 号格式错误。');
          return;
        }
        
        const optionKeywords: SendMode[] = [SendMode.CARD, SendMode.FILE, SendMode.ZIP, SendMode.LINK, SendMode.VOICE];
        let userOption: SendMode = null;
        
        const potentialOption = args[args.length - 1];
        if (optionKeywords.includes(potentialOption as SendMode)) {
          userOption = potentialOption as SendMode;
          args.pop();
        }
        
        const selectionArgs = args.slice(1);
        const uniqueIndices = parseTrackIndices(selectionArgs);

        if (uniqueIndices.length > 0) {
          const rid = formattedRjCode.substring(2);
          const [workInfo, trackData] = await Promise.all([this.api.getWorkInfo(rid), this.api.getTracks(rid)]);
          if (!workInfo || !trackData) {
            await session.send('获取信息失败。');
            return;
          }
          const { processedFiles } = processFileTree(trackData);
          await this.sender.processAndSendTracks(uniqueIndices, processedFiles, workInfo, session, userOption || this.config.defaultSendMode);
        } else {
          await this.handleWorkSelection(session, formattedRjCode);
        }
    } catch (error) {
        this.logger.error(error);
        await session.send(`查询失败：${error.message}`);
    }
  }

  private async handleWorkSelection(session: Session, rjCode: string, onBack?: () => Promise<void>) {
    const interactionKey = `${session.platform}:${session.userId}`;
    this.activeInteractions.add(interactionKey);

    try {
      const rid = rjCode.substring(2);
      await session.send(`正在查询作品详情：${h.escape(rjCode)}...`);
      const workInfo = await this.api.getWorkInfo(rid);
      const trackData = await this.api.getTracks(rid);

      const { displayItems, processedFiles } = processFileTree(trackData);
      
      await this.sendWorkInfo(session, workInfo, displayItems, rjCode);
      
      if (processedFiles.length === 0) {
        await session.send('该作品无可下载文件。');
        this.activeInteractions.delete(interactionKey);
        return;
      }
      
      let promptMessage = `请在 ${this.config.interactionTimeout} 秒内回复【序号】进行收听 (如 1 3-5 [模式]，模式可选 card, file, zip, link, voice)，`;
      if (onBack) {
        promptMessage += `【B】返回列表，`;
      }
      promptMessage += `或【N】取消。`;
      await session.send(promptMessage);

      const dispose = this.ctx.middleware(async (midSession, next) => {
        if (midSession.userId !== session.userId || midSession.channelId !== session.channelId) return next();
        
        clearTimeout(timer);
        dispose();

        try {
          const choice = midSession.content.trim().toLowerCase();
          if (choice === 'n' || choice === '取消') {
            await midSession.send('操作已取消。');
            return;
          }

          if ((choice === 'b' || choice === '返回') && onBack) {
            await midSession.send('正在返回列表...');
            await onBack();
            return;
          }
          
          const replyArgs = choice.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
          let mode: SendMode = null;
          if ([SendMode.CARD, SendMode.FILE, SendMode.ZIP, SendMode.LINK, SendMode.VOICE].includes(replyArgs[replyArgs.length - 1] as any)) {
            mode = replyArgs.pop() as SendMode;
          }
          
          const uniqueIndices = parseTrackIndices(replyArgs);
          
          if (uniqueIndices.length === 0) {
            await midSession.send('输入无效，操作已取消。');
          } else {
            await this.sender.processAndSendTracks(uniqueIndices, processedFiles, workInfo, midSession, mode || this.config.defaultSendMode);
          }

        } catch (error) {
            this.logger.error('处理用户交互时发生错误: %o', error);
            await midSession.send(`交互处理失败：${error.message}`);
        } finally {
            this.activeInteractions.delete(interactionKey);
        }
      }, true);

      const timer = setTimeout(() => {
        dispose();
        this.activeInteractions.delete(interactionKey);
        session.send('操作超时，已自动取消。');
      }, this.config.interactionTimeout * 1000);

    } catch (error) {
        this.logger.error(`获取作品 ${rjCode} 失败: %o`, error);
        await session.send(`查询失败：${error.message}`);
        this.activeInteractions.delete(interactionKey);
    }
  }

  private async handleListInteraction(session: Session, page: number, fetcher: (p: number) => Promise<ApiSearchResponse>, listTitle: string, onNextPage: (s: Session, p: number) => Promise<void>) {
    const interactionKey = `${session.platform}:${session.userId}`;
    this.activeInteractions.add(interactionKey);
    
    try {
      const actionText = listTitle === '热门音声' ? '正在获取' : '正在搜索';
      const titleText = listTitle === '热门音声' ? '热门音声' : `“${h.escape(listTitle)}”`;
      await session.send(`${actionText}${titleText} (第 ${page} 页)...`);
      
      const data = await fetcher(page);

      if (!data?.works?.length) {
          await session.send(data?.pagination?.totalCount === 0 ? '未找到任何结果。' : '没有更多结果了。');
          this.activeInteractions.delete(interactionKey);
          return;
      }
      
      if (this.config.useImageMenu && this.ctx.puppeteer) {
        const worksWithEmbeddedImages = await Promise.all(data.works.map(async (work) => {
            const dataUri = await this.api.downloadImageAsDataUri(work.mainCoverUrl);
            return { ...work, mainCoverUrl: dataUri || work.mainCoverUrl };
        }));
        const html = this.renderer.createSearchHtml(worksWithEmbeddedImages, listTitle, page, data.pagination.totalCount);
        const imageBuffer = await this.renderer.renderHtmlToImage(html);
        if (imageBuffer) await session.send(h.image(imageBuffer, 'image/png'));
        else await this.sendSearchTextResult(session, data, page);
      } else {
        await this.sendSearchTextResult(session, data, page);
      }

      await session.send(`请在 ${this.config.interactionTimeout} 秒内回复【序号】选择作品，【F】下一页，【P】上一页，或【N】取消。`);
      
      const dispose = this.ctx.middleware(async (midSession, next) => {
        if (midSession.userId !== session.userId || midSession.channelId !== session.channelId) return next();
        
        const content = midSession.content.trim().toLowerCase();
        const choice = parseInt(content, 10);
        const localIndex = choice - (page - 1) * this.config.pageSize;
        const isChoiceValid = !isNaN(choice) && localIndex >= 1 && localIndex <= data.works.length;
        
        if (content !== 'f' && content !== 'p' && content !== 'n' && content !== '取消' && !isChoiceValid) {
            return next();
        }

        if (content === 'p' && page <= 1) {
            await midSession.send('已经是第一页了。');
            return;
        }

        clearTimeout(timer);
        dispose();

        try {
            if (content === 'f') {
                onNextPage(midSession, page + 1);
            } else if (content === 'p') {
                onNextPage(midSession, page - 1);
            } else if (content === 'n' || content === '取消') {
                await midSession.send('操作已取消。');
                this.activeInteractions.delete(interactionKey);
            } else if (isChoiceValid) {
                const selectedWork = data.works[localIndex - 1];
                const onBack = () => this.handleListInteraction(midSession, page, fetcher, listTitle, onNextPage);
                await this.handleWorkSelection(midSession, `RJ${String(selectedWork.id).padStart(8, '0')}`, onBack);
            }
        } catch (error) {
            this.logger.error('处理列表交互时发生错误: %o', error);
            await midSession.send(`交互处理失败：${error.message}`);
            this.activeInteractions.delete(interactionKey);
        }
      }, true);

      const timer = setTimeout(() => {
        dispose();
        this.activeInteractions.delete(interactionKey);
        session.send('操作超时，已自动取消。');
      }, this.config.interactionTimeout * 1000);
      
    } catch (error) {
      this.logger.error('获取列表时发生内部错误: %o', error);
      await session.send(`列表获取失败：${error.message}`);
      this.activeInteractions.delete(interactionKey);
    }
  }

  private async sendWorkInfo(session: Session, workInfo: BaseWork, displayItems: DisplayItem[], rjCode: string) {
    if (this.config.useImageMenu && this.ctx.puppeteer) {
        const coverDataUri = await this.api.downloadImageAsDataUri(workInfo.mainCoverUrl);
        const workInfoWithEmbeddedImage = {
            ...workInfo,
            mainCoverUrl: coverDataUri || workInfo.mainCoverUrl,
        };

        const html = this.renderer.createWorkInfoHtml(workInfoWithEmbeddedImage, displayItems, '');
        const imageBuffer = await this.renderer.renderHtmlToImage(html);
        if (imageBuffer) {
            await session.send(h.image(imageBuffer, 'image/png'));
            return;
        }
    }
    await this.sendWorkInfoAsText(session, workInfo, displayItems, rjCode);
  }

  private async sendWorkInfoAsText(session: Session, workInfo: BaseWork, displayItems: DisplayItem[], rjCode: string) {
    const infoBlockArray = [
      `【${rjCode}】`, `标题: ${h.escape(workInfo.title)}`, `社团: 🏢 ${h.escape(workInfo.name)}`,
      `日期: 📅 ${workInfo.release}`, `评分: ⭐️ ${workInfo.rate_average_2dp} (${workInfo.rate_count}人)`,
      `销量: 📥 ${workInfo.dl_count}`, `时长: ⏱️ ${formatWorkDuration(workInfo.duration)}`,
      `声优: 🎤 ${h.escape(workInfo.vas.map(v => v.name).join(', '))}`, `标签: 🏷️ ${h.escape(workInfo.tags.map(t => t.name).join(', '))}`
    ];
    if (this.config.showLinks) {
      infoBlockArray.push(`asmr.one链接: https://asmr.one/work/${rjCode}`);
      if (workInfo.source_url) infoBlockArray.push(`DLsite链接: ${workInfo.source_url}`);
    }
    const infoBlock = infoBlockArray.join('\n');

    const fileIcons = { folder: '📁', audio: '🎵', image: '🖼️', video: '🎬', doc: '📄', subtitle: '📜', unknown: '❔' };
    const fileListText = `--- 文件列表 ---\n` + displayItems.map(item => {
      const prefix = '  '.repeat(item.depth);
      const icon = fileIcons[item.type] || fileIcons.unknown;
      const indexStr = item.fileIndex ? String(item.fileIndex).padStart(2, ' ') + '.' : '   ';
      const metaStr = item.meta ? `  (${item.meta})` : '';
      return `${prefix}${indexStr}${icon} ${h.escape(item.title)}${metaStr}`;
    }).join('\n');

    if (this.config.useForward && session.platform === 'onebot') {
      const imageUri = await this.api.downloadImageAsDataUri(workInfo.mainCoverUrl);
      const imageElement = imageUri ? h.image(imageUri) : h('p', '封面加载失败');
      await session.send(h('figure', [
          h('message', { nickname: '作品详情' }, [imageElement, '\n' + infoBlock]),
          h('message', { nickname: '文件列表' }, fileListText)
      ]));
    } else {
      await session.send([h.image(workInfo.mainCoverUrl), infoBlock, fileListText].join('\n\n'));
    }
  }

  private async sendSearchTextResult(session: Session, data: ApiSearchResponse, page: number) {
    const header = `为你找到 ${data.pagination.totalCount} 个结果 (第 ${page} 页):`;

    const buildEntryText = (work: BaseWork, index: number): string => {
      const rjCode = `RJ${String(work.id).padStart(8, '0')}`;
      const tags = work.tags.slice(0, 5).map(t => t.name).join(', ');
      return [
        `${(page - 1) * this.config.pageSize + index + 1}. 【${rjCode}】`,
        `   标题: ${h.escape(work.title)}`,
        `   社团: 🏢 ${h.escape(work.name)}`,
        `   日期: 📅 ${work.release}`,
        `   声优: 🎤 ${h.escape(work.vas.map(v => v.name).join(', ') || '未知')}`,
        `   评分: ⭐️ ${work.rate_average_2dp} (${work.rate_count})`,
        `   销量: 📥 ${work.dl_count}`,
        `   时长: ⏱️ ${formatWorkDuration(work.duration)}`,
        `   标签: 🏷️ ${h.escape(tags)}`,
      ].join('\n');
    }

    if (this.config.useForward && session.platform === 'onebot') {
        const messageNodes = [h('message', { nickname: session.bot.user?.name || session.bot.selfId }, header)];
        for (const [index, work] of data.works.entries()) {
            const entryText = buildEntryText(work, index);
            let content: (string | h)[] = [entryText];
            if (this.config.showSearchImage) {
                const imageUri = await this.api.downloadImageAsDataUri(work.mainCoverUrl);
                content = imageUri ? [h.image(imageUri), '\n', entryText] : ['[封面加载失败]\n', entryText];
            }
            messageNodes.push(h('message', { nickname: `结果 ${(page - 1) * this.config.pageSize + index + 1}` }, content));
        }
        await session.send(h('figure', messageNodes));
    } else {
        const messageElements: (string | Element)[] = [header];
        for (const [index, work] of data.works.entries()) {
            messageElements.push('\n' + '─'.repeat(15) + '\n');
            if (this.config.showSearchImage) messageElements.push(h('image', { src: work.mainCoverUrl }));
            messageElements.push(buildEntryText(work, index));
        }
        await session.send(messageElements);
    }
  }
}