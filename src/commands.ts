import { Context, Session, h, Logger, Element } from 'koishi'
import { Config, SendMode } from './config'
import { ApiSearchResponse, BaseWork } from './types'
import { AsmrApi } from './api'
import { Renderer } from './renderer'
import { TrackSender } from './sender'
import { flattenTracks, formatRjCode, formatWorkDuration } from './utils'

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
    if (this.config.accessMode === 'whitelist') return this.config.whitelist.includes(session.guildId);
    if (this.config.accessMode === 'blacklist') return !this.config.blacklist.includes(session.guildId);
    return true;
  }

  isInteractionActive(session: Session): boolean {
    const interactionKey = `${session.platform}:${session.userId}`;
    if (this.activeInteractions.has(interactionKey)) {
      session.send('您当前有另一个操作正在进行中，请先完成或等待它超时。');
      return true;
    }
    return false;
  }
  
  // -- Command Implementations --

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
    if (!query) return session.send('请输入搜索关键词！');
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
    if (!query) return session.send('请输入 RJ 号！');
    if (this.isInteractionActive(session)) return;

    const args = query.trim().split(/\s+/).filter(Boolean);
    const formattedRjCode = formatRjCode(args[0]);
    if (!formattedRjCode) return session.send('输入的RJ号格式不正确。');
    
    const optionKeywords: SendMode[] = ['card', 'file', 'zip'];
    let userOption: SendMode = null;
    
    const potentialOption = args[args.length - 1];
    if (optionKeywords.includes(potentialOption as SendMode)) {
      userOption = potentialOption as SendMode;
      args.pop();
    }
    const trackIndices = args.slice(1).map(arg => parseInt(arg, 10)).filter(num => !isNaN(num) && num > 0);
    
    if (trackIndices.length > 0) {
      const rid = formattedRjCode.substring(2);
      try {
          const [workInfo, trackData] = await Promise.all([this.api.getWorkInfo(rid), this.api.getTracks(rid)]);
          if (!workInfo || !trackData) return session.send('获取音声信息失败。');
          const allTracks = flattenTracks(trackData);
          await this.sender.processAndSendTracks(trackIndices, allTracks, workInfo, session, userOption || this.config.defaultSendMode);
      } catch (error) {
          if (this.ctx.http.isError(error) && error.response?.status === 404) { return session.send('未找到该 RJ 号对应的音声信息。'); }
          this.logger.error(error);
          return session.send('查询时发生内部错误。');
      }
    } else {
      await this.handleWorkSelection(session, formattedRjCode);
    }
  }

  // -- Interaction Handlers --

  private async handleWorkSelection(session: Session, rjCode: string) {
    const rid = rjCode.substring(2);
    try {
      await session.send(`正在查询音声 ${rjCode} 的信息...`);
      const [workInfo, trackData] = await Promise.all([this.api.getWorkInfo(rid), this.api.getTracks(rid)]);
      if (!workInfo || !trackData) return await session.send('获取音声信息失败。');

      const allTracks = flattenTracks(trackData);
      if (allTracks.length === 0) return await session.send('未获取到任何有效音轨。');
      
      await this.sendWorkInfo(session, workInfo, allTracks, rjCode);
      
      await session.send(`请在60秒内回复【序号】选择音轨，或回复【n/取消】退出。\n可附加 card | file | zip 选项，例如 "1 2 3 card"`);
      
      const interactionKey = `${session.platform}:${session.userId}`;
      this.activeInteractions.add(interactionKey);

      const dispose = this.ctx.middleware(async (midSession, next) => {
        if (midSession.userId !== session.userId || midSession.channelId !== session.channelId) return next();
        
        const choice = midSession.content.trim().toLowerCase();
        if (choice === 'n' || choice === '取消') {
          this.activeInteractions.delete(interactionKey);
          dispose();
          clearTimeout(timer);
          // *** MODIFICATION START: Corrected return logic ***
          await midSession.send('操作已取消。');
          return;
          // *** MODIFICATION END ***
        }

        this.activeInteractions.delete(interactionKey);
        dispose();
        clearTimeout(timer);
        
        const replyArgs = choice.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
        let mode: SendMode = null;
        if (['card', 'file', 'zip'].includes(replyArgs[replyArgs.length - 1])) {
          mode = replyArgs.pop() as SendMode;
        }
        
        const indices = [...new Set(replyArgs.map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0))];
        if (indices.length === 0) return await midSession.send('输入无效，请输入有效的音轨序号。');
        
        await this.sender.processAndSendTracks(indices, allTracks, workInfo, midSession, mode || this.config.defaultSendMode);
      }, true);

      const timer = setTimeout(() => {
        this.activeInteractions.delete(interactionKey);
        dispose();
        session.send('选择超时，操作已自动取消。');
      }, 60000);

    } catch (error) {
      if (this.ctx.http.isError(error) && error.response?.status === 404) { await session.send('未找到该 RJ 号对应的音声信息。'); } 
      else { this.logger.error(error); await session.send('查询时发生内部错误。'); }
    }
  }

  private async handleListInteraction(session: Session, page: number, fetcher: (p: number) => Promise<ApiSearchResponse>, listTitle: string, onNextPage: (s: Session, p: number) => Promise<void>) {
    const interactionKey = `${session.platform}:${session.userId}`;
    try {
      await session.send(`正在获取“${listTitle}”列表，第 ${page} 页...`);
      const data = await fetcher(page);

      if (!data?.works?.length) {
          await session.send(data?.pagination?.totalCount === 0 ? '列表为空。' : '当前页无结果。');
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

      await session.send('请直接回复【序号】选择作品，回复【f】翻页，或回复【n/取消】退出。');

      const dispose = this.ctx.middleware(async (midSession, next) => {
        if (midSession.userId !== session.userId || midSession.channelId !== session.channelId) return next();
        
        const content = midSession.content.trim().toLowerCase();
        if (content === 'f') {
            dispose(); clearTimeout(timer);
            await onNextPage(midSession, page + 1);
            return;
        }
        if (content === 'n' || content === '取消') {
            this.activeInteractions.delete(interactionKey);
            dispose();
            clearTimeout(timer);
            await midSession.send('操作已取消。');
            return;
        }
        
        const choice = parseInt(content, 10);
        const localIndex = choice - (page - 1) * this.config.pageSize;
        if (isNaN(choice) || localIndex < 1 || localIndex > data.works.length) return next();
        
        this.activeInteractions.delete(interactionKey);
        dispose();
        clearTimeout(timer);
        
        const selectedWork = data.works[localIndex - 1];
        await this.handleWorkSelection(midSession, `RJ${String(selectedWork.id).padStart(8, '0')}`);
      }, true);

      const timer = setTimeout(() => {
        this.activeInteractions.delete(interactionKey);
        dispose();
        session.send('选择超时，操作已自动取消。');
      }, 60000);

    } catch (error) {
      this.logger.error('获取列表时发生内部错误: %o', error);
      await session.send('获取列表时发生内部错误。');
      this.activeInteractions.delete(interactionKey);
    }
  }

  private async sendWorkInfo(session: Session, workInfo: BaseWork, allTracks: any[], rjCode: string) {
    if (this.config.useImageMenu && this.ctx.puppeteer) {
      let linksHtml = '';
      if (this.config.showLinks) {
        const asmrOneUrl = `https://asmr.one/work/${rjCode}`;
        linksHtml = `<div class="links"><span><strong>ASMR.one:</strong> <a href="${asmrOneUrl}">${h.escape(asmrOneUrl)}</a></span>${workInfo.source_url ? `<span><strong>DLsite:</strong> <a href="${workInfo.source_url}">${h.escape(workInfo.source_url)}</a></span>` : ''}</div>`;
      }
      const html = this.renderer.createWorkInfoHtml(workInfo, allTracks, linksHtml);
      const imageBuffer = await this.renderer.renderHtmlToImage(html);
      if (imageBuffer) return await session.send(h.image(imageBuffer, 'image/png'));
    }
    await this.sendWorkInfoAsText(session, workInfo, allTracks, rjCode);
  }

  private async sendWorkInfoAsText(session: Session, workInfo: BaseWork, allTracks: any[], rjCode: string) {
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
    const trackListText = `--- 音轨列表 ---\n` + allTracks.map((t, i) => `${i + 1}. ${h.escape(t.title)}`).join('\n');

    if (this.config.useForward && session.platform === 'onebot') {
      const imageUri = await this.api.downloadImageAsDataUri(workInfo.mainCoverUrl);
      const imageElement = imageUri ? h.image(imageUri) : h('p', '封面加载失败');
      await session.send(h('figure', [
          h('message', { nickname: '作品详情' }, [imageElement, '\n' + infoBlock]),
          h('message', { nickname: '音轨列表' }, trackListText)
      ]));
    } else {
      await session.send([h.image(workInfo.mainCoverUrl), infoBlock, trackListText].join('\n\n'));
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