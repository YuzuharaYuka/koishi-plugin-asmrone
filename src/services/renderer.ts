// --- START OF FILE src/services/renderer.ts --- 

import { Context, h, Logger } from 'koishi'
import * as PImage from 'pureimage'
import { PassThrough } from 'stream'
import { BaseWork, WorkInfoResponse, DisplayItem } from '../common/types'
import { Config } from '../config'
import { formatWorkDuration } from '../common/utils'

export class Renderer {
  private logger: Logger
  
  constructor(private ctx: Context, private config: Config) {
    this.logger = ctx.logger('asmrone')
  }

  async renderHtmlToImage(html: string): Promise<Buffer | null> {
    if (!this.ctx.puppeteer) return null;
    let page;
    try {
      page = await this.ctx.puppeteer.page();
      
      const scale = this.config.imageMenu?.imageRenderScale || 2;
      await page.setViewport({ width: 900, height: 600, deviceScaleFactor: scale });

      await page.setContent(html, { waitUntil: 'networkidle0' });
      const imageBuffer = await page.screenshot({ fullPage: true, type: 'png' });

      if (!this.config.imageMenu?.enableAntiCensorship) {
        return imageBuffer;
      }

      try {
        const bufferStream = new PassThrough();
        bufferStream.end(imageBuffer);
        const img = await PImage.decodePNGFromStream(bufferStream);

        const ctx = img.getContext('2d');
        const randomX = Math.floor(Math.random() * img.width);
        const randomY = Math.floor(Math.random() * img.height);
        const randomAlpha = Math.random() * 0.1;
        ctx.fillStyle = `rgba(0,0,0,${randomAlpha.toFixed(2)})`;
        ctx.fillRect(randomX, randomY, 1, 1);

        const passThrough = new PassThrough();
        const chunks: Buffer[] = [];
        passThrough.on('data', (chunk) => chunks.push(chunk));
        
        const finishPromise = new Promise<void>((resolve, reject) => {
            passThrough.on('end', resolve);
            passThrough.on('error', reject);
        });

        await PImage.encodePNGToStream(img, passThrough);
        await finishPromise;
        const processedImageBuffer = Buffer.concat(chunks);
        this.logger.info(`[Anti-Censorship] Image processed. Added noise at (${randomX}, ${randomY}).`);
        return processedImageBuffer;

      } catch (error) {
        this.logger.error('Error during image processing with pureimage: %o', error);
        return imageBuffer;
      }

    } catch (error) {
      this.logger.error('Puppeteer 渲染失败: %o', error);
      return null;
    } finally {
      if (page) await page.close();
    }
  }

  private getMenuStyle(): string {
    const { imageMenu } = this.config;
    const {
        backgroundColor, itemBackgroundColor, textColor, titleColor, accentColor, highlightColor
    } = imageMenu || {};

    const safeBackgroundColor = backgroundColor || '#1e1e1e';
    const safeItemBgColor = itemBackgroundColor || '#252526';
    const safeTextColor = textColor || '#f0f0f0';
    const safeTitleColor = titleColor || '#9cdcfe';
    const safeAccentColor = accentColor || '#4ec9b0';
    const safeHighlightColor = highlightColor || '#c586c0';
    
    const tagBgColor = '#3c3c3c';
    const tagTextColor = '#d0d0d0';

    return `
      :root { 
        --bg-color: ${h.escape(safeBackgroundColor)}; 
        --item-bg-color: ${h.escape(safeItemBgColor)}; 
        --text-color: ${h.escape(safeTextColor)}; 
        --text-light-color: ${h.escape(safeTextColor)}d0;
        --title-color: ${h.escape(safeTitleColor)}; 
        --accent-color: ${h.escape(safeAccentColor)}; 
        --highlight-color: ${h.escape(safeHighlightColor)}; 
        --tag-bg-color: ${tagBgColor}; 
        --tag-text-color: ${tagTextColor}; 
      }
      body { background-color: var(--bg-color); color: var(--text-color); font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; margin: 0; padding: 20px; box-sizing: border-box;}
      .container { max-width: 860px; margin: auto; }
      .header { color: var(--accent-color); font-size: 24px; margin-bottom: 20px; text-align: center; }
    `;
  }

  createSearchHtml(works: BaseWork[], keyword: string, pageNum: number, total: number): string {
    const worksHtml = works.map((work, index) => {
        const rjCode = `RJ${String(work.id).padStart(8, '0')}`;
        const cvs = work.vas.map(v => h.escape(v.name)).join(', ') || '未知';
        const tags = work.tags.slice(0, 20).map(t => `<span class="tag">${h.escape(t.name)}</span>`).join('');
        const duration = formatWorkDuration(work.duration);
        return `
          <div class="work-item">
            <div class="index">${(pageNum - 1) * this.config.pageSize + index + 1}</div>
            <div class="cover-container"><img src="${work.mainCoverUrl}" class="cover" /></div>
            <div class="info">
              <div class="title">${h.escape(rjCode)} ${h.escape(work.title)}</div>
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
        .index { font-size: 28px; font-weight: bold; color: var(--highlight-color); margin-right: 20px; align-self: center; }
        .cover-container { width: 200px; aspect-ratio: 560 / 420; border-radius: 6px; overflow: hidden; flex-shrink: 0; margin-right: 20px; }
        .cover { width: 100%; height: 100%; object-fit: cover; }
        .info { display: flex; flex-direction: column; flex-grow: 1; min-width: 0; }
        .title { font-size: 20px; font-weight: bold; color: var(--title-color); margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .details { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px 18px; font-size: 16px; color: var(--text-light-color); margin-bottom: 10px; }
        .details span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .icon { font-style: normal; margin-right: 5px; }
        .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
        .tag { background-color: var(--tag-bg-color); color: var(--tag-text-color); padding: 4px 9px; border-radius: 4px; font-size: 13px; }
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
    
    const fileIcons = { folder: '📁', audio: '🎵', image: '🖼️', video: '🎬', doc: '📄', subtitle: '📜', unknown: '❔' };

    const trackHtml = displayItems.map((item) => {
        const icon = fileIcons[item.type] || fileIcons.unknown;
        const indexHtml = item.fileIndex ? `<span class="track-index">${item.fileIndex}.</span>` : `<span class="track-index non-dl"></span>`;
        const itemClass = item.type === 'folder' ? 'folder-item' : 'file-item';
        return `<li class="${itemClass}" style="padding-left: ${item.depth * 25}px;">
                  <div class="track-title"> ${indexHtml} <span class="track-icon">${icon}</span> <span>${h.escape(item.title)}</span> </div>
                  <div class="track-meta">${item.meta}</div>
                </li>`;
    }).join('');

    const detailsHtml = `
      <div class="detail-item"><strong>社团:</strong> 🏢 ${h.escape(workInfo.name)}</div>
      <div class="detail-item"><strong>声优:</strong> 🎤 ${cvs}</div>
      <div class="detail-item"><strong>日期:</strong> 📅 ${workInfo.release}</div>
      <div class="detail-item"><strong>评分:</strong> ⭐️ ${workInfo.rate_average_2dp} (${workInfo.rate_count}人)</div>
      <div class="detail-item"><strong>销量:</strong> 📥 ${workInfo.dl_count}</div>
      <div class="detail-item"><strong>时长:</strong> ⏱️ ${formatWorkDuration(workInfo.duration)}</div>
    `;

    const finalLinksHtml = (this.config.showLinks) ? `
      <div class="detail-item"><strong>ASMR.one:</strong> <a href="https://asmr.one/work/${rjCode}">https://asmr.one/work/${rjCode}</a></div>
      ${workInfo.source_url ? `<div class="detail-item"><strong>DLsite:</strong> <a href="${workInfo.source_url}">${h.escape(workInfo.source_url)}</a></div>` : ''}
    ` : '';

    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
        ${this.getMenuStyle()}
        .work-info-container { max-width: 860px; margin: auto; background-color: var(--item-bg-color); border-radius: 8px; padding: 30px; }
        
        .rj-code { font-size: 30px; font-weight: bold; color: var(--title-color); margin-bottom: 8px; text-align: left; }
        .title { font-size: 30px; font-weight: bold; color: var(--title-color); text-align: left; margin-bottom: 25px; }
        
        .cover-container { width: 100%; aspect-ratio: 560 / 420; border-radius: 8px; overflow: hidden; margin: 0 auto 25px auto; background-size: cover; background-position: center; }
        
        .info-block { text-align: left; }
        .detail-item { font-size: 18px; color: var(--text-light-color); margin-bottom: 12px; }
        .detail-item strong { color: var(--text-color); }
        .detail-item a { color: var(--accent-color); text-decoration: none; word-break: break-all; }
        
        .tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
        .tag { background-color: var(--tag-bg-color); color: var(--tag-text-color); padding: 5px 12px; border-radius: 5px; font-size: 16px; }
        
        .divider { border: 0; height: 1px; background-color: #444; margin: 30px 0; }
        .track-list h2 { font-size: 24px; color: var(--accent-color); margin-bottom: 15px; }
        .track-list ol { list-style: none; padding-left: 0; margin: 0; color: var(--text-color); font-size: 18px; }
        .track-list li { margin-bottom: 12px; display: flex; align-items: baseline; justify-content: space-between; }
        .track-list li.folder-item { color: #a9d1ff; font-weight: bold; }
        .track-title { display: flex; align-items: baseline; min-width: 0; flex-grow: 1; }
        .track-title span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .track-index { font-weight: bold; color: var(--highlight-color); min-width: 35px; text-align: right; margin-right: 8px; flex-shrink: 0; }
        .track-index.non-dl { color: transparent; }
        .track-icon { margin-right: 10px; }
        .track-meta { color: var(--text-light-color); font-size: 16px; flex-shrink: 0; padding-left: 15px; }
      </style></head><body>
        <div class="work-info-container">
          <div class="rj-code">${h.escape(rjCode)}</div>
          <h1 class="title">${h.escape(workInfo.title)}</h1>
          
          <div class="cover-container" style="background-image: url('${workInfo.mainCoverUrl}')"></div>

          <div class="info-block">
              ${detailsHtml}
              ${finalLinksHtml}
              <div class="tags">${tags}</div>
          </div>
          
          <hr class="divider" />
          <div class="track-list"><h2>文件列表</h2><ol>${trackHtml}</ol></div>
        </div></body></html>`;
  }
}