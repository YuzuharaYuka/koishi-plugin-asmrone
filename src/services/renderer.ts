// --- START OF FILE src/services/renderer.ts --- 

import { Context, h, Logger } from 'koishi'
import { BaseWork, WorkInfoResponse, DisplayItem } from '../common/types'
import { Config } from '../config' // <- Updated import path
import { formatWorkDuration } from '../common/utils'

export class Renderer {
  private logger: Logger
  
  constructor(private ctx: Context) {
    this.logger = ctx.logger('asmrone')
  }

  async renderHtmlToImage(html: string): Promise<Buffer | null> {
    if (!this.ctx.puppeteer) return null;
    let page;
    try {
      page = await this.ctx.puppeteer.page();
      await page.setViewport({ width: 840, height: 600, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const imageBuffer = await page.screenshot({ fullPage: true, type: 'png' });
      return imageBuffer;
    } catch (error) {
      this.logger.error('Puppeteer 渲染失败: %o', error);
      return null;
    } finally {
      if (page) await page.close();
    }
  }

  private getMenuStyle(): string {
    return `
      :root { --bg-color: #1e1e1e; --item-bg-color: #252526; --text-color: #e0e0e0; --text-light-color: #d0d0d0; --title-color: #9cdcfe; --accent-color: #4ec9b0; --highlight-color: #c586c0; --tag-bg-color: #3c3c3c; --tag-text-color: #d0d0d0; }
      body { background-color: var(--bg-color); color: var(--text-color); font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; margin: 0; padding: 20px; }
      .container { max-width: 800px; margin: auto; }
      .header { color: var(--accent-color); font-size: 24px; margin-bottom: 20px; text-align: center; }
    `;
  }

  createSearchHtml(works: BaseWork[], keyword: string, pageNum: number, total: number, config: Config): string {
    const worksHtml = works.map((work, index) => {
        const rjCode = `RJ${String(work.id).padStart(8, '0')}`;
        const cvs = work.vas.map(v => h.escape(v.name)).join(', ') || '未知';
        const tags = work.tags.slice(0, 20).map(t => `<span class="tag">${h.escape(t.name)}</span>`).join('');
        const duration = formatWorkDuration(work.duration);
        return `
          <div class="work-item">
            <div class="index">${(pageNum - 1) * config.pageSize + index + 1}</div>
            <div class="cover-container"><img src="${work.mainCoverUrl}" class="cover" /></div>
            <div class="info">
              <div class="title">【${rjCode}】${h.escape(work.title)}</div>
              <div class="details">
                <span><i class="icon">社团：🏢</i>${h.escape(work.name)}</span><span><i class="icon">声优：🎤</i>${cvs}</span>
                <span><i class="icon">评分：⭐️</i>${work.rate_average_2dp} (${work.rate_count})</span><span><i class="icon">销量：📥</i>${work.dl_count}</span>
                <span><i class="icon">日期：📅</i>${work.release}</span><span><i class="icon">时长：⏱️</i>${duration}</span>
              </div>
              <div class="tags">${tags}</div>
            </div>
          </div>`;
      }).join('');
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
        ${this.getMenuStyle()}
        .work-item { display: flex; align-items: center; background-color: var(--item-bg-color); border-radius: 8px; padding: 15px; margin-bottom: 15px; border-left: 4px solid var(--accent-color); }
        .index { font-size: 28px; font-weight: bold; color: var(--highlight-color); margin-right: 15px; align-self: center; }
        .cover-container { width: 160px; aspect-ratio: 560 / 420; border-radius: 6px; overflow: hidden; flex-shrink: 0; margin-right: 15px; }
        .cover { width: 100%; height: 100%; object-fit: cover; }
        .info { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; }
        .title { font-size: 18px; font-weight: bold; color: var(--title-color); margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .details { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 6px 15px; font-size: 14px; color: var(--text-light-color); margin-bottom: 8px; }
        .details span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .icon { font-style: normal; margin-right: 5px; }
        .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
        .tag { background-color: var(--tag-bg-color); color: var(--tag-text-color); padding: 3px 8px; border-radius: 4px; font-size: 12px; }
      </style></head><body>
        <div class="container">
          <div class="header">“${h.escape(keyword)}”的搜索结果 (第 ${pageNum} 页 / 共 ${total} 个)</div>
          ${worksHtml}
        </div></body></html>`;
  }
  
  createWorkInfoHtml(workInfo: WorkInfoResponse, displayItems: DisplayItem[], linksHtml: string): string {
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
    const cvs = workInfo.vas.map(v => h.escape(v.name)).join(', ') || '未知';
    const tags = workInfo.tags.map(t => `<span class="tag">${h.escape(t.name)}</span>`).join('');
    
    const fileIcons = {
      folder: '📁',
      audio: '🎵',
      image: '🖼️',
      video: '🎬',
      doc: '📄',
      subtitle: '📜',
      unknown: '❔'
    };

    const trackHtml = displayItems.map((item) => {
        const icon = fileIcons[item.type] || fileIcons.unknown;
        const indexHtml = item.fileIndex ? `<span class="track-index">${item.fileIndex}.</span>` : `<span class="track-index non-dl"></span>`;
        const itemClass = item.type === 'folder' ? 'folder-item' : 'file-item';

        return `<li class="${itemClass}" style="padding-left: ${item.depth * 25}px;">
                  <div class="track-title">
                    ${indexHtml}
                    <span class="track-icon">${icon}</span>
                    <span>${h.escape(item.title)}</span>
                  </div>
                  <div class="track-meta">${item.meta}</div>
                </li>`;
    }).join('');

    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
        ${this.getMenuStyle()}
        .work-info-container { max-width: 800px; margin: auto; background-color: var(--item-bg-color); border-radius: 8px; padding: 20px; }
        .title-header { text-align: center; margin-bottom: 20px; } .title { font-size: 24px; font-weight: bold; color: var(--title-color); }
        .work-content { display: flex; gap: 20px; align-items: flex-start; }
        .cover-container { width: 224px; aspect-ratio: 560 / 420; border-radius: 6px; overflow: hidden; flex-shrink: 0; background-size: cover; background-position: center; }
        .info { flex-grow: 1; min-width: 0; }
        .details { display: grid; grid-template-columns: 1fr; gap: 8px; font-size: 14px; color: var(--text-light-color); margin-bottom: 10px; }
        .links { display: grid; grid-template-columns: 1fr; gap: 8px; font-size: 13px; color: var(--text-light-color); margin-top: 10px; word-break: break-all; }
        .links a { color: var(--accent-color); text-decoration: none; }
        .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .tag { background-color: var(--tag-bg-color); color: var(--tag-text-color); padding: 3px 8px; border-radius: 4px; font-size: 12px; }
        .divider { border: 0; height: 1px; background-color: #444; margin: 20px 0; }
        .track-list h2 { font-size: 20px; color: var(--accent-color); margin-bottom: 10px; }
        .track-list ol { list-style: none; padding-left: 0; margin: 0; color: var(--text-color); font-size: 15px; }
        .track-list li { margin-bottom: 8px; display: flex; align-items: baseline; justify-content: space-between; border-left: 2px solid transparent; }
        .track-list li.folder-item { color: #a9d1ff; font-weight: bold; }
        .track-title { display: flex; align-items: baseline; min-width: 0; flex-grow: 1; }
        .track-title span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .track-index { font-weight: bold; color: var(--highlight-color); min-width: 30px; text-align: right; margin-right: 5px; }
        .track-index.non-dl { color: transparent; }
        .track-icon { margin-right: 8px; }
        .track-meta { color: var(--text-light-color); font-size: 13px; flex-shrink: 0; padding-left: 15px; }
      </style></head><body>
        <div class="work-info-container">
          <div class="title-header"><h1 class="title">【${rjCode}】${h.escape(workInfo.title)}</h1></div>
          <div class="work-content">
              <div class="cover-container" style="background-image: url('${workInfo.mainCoverUrl}')"></div>
              <div class="info">
                  <div class="details">
                      <span><strong>社团:🏢</strong> ${h.escape(workInfo.name)}</span><span><strong>声优:🎤</strong> ${cvs}</span><span><strong>日期:📅</strong> ${workInfo.release}</span>
                      <span><strong>评分:⭐️</strong> ${workInfo.rate_average_2dp} (${workInfo.rate_count}人)</span><span><strong>销量:📥</strong> ${workInfo.dl_count}</span>
                      <span><strong>时长:⏱️</strong> ${formatWorkDuration(workInfo.duration)}</span>
                  </div>
                  ${linksHtml}
                  <div class="tags">${tags}</div>
              </div>
          </div>
          <hr class="divider" />
          <div class="track-list"><h2>文件列表</h2><ol>${trackHtml}</ol></div>
        </div></body></html>`;
  }
}