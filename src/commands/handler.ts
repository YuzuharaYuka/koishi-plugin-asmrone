// --- START OF FILE src/commands/handler.ts ---

import { Context, Session, h, Logger, Element } from 'koishi'
import { createHash } from 'crypto'
import { ApiSearchResponse, BaseWork, DisplayItem, AdvancedSearchParams } from '../common/types'
import { Config } from '../config'
import { AsmrApi } from '../services/api'
import { Renderer } from '../services/renderer'
import { TrackSender } from '../services/sender'
import { InteractionManager } from '../services/interaction'
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
export const orderKeys = Object.keys(orderMap);

// 指令的业务逻辑处理中心，负责协调 API, Renderer, Sender 等服务并管理用户交互
export class CommandHandler {
  private logger: Logger
  // 用于记录当前正在进行交互的用户，防止同一用户同时触发多个操作
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

  // --- 前置检查方法 ---

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

  // --- 公共指令入口 ---

  async handlePopular(session: Session, page: number = 1) {
    if (!this.isAccessAllowed(session) || this.isInteractionActive(session)) return;

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

      const optionKeywords: SendMode[] = [SendMode.CARD, SendMode.FILE, SendMode.ZIP, SendMode.LINK, SendMode.PLAYER, SendMode.VOICE];
      let userOption: SendMode = null;

      const potentialOption = args[args.length - 1];
      if (optionKeywords.includes(potentialOption as SendMode)) {
        userOption = potentialOption as SendMode;
        args.pop();
      }

      const selectionArgs = args.slice(1);
      const uniqueIndices = parseTrackIndices(selectionArgs);

      if (uniqueIndices.length > 0) {
        // 如果用户直接提供了音轨号，则直接处理发送
        const rid = formattedRjCode.substring(2);
        const [workInfo, trackData] = await Promise.all([this.api.getWorkInfo(rid), this.api.getTracks(rid)]);
        if (!workInfo || !trackData) {
          await session.send('获取信息失败。');
          return;
        }
        const { processedFiles } = processFileTree(trackData);
        await this.sender.processAndSendTracks(uniqueIndices, processedFiles, workInfo, session, userOption || this.config.defaultSendMode);
      } else {
        // 否则，进入作品详情的交互流程
        await this.handleWorkSelection(session, formattedRjCode);
      }
    } catch (error) {
      this.logger.error(error);
      await session.send(`查询失败：${error.message}`);
    }
  }

  // --- 核心交互流程 ---

  // 处理作品列表的交互逻辑 (翻页、选择)
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
        return;
      }

      await this.sendSearchResult(session, data, page);

      await session.send(`请在 ${this.config.interactionTimeout} 秒内回复序号选择作品，[F]下一页，[P]上一页，[N]取消。`);

      const interaction = new InteractionManager(this.ctx, this.config, session);
      const userResponse = await interaction.waitForMessage();

      if (!userResponse) {
        session.send('操作超时，已取消。');
        return;
      }

      const content = userResponse.trim().toLowerCase();

      if (content === 'f') {
        onNextPage(session, page + 1);
      } else if (content === 'p') {
        if (page <= 1) {
          await session.send('已经是第一页了。');
          return;
        }
        onNextPage(session, page - 1);
      } else if (content === 'n' || content === '取消') {
        await session.send('操作已取消。');
      } else {
        const choice = parseInt(content, 10);
        const localIndex = choice - (page - 1) * this.config.pageSize;
        if (!isNaN(choice) && localIndex >= 1 && localIndex <= data.works.length) {
          const selectedWork = data.works[localIndex - 1];
          const onBack = () => this.handleListInteraction(session, page, fetcher, listTitle, onNextPage);
          await this.handleWorkSelection(session, `RJ${String(selectedWork.id).padStart(8, '0')}`, onBack);
        } else {
          await session.send('输入无效，操作已取消。');
        }
      }
    } catch (error) {
      this.logger.error('获取列表时发生错误: %o', error);
      await session.send(`列表获取失败：${error.message}`);
    } finally {
      this.activeInteractions.delete(interactionKey);
    }
  }

  // 处理单个作品详情的交互逻辑 (选择音轨、返回)
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
        return;
      }

      let promptMessage = `请在 ${this.config.interactionTimeout} 秒内回复序号进行收听，如 1 3-5 [模式](可选 card, file, zip, link, player, voice)，`;
      if (onBack) promptMessage += `[B]返回列表，`;
      promptMessage += `[N]取消。`;
      await session.send(promptMessage);

      const interaction = new InteractionManager(this.ctx, this.config, session);
      const userResponse = await interaction.waitForMessage();

      if (!userResponse) {
        session.send('操作超时，已取消。');
        return;
      }

      const choice = userResponse.trim().toLowerCase();
      if (choice === 'n' || choice === '取消') {
        await session.send('操作已取消。');
        return;
      }

      if ((choice === 'b' || choice === '返回') && onBack) {
        await session.send('正在返回列表...');
        await onBack();
        return;
      }

      const replyArgs = choice.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
      let mode: SendMode = null;
      if ([SendMode.CARD, SendMode.FILE, SendMode.ZIP, SendMode.LINK, SendMode.PLAYER, SendMode.VOICE].includes(replyArgs[replyArgs.length - 1] as any)) {
        mode = replyArgs.pop() as SendMode;
      }

      const uniqueIndices = parseTrackIndices(replyArgs);

      if (uniqueIndices.length === 0) {
        await session.send('输入无效，操作已取消。');
      } else {
        await this.sender.processAndSendTracks(uniqueIndices, processedFiles, workInfo, session, mode || this.config.defaultSendMode);
      }

    } catch (error) {
      this.logger.error(`获取作品 ${rjCode} 失败: %o`, error);
      await session.send(`查询失败：${error.message}`);
    } finally {
      this.activeInteractions.delete(interactionKey);
    }
  }

  // --- 数据解析与消息发送 ---

  // 解析复杂的搜索查询字符串
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

  // 发送作品详情，自动选择图片或文本模式
  private async sendWorkInfo(session: Session, workInfo: BaseWork, displayItems: DisplayItem[], rjCode: string) {
    if (this.config.useImageMenu && this.ctx.puppeteer) {
      const imageBuffer = await this.renderer.renderWithCache(rjCode, async () => {
        const coverDataUri = await this.api.downloadImageAsDataUri(workInfo.mainCoverUrl);
        const workInfoWithEmbeddedImage = { ...workInfo, mainCoverUrl: coverDataUri || workInfo.mainCoverUrl };
        return this.renderer.createWorkInfoHtml(workInfoWithEmbeddedImage, displayItems, '');
      });

      if (imageBuffer) {
        await session.send(h.image(imageBuffer, 'image/png'));
        return;
      }
    }
    // 如果图片模式失败，则回退到文本模式
    await this.sendWorkInfoAsText(session, workInfo, displayItems, rjCode);
  }

  // 优化：增强图片发送的可靠性
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

    const imageUri = await this.api.downloadImageAsDataUri(workInfo.mainCoverUrl);
    const imageElement = imageUri ? h.image(imageUri) : h('p', '封面加载失败');

    if (this.config.useForward && session.platform === 'onebot') {
      await session.send(h('figure', [
        h('message', { nickname: '作品详情' }, [imageElement, '\n' + infoBlock]),
        h('message', { nickname: '文件列表' }, fileListText)
      ]));
    } else {
      await session.send([imageElement, h('br'), infoBlock, h('br'), fileListText]);
    }
  }

  // 发送搜索结果，自动选择图片或文本模式
  private async sendSearchResult(session: Session, data: ApiSearchResponse, page: number) {
    // 优先使用图片菜单
    if (this.config.useImageMenu && this.ctx.puppeteer) {
      const keyString = JSON.stringify({ query: session.content, page }); // 使用原始消息和页码作为缓存键
      const cacheKey = createHash('sha256').update(keyString).digest('hex');

      const imageBuffer = await this.renderer.renderWithCache(cacheKey, async () => {
        const worksWithEmbeddedImages = await Promise.all(data.works.map(async (work) => {
          const dataUri = await this.api.downloadImageAsDataUri(work.mainCoverUrl);
          return { ...work, mainCoverUrl: dataUri || work.mainCoverUrl };
        }));
        return this.renderer.createSearchHtml(worksWithEmbeddedImages, session.content.replace(/ \d+$/, '').replace('搜音声 ', ''), page, data.pagination.totalCount);
      });

      if (imageBuffer) {
        await session.send(h.image(imageBuffer, 'image/png'));
        return;
      }
    }

    // 图片模式失败或未开启，则发送文本
    await this.sendSearchResultAsText(session, data, page);
  }

  // 优化：增强图片发送的可靠性
  private async sendSearchResultAsText(session: Session, data: ApiSearchResponse, page: number) {
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
        `   时长: ⏱️ ${formatWorkDuration(work.duration)}`,
        `   标签: 🏷️ ${h.escape(tags)}`,
      ].join('\n');
    }

    if (this.config.useForward && session.platform === 'onebot') {
      const messageNodes = [h('message', { nickname: session.bot.user?.name || session.bot.selfId }, header)];
      for (const [index, work] of data.works.entries()) {
        const entryText = buildEntryText(work, index);
        let content: (string | Element)[] = [entryText];
        if (this.config.showSearchImage) {
          const imageUri = await this.api.downloadImageAsDataUri(work.mainCoverUrl);
          const imageElement = imageUri ? h.image(imageUri) : h('p', '封面加载失败');
          content = [imageElement, h('br'), entryText];
        }
        messageNodes.push(h('message', { nickname: `结果 ${(page - 1) * this.config.pageSize + index + 1}` }, content));
      }
      await session.send(h('figure', messageNodes));
    } else {
      let messageElements: Element[] = [h('p', header)];
      for (const [index, work] of data.works.entries()) {
        messageElements.push(h('p', '─'.repeat(15)));
        if (this.config.showSearchImage) {
          const imageUri = await this.api.downloadImageAsDataUri(work.mainCoverUrl);
          const imageElement = imageUri ? h.image(imageUri) : h('p', '封面加载失败');
          messageElements.push(imageElement);
        }
        messageElements.push(h('p', buildEntryText(work, index)));
      }
      await session.send(h('message', messageElements));
    }
  }
}
// --- END OF FILE src/commands/handler.ts ---[]