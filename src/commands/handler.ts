// --- START OF FILE src/commands/handler.ts --- 

import { Context, Session, h, Logger, Element } from 'koishi'
import { ApiSearchResponse, BaseWork, DisplayItem } from '../common/types'
import { Config } from '../config' // <- Updated import path
import { AsmrApi } from '../services/api'
import { Renderer } from '../services/renderer'
import { TrackSender } from '../services/sender'
import { formatRjCode, formatWorkDuration, processFileTree, parseTrackIndices } from '../common/utils'
import { AccessMode, SendMode } from '../common/constants'


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
  
  async handlePopular(session: Session, page = 1) {
    if (!this.isAccessAllowed(session) || this.isInteractionActive(session)) return;
    
    const interactionKey = `${session.platform}:${session.userId}`;
    this.activeInteractions.add(interactionKey);
    
    const fetcher = (p: number) => this.api.getPopular(p);
    const onNextPage = (nextSession: Session, nextPage: number) => this.handleListInteraction(nextSession, nextPage, fetcher, '热门音声', onNextPage);
    
    await this.handleListInteraction(session, page, fetcher, '热门音声', onNextPage);
  }

  async handleSearch(session: Session, query: string) {
    if (!this.isAccessAllowed(session)) return;
    if (!query) {
        await session.send('请输入关键词。');
        return;
    }
    if (this.isInteractionActive(session)) return;

    const interactionKey = `${session.platform}:${session.userId}`;
    this.activeInteractions.add(interactionKey);

    const args = query.trim().split(/\s+/);
    const keyword = args[0];
    const page = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : 1;

    const fetcher = (p: number) => this.api.search(keyword, p);
    const onNextPage = (nextSession: Session, nextPage: number) => this.handleListInteraction(nextSession, nextPage, fetcher, keyword, onNextPage);

    await this.handleListInteraction(session, page, fetcher, keyword, onNextPage);
  }

  async handleListen(session: Session, query: string) {
    if (!this.isAccessAllowed(session)) return;
    if (!query) {
      await session.send('请输入 RJ 号。');
      return;
    }
    if (this.isInteractionActive(session)) return;

    const args = query.trim().split(/\s+/).filter(Boolean);
    const formattedRjCode = formatRjCode(args[0]);
    if (!formattedRjCode) {
      await session.send('RJ 号格式错误。');
      return;
    }
    
    const optionKeywords: SendMode[] = [SendMode.CARD, SendMode.FILE, SendMode.ZIP];
    let userOption: SendMode = null;
    
    const potentialOption = args[args.length - 1];
    if (optionKeywords.includes(potentialOption as SendMode)) {
      userOption = potentialOption as SendMode;
      args.pop();
    }
    
    const selectionArgs = args.slice(1);
    const uniqueIndices = parseTrackIndices(selectionArgs);

    const rid = formattedRjCode.substring(2);
    if (uniqueIndices.length > 0) {
      try {
          const [workInfo, trackData] = await Promise.all([this.api.getWorkInfo(rid), this.api.getTracks(rid)]);
          if (!workInfo || !trackData) {
            await session.send('获取信息失败。');
            return;
          }
          const { processedFiles } = processFileTree(trackData);
          await this.sender.processAndSendTracks(uniqueIndices, processedFiles, workInfo, session, userOption || this.config.defaultSendMode);
      } catch (error) {
          if (this.ctx.http.isError(error) && error.response?.status === 404) {
            await session.send('未找到该作品。');
            return;
          }
          this.logger.error(error);
          await session.send('查询失败：内部错误。');
          return;
      }
    } else {
      await this.handleWorkSelection(session, formattedRjCode);
    }
  }

  private async handleWorkSelection(session: Session, rjCode: string) {
    const rid = rjCode.substring(2);
    try {
      await session.send(`查询中：${rjCode}...`);
      const [workInfo, trackData] = await Promise.all([this.api.getWorkInfo(rid), this.api.getTracks(rid)]);
      if (!workInfo || !trackData) {
        await session.send('获取信息失败。');
        return;
      }

      const { displayItems, processedFiles } = processFileTree(trackData);
      if (processedFiles.length === 0) {
        await session.send('该作品无可下载文件。');
        return;
      }
      
      await this.sendWorkInfo(session, workInfo, displayItems, rjCode);
      await session.send(`请在 ${this.config.interactionTimeout} 秒内回复序号 (如 1 3-5 [模式]) 或 N 取消。模式可选card|file|zip`);
      
      const interactionKey = `${session.platform}:${session.userId}`;
      this.activeInteractions.add(interactionKey);

      const timer = setTimeout(() => {
        this.activeInteractions.delete(interactionKey);
        dispose();
        session.send('操作超时。');
      }, this.config.interactionTimeout * 1000);

      const dispose = this.ctx.middleware(async (midSession, next) => {
        if (midSession.userId !== session.userId || midSession.channelId !== session.channelId) return next();
        
        try {
          const choice = midSession.content.trim().toLowerCase();
          if (choice === 'n' || choice === '取消') {
            await midSession.send('操作已取消。');
            return;
          }
          
          const replyArgs = choice.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
          let mode: SendMode = null;
          if ([SendMode.CARD, SendMode.FILE, SendMode.ZIP].includes(replyArgs[replyArgs.length - 1] as any)) {
            mode = replyArgs.pop() as SendMode;
          }
          
          const uniqueIndices = parseTrackIndices(replyArgs);
          
          if (uniqueIndices.length === 0) {
            await midSession.send('输入无效，操作取消。');
            return;
          }
          
          await this.sender.processAndSendTracks(uniqueIndices, processedFiles, workInfo, midSession, mode || this.config.defaultSendMode);

        } catch (error) {
            this.logger.error('处理用户交互时发生错误: %o', error);
            await midSession.send('交互失败：内部错误。');
        } finally {
            this.activeInteractions.delete(interactionKey);
            dispose();
            clearTimeout(timer);
        }
      }, true);

    } catch (error) {
      if (this.ctx.http.isError(error) && error.response?.status === 404) {
        await session.send('未找到该作品。');
      } else {
        this.logger.error(error);
        await session.send('查询失败：内部错误。');
      }
    }
  }

  private async handleListInteraction(session: Session, page: number, fetcher: (p: number) => Promise<ApiSearchResponse>, listTitle: string, onNextPage: (s: Session, p: number) => Promise<void>) {
    const interactionKey = `${session.platform}:${session.userId}`;
    try {
      await session.send(`获取中... (${listTitle} - P${page})`);
      const data = await fetcher(page);

      if (!data?.works?.length) {
          await session.send(data?.pagination?.totalCount === 0 ? '未找到结果。' : '无更多结果。');
          this.activeInteractions.delete(interactionKey);
          return;
      }
      
      if (this.config.useImageMenu && this.ctx.puppeteer) {
        const html = this.renderer.createSearchHtml(data.works, listTitle, page, data.pagination.totalCount, this.config);
        const imageBuffer = await this.renderer.renderHtmlToImage(html);
        if (imageBuffer) await session.send(h.image(imageBuffer, 'image/png'));
        else await this.sendSearchTextResult(session, data, page);
      } else {
        await this.sendSearchTextResult(session, data, page);
      }

      await session.send(`请在 ${this.config.interactionTimeout} 秒内回复序号选择，F 翻页，N 取消。`);

      const timer = setTimeout(() => {
        this.activeInteractions.delete(interactionKey);
        dispose();
        session.send('操作超时。');
      }, this.config.interactionTimeout * 1000);

      const dispose = this.ctx.middleware(async (midSession, next) => {
        if (midSession.userId !== session.userId || midSession.channelId !== session.channelId) return next();
        
        const content = midSession.content.trim().toLowerCase();
        
        const choice = parseInt(content, 10);
        const localIndex = choice - (page - 1) * this.config.pageSize;
        const isChoiceInvalid = isNaN(choice) || localIndex < 1 || localIndex > data.works.length;
        
        if (content !== 'f' && content !== 'n' && content !== '取消' && isChoiceInvalid) {
            return next();
        }

        try {
            if (content === 'f') {
                onNextPage(midSession, page + 1);
                return;
            }
            if (content === 'n' || content === '取消') {
                await midSession.send('操作已取消。');
                return;
            }
            
            const selectedWork = data.works[localIndex - 1];
            this.handleWorkSelection(midSession, `RJ${String(selectedWork.id).padStart(8, '0')}`);

        } catch (error) {
            this.logger.error('处理列表交互时发生错误: %o', error);
            await midSession.send('交互失败：内部错误。');
        } finally {
            this.activeInteractions.delete(interactionKey);
            dispose();
            clearTimeout(timer);
        }
      }, true);
      
    } catch (error) {
      this.logger.error('获取列表时发生内部错误: %o', error);
      await session.send('列表获取失败：内部错误。');
      this.activeInteractions.delete(interactionKey);
    }
  }

  // sendWorkInfo 和 sendSearchTextResult 中的文本保持不变，因为它们是数据展示的主体，精简会导致信息丢失。
  // ... (sendWorkInfo, sendWorkInfoAsText, sendSearchTextResult 方法保持原样)
  private async sendWorkInfo(session: Session, workInfo: BaseWork, displayItems: DisplayItem[], rjCode: string) {
    if (this.config.useImageMenu && this.ctx.puppeteer) {
      let linksHtml = '';
      if (this.config.showLinks) {
        const asmrOneUrl = `https://asmr.one/work/${rjCode}`;
        linksHtml = `<div class="links"><span><strong>ASMR.one:</strong> <a href="${asmrOneUrl}">${h.escape(asmrOneUrl)}</a></span>${workInfo.source_url ? `<span><strong>DLsite:</strong> <a href="${workInfo.source_url}">${h.escape(workInfo.source_url)}</a></span>` : ''}</div>`;
      }
      const html = this.renderer.createWorkInfoHtml(workInfo, displayItems, linksHtml);
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