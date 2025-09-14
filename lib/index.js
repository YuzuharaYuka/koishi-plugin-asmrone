var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  usage: () => usage
});
module.exports = __toCommonJS(index_exports);
var import_koishi5 = require("koishi");
var import_fs2 = require("fs");
var import_path2 = require("path");
var import_archiver2 = __toESM(require("archiver"));

// src/services/api.ts
var AsmrApi = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    if (this.config.apiBaseUrl && !this.config.apiBaseUrl.endsWith("/api")) {
      if (this.config.apiBaseUrl.endsWith("/")) {
        this.config.apiBaseUrl += "api";
      } else {
        this.config.apiBaseUrl += "/api";
      }
      this.ctx.logger("asmrone").info(`自定义 API 地址已自动修正为: ${this.config.apiBaseUrl}`);
    }
    setInterval(() => this.cleanExpiredCache(), 5 * 60 * 1e3);
  }
  static {
    __name(this, "AsmrApi");
  }
  requestOptions = {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0" }
  };
  cache = /* @__PURE__ */ new Map();
  cleanExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        this.cache.delete(key);
      }
    }
  }
  async _fetchAndCache(key, fetcher, ttl = 5 * 60 * 1e3) {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      if (this.config.debug) this.ctx.logger("asmrone").info(`[Cache] HIT for key: ${key}`);
      return cached.data;
    }
    if (this.config.debug) this.ctx.logger("asmrone").info(`[Cache] MISS for key: ${key}`);
    const data = await fetcher();
    this.cache.set(key, { data, expires: Date.now() + ttl });
    return data;
  }
  async _requestWithRetry(url, method, payload) {
    let lastError = null;
    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        if (this.config.debug) this.ctx.logger("asmrone").info(`[Debug] API Request URL: ${url}`);
        const response = method === "post" ? await this.ctx.http.post(url, payload, this.requestOptions) : await this.ctx.http.get(url, this.requestOptions);
        if (this.config.debug) {
          this.ctx.logger("asmrone").info(`[Debug] API Response (Attempt ${i + 1}):
${JSON.stringify(response, null, 2)}`);
        }
        return response;
      } catch (error) {
        lastError = error;
        this.ctx.logger("asmrone").warn(`API request to ${url} failed on attempt ${i + 1}/${this.config.maxRetries}. Retrying...`);
        if (i < this.config.maxRetries - 1) {
          await new Promise((res) => setTimeout(res, 1500));
        }
      }
    }
    let finalError = new Error(`API 请求失败 (共 ${this.config.maxRetries} 次尝试)。`);
    if (this.ctx.http.isError(lastError)) {
      const status = lastError.response?.status;
      if (status) {
        if (status === 404) {
          finalError = new Error("资源未找到 (404)，请检查 RJ 号是否正确。");
        } else if (status >= 500) {
          finalError = new Error(`API 服务器内部错误 (${status})，请稍后再试。`);
        } else {
          finalError = new Error(`API 请求时发生 HTTP 错误 (状态码: ${status})。`);
        }
      } else if (lastError.code === "ETIMEDOUT" || lastError.code === "ECONNABORTED") {
        finalError = new Error("API 请求超时，请检查网络连接或相关超时配置。");
      } else if (lastError.code === "ECONNREFUSED" || lastError.code === "ENOTFOUND") {
        finalError = new Error(`无法连接到 API 服务器，请检查 apiBaseUrl 配置 (${this.config.apiBaseUrl}) 或您的网络连接。`);
      }
    }
    this.ctx.logger("asmrone").error(finalError.message);
    throw finalError;
  }
  async search(keyword, page, order, sort) {
    const keywordForApi = keyword.trim();
    const params = new URLSearchParams({
      order: order || "dl_count",
      sort: sort || "desc",
      page: String(page),
      pageSize: String(this.config.pageSize),
      subtitle: "0",
      includeTranslationWorks: "true"
    });
    const url = `${this.config.apiBaseUrl}/search/${encodeURIComponent(keywordForApi)}?${params.toString()}`;
    return this._requestWithRetry(url, "get");
  }
  async getPopular(page) {
    const payload = {
      keyword: " ",
      page,
      pageSize: this.config.pageSize,
      subtitle: 0,
      localSubtitledWorks: [],
      withPlaylistStatus: []
    };
    const url = `${this.config.apiBaseUrl}/recommender/popular`;
    return this._requestWithRetry(url, "post", payload);
  }
  async getWorkInfo(rid) {
    const cacheKey = `workInfo:${rid}`;
    return this._fetchAndCache(cacheKey, () => {
      const url = `${this.config.apiBaseUrl}/workInfo/${rid}`;
      return this._requestWithRetry(url, "get");
    });
  }
  async getTracks(rid) {
    const cacheKey = `tracks:${rid}`;
    return this._fetchAndCache(cacheKey, () => {
      const url = `${this.config.apiBaseUrl}/tracks/${rid}`;
      return this._requestWithRetry(url, "get");
    });
  }
  async downloadImageAsDataUri(url) {
    const cacheKey = `imgDataUri:${url}`;
    return this._fetchAndCache(cacheKey, async () => {
      for (let i = 0; i < this.config.maxRetries; i++) {
        try {
          const buffer = await this.ctx.http.get(url, { ...this.requestOptions, responseType: "arraybuffer", timeout: 15e3 });
          const base64 = Buffer.from(buffer).toString("base64");
          const mime = url.includes(".png") ? "image/png" : "image/jpeg";
          return `data:${mime};base64,${base64}`;
        } catch (error) {
          this.ctx.logger("asmrone").warn(`下载封面图片失败 %s (Attempt ${i + 1}/${this.config.maxRetries}): %o`, url, error);
          if (i < this.config.maxRetries - 1) {
            await new Promise((res) => setTimeout(res, 1e3));
          }
        }
      }
      this.ctx.logger("asmrone").error(`下载封面图片失败 %s after ${this.config.maxRetries} attempts.`, url);
      return null;
    }, 60 * 60 * 1e3);
  }
};

// src/services/renderer.ts
var import_koishi = require("koishi");
var PImage = __toESM(require("pureimage"));
var import_stream = require("stream");

// src/common/utils.ts
function formatRjCode(rjInput) {
  if (!rjInput) return null;
  const numericPart = rjInput.replace(/^RJ/i, "");
  if (!/^\d+$/.test(numericPart)) {
    return null;
  }
  return "RJ" + numericPart.padStart(8, "0");
}
__name(formatRjCode, "formatRjCode");
function formatWorkDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return "未知";
  const h4 = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.round(seconds % 60);
  let result = "";
  if (h4 > 0) result += `${h4}小时`;
  if (m > 0 || h4 > 0) result += `${m}分`;
  result += `${s}秒`;
  return result;
}
__name(formatWorkDuration, "formatWorkDuration");
function formatTrackDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return "";
  const h4 = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.round(seconds % 60);
  const pad = /* @__PURE__ */ __name((n) => n.toString().padStart(2, "0"), "pad");
  if (h4 > 0) return `${h4}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
__name(formatTrackDuration, "formatTrackDuration");
function formatTrackSize(bytes) {
  if (isNaN(bytes) || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) {
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }
  return `${mb.toFixed(2)} MB`;
}
__name(formatTrackSize, "formatTrackSize");
function parseTrackIndices(args) {
  const indices = [];
  for (const arg of args) {
    if (arg.includes("-")) {
      const [start, end] = arg.split("-").map((n) => parseInt(n, 10));
      if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
        for (let i = start; i <= end; i++) {
          indices.push(i);
        }
      }
    } else {
      const num = parseInt(arg, 10);
      if (!isNaN(num) && num > 0) {
        indices.push(num);
      }
    }
  }
  return [...new Set(indices)].sort((a, b) => a - b);
}
__name(parseTrackIndices, "parseTrackIndices");
var getSafeFilename = /* @__PURE__ */ __name((name2) => name2.replace(/[\/\\?%*:|"<>]/g, "_"), "getSafeFilename");
var getZipFilename = /* @__PURE__ */ __name((baseName) => `${baseName.replace(/[\/\\?%*:|"<>]/g, "_")}.zip`, "getZipFilename");
function processFileTree(items) {
  const displayItems = [];
  const processedFiles = [];
  let fileCounter = 0;
  function getFileType(item) {
    switch (item.type) {
      case "folder":
        return "folder";
      case "audio":
        return "audio";
      case "image":
        return "image";
      case "text":
        return "subtitle";
    }
    const title = item.title.toLowerCase();
    if (/\.(mp4|mov|avi|mkv|webm)$/.test(title)) return "video";
    if (/\.(jpg|jpeg|png|gif|webp)$/.test(title)) return "image";
    if (/\.(mp3|wav|flac|m4a|ogg)$/.test(title)) return "audio";
    if (/\.(pdf|doc|docx)$/.test(title)) return "doc";
    if (/\.(txt|vtt|srt|ass)$/.test(title)) return "subtitle";
    return "unknown";
  }
  __name(getFileType, "getFileType");
  const sorter = /* @__PURE__ */ __name((a, b) => {
    const typePriority = {
      audio: 0,
      video: 1,
      image: 2,
      subtitle: 3,
      doc: 4,
      unknown: 5,
      folder: 6
    };
    const typeA = getFileType(a);
    const typeB = getFileType(b);
    const priorityA = typePriority[typeA];
    const priorityB = typePriority[typeB];
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return a.title.localeCompare(b.title, void 0, { numeric: true, sensitivity: "base" });
  }, "sorter");
  function traverse(item, depth, currentPath) {
    const fileType = getFileType(item);
    const isDownloadable = !!item.mediaDownloadUrl;
    const safeTitle = getSafeFilename(item.title);
    const newPath = currentPath ? `${currentPath}/${safeTitle}` : safeTitle;
    displayItems.push({
      title: item.title,
      type: fileType,
      depth,
      fileIndex: isDownloadable ? ++fileCounter : null,
      meta: [
        item.duration ? formatTrackDuration(item.duration) : null,
        item.size ? formatTrackSize(item.size) : null
      ].filter(Boolean).join(" | ")
    });
    if (isDownloadable) {
      processedFiles.push({
        title: item.title,
        path: newPath,
        url: item.mediaDownloadUrl,
        type: fileType,
        duration: item.duration,
        size: item.size
      });
    }
    if (item.type === "folder" && item.children) {
      item.children.sort(sorter);
      item.children.forEach((child) => traverse(child, depth + 1, newPath));
    }
  }
  __name(traverse, "traverse");
  items.sort(sorter);
  items.forEach((item) => traverse(item, 0, ""));
  return { displayItems, processedFiles };
}
__name(processFileTree, "processFileTree");

// src/services/renderer.ts
var Renderer = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger("asmrone");
  }
  static {
    __name(this, "Renderer");
  }
  logger;
  async renderHtmlToImage(html) {
    if (!this.ctx.puppeteer) return null;
    let page;
    try {
      page = await this.ctx.puppeteer.page();
      const scale = this.config.imageMenu?.imageRenderScale || 2;
      await page.setViewport({ width: 900, height: 600, deviceScaleFactor: scale });
      await page.setContent(html, { waitUntil: "networkidle0" });
      const imageBuffer = await page.screenshot({ fullPage: true, type: "png" });
      if (!this.config.imageMenu?.enableAntiCensorship) {
        return imageBuffer;
      }
      try {
        const bufferStream = new import_stream.PassThrough();
        bufferStream.end(imageBuffer);
        const img = await PImage.decodePNGFromStream(bufferStream);
        const ctx = img.getContext("2d");
        const randomX = Math.floor(Math.random() * img.width);
        const randomY = Math.floor(Math.random() * img.height);
        const randomAlpha = Math.random() * 0.1;
        ctx.fillStyle = `rgba(0,0,0,${randomAlpha.toFixed(2)})`;
        ctx.fillRect(randomX, randomY, 1, 1);
        const passThrough = new import_stream.PassThrough();
        const chunks = [];
        passThrough.on("data", (chunk) => chunks.push(chunk));
        const finishPromise = new Promise((resolve3, reject) => {
          passThrough.on("end", resolve3);
          passThrough.on("error", reject);
        });
        await PImage.encodePNGToStream(img, passThrough);
        await finishPromise;
        const processedImageBuffer = Buffer.concat(chunks);
        this.logger.info(`[Anti-Censorship] Image processed. Added noise at (${randomX}, ${randomY}).`);
        return processedImageBuffer;
      } catch (error) {
        this.logger.error("Error during image processing with pureimage: %o", error);
        return imageBuffer;
      }
    } catch (error) {
      this.logger.error("Puppeteer 渲染失败: %o", error);
      return null;
    } finally {
      if (page) await page.close();
    }
  }
  getMenuStyle() {
    const { imageMenu } = this.config;
    const {
      backgroundColor,
      itemBackgroundColor,
      textColor,
      titleColor,
      accentColor,
      highlightColor
    } = imageMenu || {};
    const safeBackgroundColor = backgroundColor || "#1e1e1e";
    const safeItemBgColor = itemBackgroundColor || "#252526";
    const safeTextColor = textColor || "#f0f0f0";
    const safeTitleColor = titleColor || "#9cdcfe";
    const safeAccentColor = accentColor || "#4ec9b0";
    const safeHighlightColor = highlightColor || "#c586c0";
    const tagBgColor = "#3c3c3c";
    const tagTextColor = "#d0d0d0";
    return `
      :root { 
        --bg-color: ${import_koishi.h.escape(safeBackgroundColor)}; 
        --item-bg-color: ${import_koishi.h.escape(safeItemBgColor)}; 
        --text-color: ${import_koishi.h.escape(safeTextColor)}; 
        --text-light-color: ${import_koishi.h.escape(safeTextColor)}d0;
        --title-color: ${import_koishi.h.escape(safeTitleColor)}; 
        --accent-color: ${import_koishi.h.escape(safeAccentColor)}; 
        --highlight-color: ${import_koishi.h.escape(safeHighlightColor)}; 
        --tag-bg-color: ${tagBgColor}; 
        --tag-text-color: ${tagTextColor}; 
      }
      body { background-color: var(--bg-color); color: var(--text-color); font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; margin: 0; padding: 20px; box-sizing: border-box;}
      .container { max-width: 860px; margin: auto; }
      .header { color: var(--accent-color); font-size: 24px; margin-bottom: 20px; text-align: center; }
    `;
  }
  createSearchHtml(works, keyword, pageNum, total) {
    const worksHtml = works.map((work, index) => {
      const rjCode = `RJ${String(work.id).padStart(8, "0")}`;
      const cvs = work.vas.map((v) => import_koishi.h.escape(v.name)).join(", ") || "未知";
      const tags = work.tags.slice(0, 20).map((t) => `<span class="tag">${import_koishi.h.escape(t.name)}</span>`).join("");
      const duration = formatWorkDuration(work.duration);
      return `
          <div class="work-item">
            <div class="index">${(pageNum - 1) * this.config.pageSize + index + 1}</div>
            <div class="cover-container"><img src="${work.mainCoverUrl}" class="cover" /></div>
            <div class="info">
              <div class="title">${import_koishi.h.escape(rjCode)} ${import_koishi.h.escape(work.title)}</div>
              <div class="details">
                <span><i class="icon">社团：🏢</i>${import_koishi.h.escape(work.name)}</span><span><i class="icon">声优：🎤</i>${cvs}</span>
                <span><i class="icon">评分：⭐️</i>${work.rate_average_2dp} (${work.rate_count})</span><span><i class="icon">销量：📥</i>${work.dl_count}</span>
                <span><i class="icon">日期：📅</i>${work.release}</span><span><i class="icon">时长：⏱️</i>${duration}</span>
              </div>
              <div class="tags">${tags}</div>
            </div>
          </div>`;
    }).join("");
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
          <div class="header">“${import_koishi.h.escape(keyword)}”的搜索结果 (第 ${pageNum} 页 / 共 ${total} 个)</div>
          ${worksHtml}
        </div></body></html>`;
  }
  createWorkInfoHtml(workInfo, displayItems, linksHtml) {
    const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
    const cvs = workInfo.vas.map((v) => import_koishi.h.escape(v.name)).join(", ") || "未知";
    const tags = workInfo.tags.map((t) => `<span class="tag">${import_koishi.h.escape(t.name)}</span>`).join("");
    const fileIcons = { folder: "📁", audio: "🎵", image: "🖼️", video: "🎬", doc: "📄", subtitle: "📜", unknown: "❔" };
    const trackHtml = displayItems.map((item) => {
      const icon = fileIcons[item.type] || fileIcons.unknown;
      const indexHtml = item.fileIndex ? `<span class="track-index">${item.fileIndex}.</span>` : `<span class="track-index non-dl"></span>`;
      const itemClass = item.type === "folder" ? "folder-item" : "file-item";
      return `<li class="${itemClass}" style="padding-left: ${item.depth * 25}px;">
                  <div class="track-title"> ${indexHtml} <span class="track-icon">${icon}</span> <span>${import_koishi.h.escape(item.title)}</span> </div>
                  <div class="track-meta">${item.meta}</div>
                </li>`;
    }).join("");
    const detailsHtml = `
      <div class="detail-item"><strong>社团:</strong> 🏢 ${import_koishi.h.escape(workInfo.name)}</div>
      <div class="detail-item"><strong>声优:</strong> 🎤 ${cvs}</div>
      <div class="detail-item"><strong>日期:</strong> 📅 ${workInfo.release}</div>
      <div class="detail-item"><strong>评分:</strong> ⭐️ ${workInfo.rate_average_2dp} (${workInfo.rate_count}人)</div>
      <div class="detail-item"><strong>销量:</strong> 📥 ${workInfo.dl_count}</div>
      <div class="detail-item"><strong>时长:</strong> ⏱️ ${formatWorkDuration(workInfo.duration)}</div>
    `;
    const finalLinksHtml = this.config.showLinks ? `
      <div class="detail-item"><strong>ASMR.one:</strong> <a href="https://asmr.one/work/${rjCode}">https://asmr.one/work/${rjCode}</a></div>
      ${workInfo.source_url ? `<div class="detail-item"><strong>DLsite:</strong> <a href="${workInfo.source_url}">${import_koishi.h.escape(workInfo.source_url)}</a></div>` : ""}
    ` : "";
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
          <div class="rj-code">${import_koishi.h.escape(rjCode)}</div>
          <h1 class="title">${import_koishi.h.escape(workInfo.title)}</h1>
          
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
};

// src/services/sender.ts
var import_koishi2 = require("koishi");
var import_path = require("path");
var import_fs = require("fs");
var import_url = require("url");
var import_archiver = __toESM(require("archiver"));

// src/common/constants.ts
var SendMode = {
  CARD: "card",
  FILE: "file",
  ZIP: "zip",
  LINK: "link",
  VOICE: "voice"
  // [NEW] 新增 voice 模式
};
var AccessMode = {
  ALL: "all",
  WHITELIST: "whitelist",
  BLACKLIST: "blacklist"
};
var ZipMode = {
  SINGLE: "single",
  MULTIPLE: "multiple"
};
var CardModeNonAudioAction = {
  SKIP: "skip",
  FALLBACK: "fallbackToFile"
};
var VoiceModeNonAudioAction = {
  SKIP: "skip",
  FALLBACK: "fallbackToFile"
};

// src/services/sender.ts
var TrackSender = class {
  constructor(ctx, config, tempDir) {
    this.ctx = ctx;
    this.config = config;
    this.tempDir = tempDir;
    this.logger = ctx.logger("asmrone");
  }
  static {
    __name(this, "TrackSender");
  }
  logger;
  requestOptions = {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0" }
  };
  async _ensureTempDir() {
    try {
      await import_fs.promises.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      this.logger.error("Failed to create temporary directory at %s: %o", this.tempDir, error);
      throw new Error(`无法创建临时目录，请检查权限：${this.tempDir}`);
    }
  }
  async _getCachedFileOrDownload(file, rjCode) {
    if (!this.config.cache.enableCache) {
      return this._downloadWithRetry(file.url, file.title);
    }
    const safeFilename = getSafeFilename(file.title);
    const cacheDir = (0, import_path.resolve)(this.tempDir, rjCode);
    const cachePath = (0, import_path.resolve)(cacheDir, safeFilename);
    try {
      const stats = await import_fs.promises.stat(cachePath);
      const maxAgeMs = this.config.cache.cacheMaxAge * 3600 * 1e3;
      if (stats.size > 100 && (maxAgeMs === 0 || Date.now() - stats.mtimeMs < maxAgeMs)) {
        this.logger.info(`[Cache] HIT for file: ${file.title}`);
        return import_fs.promises.readFile(cachePath);
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        this.logger.warn(`[Cache] Error checking cache for ${file.title}: %o`, error);
      }
    }
    this.logger.info(`[Cache] MISS for file: ${file.title}, downloading...`);
    const buffer = await this._downloadWithRetry(file.url, file.title);
    import_fs.promises.mkdir(cacheDir, { recursive: true }).then(() => import_fs.promises.writeFile(cachePath, buffer)).catch((err) => this.logger.error(`[Cache] Failed to write cache for ${file.title}: %o`, err));
    return buffer;
  }
  async _downloadWithRetry(url, title) {
    let lastError = null;
    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        const buffer = await this.ctx.http.get(url, {
          ...this.requestOptions,
          responseType: "arraybuffer",
          timeout: this.config.downloadTimeout * 1e3
        });
        if (!buffer || buffer.byteLength < 100) throw new Error("文件为空或过小");
        return Buffer.from(buffer);
      } catch (error) {
        lastError = error;
        this.logger.warn(`下载文件 "%s" 失败 (尝试 %d/%d): %s`, title, i + 1, this.config.maxRetries, error.message);
        if (i < this.config.maxRetries - 1) {
          await new Promise((res) => setTimeout(res, 1500));
        }
      }
    }
    this.logger.error(`下载文件 "%s" 在 %d 次尝试后彻底失败。`, title, this.config.maxRetries);
    throw lastError;
  }
  async downloadFilesWithConcurrency(items, worker) {
    const results = [];
    const queue = [...items];
    const concurrency = this.config.downloadConcurrency;
    const runWorker = /* @__PURE__ */ __name(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          const result = await worker(item);
          results.push(result);
        }
      }
    }, "runWorker");
    const workers = Array(concurrency).fill(null).map(() => runWorker());
    await Promise.all(workers);
    return results;
  }
  async processAndSendTracks(indices, allFiles, workInfo, session, mode) {
    const validFiles = indices.map((i) => ({ index: i, file: allFiles[i - 1] })).filter((item) => item.file);
    if (validFiles.length === 0) {
      await session.send("选择的序号无效。");
      return;
    }
    if (mode === SendMode.CARD) {
      const audioFiles = validFiles.filter((vf) => vf.file.type === "audio");
      const nonAudioFiles = validFiles.filter((vf) => vf.file.type !== "audio");
      if (nonAudioFiles.length > 0) {
        if (this.config.cardModeNonAudioAction === CardModeNonAudioAction.FALLBACK) {
          await session.send(`Card模式：${nonAudioFiles.length} 个非音频文件转为文件发送...`);
          await this._sendAsFile(nonAudioFiles, workInfo, session);
        } else {
          await session.send(`Card模式：已跳过 ${nonAudioFiles.length} 个非音频文件。`);
        }
      }
      if (audioFiles.length > 0) {
        await this._sendAsCard(audioFiles, workInfo, session);
      } else if (nonAudioFiles.length > 0) {
        await session.send("选择的文件均非音频，已按设置处理。");
      }
    } else if (mode === SendMode.VOICE) {
      const audioFiles = validFiles.filter((vf) => vf.file.type === "audio");
      const nonAudioFiles = validFiles.filter((vf) => vf.file.type !== "audio");
      if (nonAudioFiles.length > 0) {
        if (this.config.voiceModeNonAudioAction === VoiceModeNonAudioAction.FALLBACK) {
          await session.send(`Voice模式：${nonAudioFiles.length} 个非音频文件转为文件发送...`);
          await this._sendAsFile(nonAudioFiles, workInfo, session);
        } else {
          await session.send(`Voice模式：已跳过 ${nonAudioFiles.length} 个非音频文件。`);
        }
      }
      if (audioFiles.length > 0) {
        await this._sendAsVoice(audioFiles, workInfo, session);
      } else if (nonAudioFiles.length > 0) {
        await session.send("选择的文件均非音频，已按设置处理。");
      }
    } else if (mode === SendMode.ZIP) {
      await this._sendAsZip(validFiles, workInfo, session);
    } else if (mode === SendMode.LINK) {
      await this._sendAsLink(validFiles, workInfo, session);
    } else if (mode === SendMode.FILE) {
      await this._sendAsFile(validFiles, workInfo, session);
    } else {
      this.logger.warn(`未知的发送模式: "${mode}"，将默认使用 file 模式发送。`);
      await this._sendAsFile(validFiles, workInfo, session);
    }
    await session.send("请求处理完毕。");
  }
  // [NEW] 发送语音的核心方法
  async _sendAsVoice(validFiles, workInfo, session) {
    if (session.platform !== "onebot") {
      await session.send("Voice模式：当前平台不支持，转为文件发送。");
      await this._sendAsFile(validFiles, workInfo, session);
      return;
    }
    await session.send(`正在发送 ${validFiles.length} 条语音...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
    for (const { index, file } of validFiles) {
      let tempFilePath;
      try {
        const buffer = await this._getCachedFileOrDownload(file, rjCode);
        await this._ensureTempDir();
        tempFilePath = (0, import_path.resolve)(this.tempDir, getSafeFilename(file.title));
        await import_fs.promises.writeFile(tempFilePath, buffer);
        await session.send((0, import_koishi2.h)("audio", { src: (0, import_url.pathToFileURL)(tempFilePath).href, type: "voice" }));
      } catch (error) {
        this.logger.error("发送语音 %s 失败: %o", index, error);
        await session.send(`语音 ${index} (${getSafeFilename(file.title)}) 发送失败。`);
      } finally {
        if (tempFilePath) {
          await import_fs.promises.unlink(tempFilePath).catch((e) => this.logger.warn("删除语音临时文件失败: %s", e.message));
        }
      }
    }
  }
  async _sendAsLink(validFiles, workInfo, session) {
    await session.send(`正在为您生成 ${validFiles.length} 个下载链接...`);
    const botName = session.bot.user?.name || session.bot.selfId;
    const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
    if (session.platform === "onebot" && typeof session.send === "function") {
      try {
        const forwardMessages = validFiles.map(({ index, file }) => {
          const title = this.config.prependRjCodeLink ? `${rjCode} ${file.title}` : file.title;
          const content = `${index}. ${import_koishi2.h.escape(title)}
${file.url}`;
          return (0, import_koishi2.h)("message", { userId: session.bot.selfId, nickname: botName }, content);
        });
        await session.send((0, import_koishi2.h)("figure", forwardMessages));
        return;
      } catch (error) {
        this.logger.warn("发送合并转发消息失败，将回退到逐条发送模式: %o", error);
      }
    }
    this.logger.info("正在以逐条发送模式发送链接...");
    for (const { index, file } of validFiles) {
      try {
        const title = this.config.prependRjCodeLink ? `${rjCode} ${file.title}` : file.title;
        await session.send(`${index}. ${import_koishi2.h.escape(title)}
${file.url}`);
        await new Promise((res) => setTimeout(res, 300));
      } catch (error) {
        this.logger.error("逐条发送链接 %s 失败: %o", index, error);
        await session.send(`发送链接 ${index} 失败。`);
      }
    }
  }
  async _sendAsCard(validFiles, workInfo, session) {
    if (session.platform !== "onebot") {
      await session.send("Card模式：当前平台不支持，转为文件发送。");
      await this._sendAsFile(validFiles, workInfo, session);
      return;
    }
    await session.send(`正在发送 ${validFiles.length} 个音乐卡片...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
    const asmrOneUrl = `https://asmr.one/work/${rjCode}`;
    const cvs = workInfo.vas?.map((v) => v.name).join(", ") || "未知声优";
    const musicPayload = /* @__PURE__ */ __name((file) => [{
      type: "music",
      data: {
        type: "163",
        url: workInfo.source_url || asmrOneUrl,
        audio: file.url,
        title: this.config.prependRjCodeCard ? `${rjCode} ${file.title}` : file.title,
        content: cvs,
        image: workInfo.mainCoverUrl
      }
    }], "musicPayload");
    for (const { index, file } of validFiles) {
      try {
        if (session.isDirect) {
          await session.bot.internal.sendPrivateMsg(session.userId, musicPayload(file));
        } else {
          await session.bot.internal.sendGroupMsg(session.guildId, musicPayload(file));
        }
      } catch (error) {
        this.logger.error("发送音乐卡片 %s 失败: %o", index, error);
        await session.send(`音轨 ${index} Card发送失败，请检查音乐签名url配置。`);
      }
    }
  }
  async _sendAsFile(validFiles, workInfo, session) {
    await session.send(`开始发送 ${validFiles.length} 个文件...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
    const downloadWorker = /* @__PURE__ */ __name(({ index, file }) => this._getCachedFileOrDownload(file, rjCode).then((buffer) => ({ status: "fulfilled", value: { buffer, file, index } })).catch((error) => ({ status: "rejected", reason: error, index, title: file.title })), "downloadWorker");
    const results = await this.downloadFilesWithConcurrency(validFiles, downloadWorker);
    for (const result of results) {
      let tempFilePath;
      if (result.status === "fulfilled") {
        const { buffer, file, index } = result.value;
        try {
          await this._ensureTempDir();
          const finalFilename = this.config.prependRjCodeFile ? `${rjCode} ${file.title}` : file.title;
          tempFilePath = (0, import_path.resolve)(this.tempDir, getSafeFilename(finalFilename));
          await import_fs.promises.writeFile(tempFilePath, buffer);
          await session.send((0, import_koishi2.h)("file", { src: (0, import_url.pathToFileURL)(tempFilePath).href, title: finalFilename }));
        } catch (error) {
          this.logger.error("发送文件 %s 失败: %o", index, error);
          await session.send(`文件 ${index} 发送失败。`);
        } finally {
          if (tempFilePath) await import_fs.promises.unlink(tempFilePath).catch((e) => this.logger.warn("删除临时文件失败: %s", e.message));
        }
      } else {
        const { reason, index, title } = result;
        this.logger.error("下载并发送文件 %s (%s) 失败: %o", index, title, reason);
        await session.send(`文件 ${index} (${getSafeFilename(title)}) 下载失败。`);
      }
    }
  }
  async _sendAsZip(validFiles, workInfo, session) {
    if (this.config.zipMode === ZipMode.SINGLE) {
      await this.handleSingleZip(validFiles, workInfo, session);
    } else {
      await this.handleMultipleZips(validFiles, workInfo, session);
    }
    if (this.config.usePassword && this.config.password) {
      await session.send(`ZIP 密码: ${this.config.password}`);
    }
  }
  async handleSingleZip(validFiles, workInfo, session) {
    await session.send(`正在准备压缩包 (${validFiles.length}个文件)...`);
    let tempZipPath;
    try {
      const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
      const downloadWorker = /* @__PURE__ */ __name(({ index, file }) => this._getCachedFileOrDownload(file, rjCode).then((buffer) => ({
        path: this.config.prependRjCodeZip ? `${getSafeFilename(rjCode)}/${file.path}` : file.path,
        data: buffer
      })).catch((error) => {
        this.logger.error("ZIP下载文件 %s (%s) 失败: %o", index, file.title, error);
        session.send(`压缩包: 文件 ${index} (${getSafeFilename(file.title)}) 下载失败，已跳过。`);
        return null;
      }), "downloadWorker");
      const downloadedFiles = (await this.downloadFilesWithConcurrency(validFiles, downloadWorker)).filter((f) => f);
      if (downloadedFiles.length > 0) {
        const zipFileTitle = this.config.prependRjCodeZip ? `${rjCode} ${workInfo.title}` : workInfo.title;
        const zipFilename = getZipFilename(zipFileTitle);
        await session.send(`已下载 ${downloadedFiles.length} 个文件，正在压缩...`);
        tempZipPath = await this.createZipArchive(downloadedFiles, zipFilename);
        await session.send(`压缩包创建完毕，发送中...`);
        await session.send((0, import_koishi2.h)("file", { src: (0, import_url.pathToFileURL)(tempZipPath).href, title: zipFilename }));
      } else {
        await session.send("文件全部下载失败，压缩取消。");
      }
    } catch (error) {
      this.logger.error("创建或发送合并压缩包失败: %o", error);
      await session.send("压缩包发送失败。");
    } finally {
      if (tempZipPath) await import_fs.promises.unlink(tempZipPath).catch((e) => this.logger.warn("删除临时压缩包失败: %s", e.message));
    }
  }
  async handleMultipleZips(validFiles, workInfo, session) {
    await session.send(`准备单独压缩 ${validFiles.length} 个文件...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
    for (const { index, file } of validFiles) {
      let tempZipPath;
      try {
        const audioBuffer = await this._getCachedFileOrDownload(file, rjCode);
        const baseFilename = this.config.prependRjCodeZip ? `${rjCode} ${file.title}` : file.title;
        const zipFilename = getZipFilename(baseFilename);
        tempZipPath = await this.createZipArchive([{ path: getSafeFilename(file.title), data: audioBuffer }], zipFilename);
        await session.send((0, import_koishi2.h)("file", { src: (0, import_url.pathToFileURL)(tempZipPath).href, title: zipFilename }));
      } catch (error) {
        this.logger.error("创建或发送独立压缩包失败: %o", error);
        await session.send(`文件 ${index} (${getSafeFilename(file.title)}) 压缩失败。`);
      } finally {
        if (tempZipPath) await import_fs.promises.unlink(tempZipPath).catch((e) => this.logger.warn("删除临时压缩包失败: %s", e.message));
      }
    }
  }
  async createZipArchive(filesToPack, outputZipName) {
    await this._ensureTempDir();
    return new Promise((promiseResolve, promiseReject) => {
      const tempZipPath = (0, import_path.resolve)(this.tempDir, outputZipName);
      const output = (0, import_fs.createWriteStream)(tempZipPath);
      const isEncrypted = this.config.usePassword && this.config.password && this.config.password.length > 0;
      const format = isEncrypted ? "zip-encrypted" : "zip";
      const archiveOptions = {
        zlib: { level: this.config.zipCompressionLevel }
      };
      if (isEncrypted) {
        archiveOptions.encryptionMethod = "aes256";
        archiveOptions.password = this.config.password;
      }
      const archive = (0, import_archiver.default)(format, archiveOptions);
      output.on("close", () => promiseResolve(tempZipPath));
      archive.on("warning", (err) => this.logger.warn("Archiver warning: %o", err));
      archive.on("error", (err) => promiseReject(err));
      archive.pipe(output);
      filesToPack.forEach((file) => archive.append(file.data, { name: file.path }));
      archive.finalize();
    });
  }
};

// src/commands/handler.ts
var import_koishi3 = require("koishi");
var orderMap = {
  "发售日": { order: "release", sort: "desc" },
  "最新收录": { order: "create_date", sort: "desc" },
  "发售日-正序": { order: "release", sort: "asc" },
  "销量": { order: "dl_count", sort: "desc" },
  "价格-正序": { order: "price", sort: "asc" },
  "价格": { order: "price", sort: "desc" },
  "评分": { order: "rate_average_2dp", sort: "desc" },
  "评价数": { order: "review_count", sort: "desc" },
  "RJ号": { order: "id", sort: "desc" },
  "RJ号-正序": { order: "id", sort: "asc" },
  "随机": { order: "random", sort: "desc" }
};
var orderKeys = Object.keys(orderMap);
var CommandHandler = class {
  constructor(ctx, config, api, renderer, sender) {
    this.ctx = ctx;
    this.config = config;
    this.api = api;
    this.renderer = renderer;
    this.sender = sender;
    this.logger = ctx.logger("asmrone");
  }
  static {
    __name(this, "CommandHandler");
  }
  logger;
  activeInteractions = /* @__PURE__ */ new Set();
  isAccessAllowed(session) {
    if (session.isDirect) return true;
    if (!session.guildId) return false;
    if (this.config.accessMode === AccessMode.WHITELIST) return this.config.whitelist.includes(session.guildId);
    if (this.config.accessMode === AccessMode.BLACKLIST) return !this.config.blacklist.includes(session.guildId);
    return true;
  }
  isInteractionActive(session) {
    const interactionKey = `${session.platform}:${session.userId}`;
    if (this.activeInteractions.has(interactionKey)) {
      session.send("操作中，请稍后再试。");
      return true;
    }
    return false;
  }
  async handlePopular(session, page = 1) {
    if (!this.isAccessAllowed(session) || this.isInteractionActive(session)) return;
    const fetcher = /* @__PURE__ */ __name((p) => this.api.getPopular(p), "fetcher");
    const onNextPage = /* @__PURE__ */ __name((nextSession, nextPage) => this.handleListInteraction(nextSession, nextPage, fetcher, "热门音声", onNextPage), "onNextPage");
    await this.handleListInteraction(session, page, fetcher, "热门音声", onNextPage);
  }
  parseAdvancedSearch(query) {
    const args = query.trim().split(/\s+/);
    const params = {
      keyword: "",
      page: 1,
      include: {},
      exclude: {}
    };
    const keywords = [];
    const validKeys = ["tag", "va", "circle", "rate", "price", "sell", "duration", "age", "lang", "order"];
    for (const arg of args) {
      if (/^\d+$/.test(arg) && !arg.includes(":")) {
        params.page = parseInt(arg, 10);
        continue;
      }
      const match = arg.match(/^(-)?([a-zA-Z]+):(.*)$/);
      if (match) {
        const [, excludeFlag, key, value] = match;
        if (validKeys.includes(key) && value) {
          if (key === "order") {
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
    params.keyword = keywords.join(" ");
    return params;
  }
  async handleSearch(session, query) {
    if (!this.isAccessAllowed(session)) return;
    if (!query) {
      await session.send("请输入关键词。");
      return;
    }
    if (this.isInteractionActive(session)) return;
    const searchParams = this.parseAdvancedSearch(query);
    const apiKeywordParts = [];
    if (searchParams.keyword) {
      apiKeywordParts.push(searchParams.keyword);
    }
    const numericKeys = ["rate", "price", "sell", "duration"];
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
    const apiKeyword = apiKeywordParts.join(" ");
    const fetcher = /* @__PURE__ */ __name((p) => this.api.search(apiKeyword, p, searchParams.order, searchParams.sort), "fetcher");
    const onNextPage = /* @__PURE__ */ __name((nextSession, nextPage) => this.handleListInteraction(nextSession, nextPage, fetcher, query, onNextPage), "onNextPage");
    await this.handleListInteraction(session, searchParams.page, fetcher, query, onNextPage);
  }
  async handleListen(session, query) {
    if (!this.isAccessAllowed(session)) return;
    if (!query) {
      await session.send("请输入 RJ 号。");
      return;
    }
    if (this.isInteractionActive(session)) return;
    try {
      const args = query.trim().split(/\s+/).filter(Boolean);
      const formattedRjCode = formatRjCode(args[0]);
      if (!formattedRjCode) {
        await session.send("RJ 号格式错误。");
        return;
      }
      const optionKeywords = [SendMode.CARD, SendMode.FILE, SendMode.ZIP, SendMode.LINK, SendMode.VOICE];
      let userOption = null;
      const potentialOption = args[args.length - 1];
      if (optionKeywords.includes(potentialOption)) {
        userOption = potentialOption;
        args.pop();
      }
      const selectionArgs = args.slice(1);
      const uniqueIndices = parseTrackIndices(selectionArgs);
      if (uniqueIndices.length > 0) {
        const rid = formattedRjCode.substring(2);
        const [workInfo, trackData] = await Promise.all([this.api.getWorkInfo(rid), this.api.getTracks(rid)]);
        if (!workInfo || !trackData) {
          await session.send("获取信息失败。");
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
  async handleWorkSelection(session, rjCode, onBack) {
    const interactionKey = `${session.platform}:${session.userId}`;
    this.activeInteractions.add(interactionKey);
    try {
      const rid = rjCode.substring(2);
      await session.send(`正在查询作品详情：${import_koishi3.h.escape(rjCode)}...`);
      const workInfo = await this.api.getWorkInfo(rid);
      const trackData = await this.api.getTracks(rid);
      const { displayItems, processedFiles } = processFileTree(trackData);
      await this.sendWorkInfo(session, workInfo, displayItems, rjCode);
      if (processedFiles.length === 0) {
        await session.send("该作品无可下载文件。");
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
          if (choice === "n" || choice === "取消") {
            await midSession.send("操作已取消。");
            return;
          }
          if ((choice === "b" || choice === "返回") && onBack) {
            await midSession.send("正在返回列表...");
            await onBack();
            return;
          }
          const replyArgs = choice.replace(/,/g, " ").split(/\s+/).filter(Boolean);
          let mode = null;
          if ([SendMode.CARD, SendMode.FILE, SendMode.ZIP, SendMode.LINK, SendMode.VOICE].includes(replyArgs[replyArgs.length - 1])) {
            mode = replyArgs.pop();
          }
          const uniqueIndices = parseTrackIndices(replyArgs);
          if (uniqueIndices.length === 0) {
            await midSession.send("输入无效，操作已取消。");
          } else {
            await this.sender.processAndSendTracks(uniqueIndices, processedFiles, workInfo, midSession, mode || this.config.defaultSendMode);
          }
        } catch (error) {
          this.logger.error("处理用户交互时发生错误: %o", error);
          await midSession.send(`交互处理失败：${error.message}`);
        } finally {
          this.activeInteractions.delete(interactionKey);
        }
      }, true);
      const timer = setTimeout(() => {
        dispose();
        this.activeInteractions.delete(interactionKey);
        session.send("操作超时，已自动取消。");
      }, this.config.interactionTimeout * 1e3);
    } catch (error) {
      this.logger.error(`获取作品 ${rjCode} 失败: %o`, error);
      await session.send(`查询失败：${error.message}`);
      this.activeInteractions.delete(interactionKey);
    }
  }
  async handleListInteraction(session, page, fetcher, listTitle, onNextPage) {
    const interactionKey = `${session.platform}:${session.userId}`;
    this.activeInteractions.add(interactionKey);
    try {
      const actionText = listTitle === "热门音声" ? "正在获取" : "正在搜索";
      const titleText = listTitle === "热门音声" ? "热门音声" : `“${import_koishi3.h.escape(listTitle)}”`;
      await session.send(`${actionText}${titleText} (第 ${page} 页)...`);
      const data = await fetcher(page);
      if (!data?.works?.length) {
        await session.send(data?.pagination?.totalCount === 0 ? "未找到任何结果。" : "没有更多结果了。");
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
        if (imageBuffer) await session.send(import_koishi3.h.image(imageBuffer, "image/png"));
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
        if (content !== "f" && content !== "p" && content !== "n" && content !== "取消" && !isChoiceValid) {
          return next();
        }
        if (content === "p" && page <= 1) {
          await midSession.send("已经是第一页了。");
          return;
        }
        clearTimeout(timer);
        dispose();
        try {
          if (content === "f") {
            onNextPage(midSession, page + 1);
          } else if (content === "p") {
            onNextPage(midSession, page - 1);
          } else if (content === "n" || content === "取消") {
            await midSession.send("操作已取消。");
            this.activeInteractions.delete(interactionKey);
          } else if (isChoiceValid) {
            const selectedWork = data.works[localIndex - 1];
            const onBack = /* @__PURE__ */ __name(() => this.handleListInteraction(midSession, page, fetcher, listTitle, onNextPage), "onBack");
            await this.handleWorkSelection(midSession, `RJ${String(selectedWork.id).padStart(8, "0")}`, onBack);
          }
        } catch (error) {
          this.logger.error("处理列表交互时发生错误: %o", error);
          await midSession.send(`交互处理失败：${error.message}`);
          this.activeInteractions.delete(interactionKey);
        }
      }, true);
      const timer = setTimeout(() => {
        dispose();
        this.activeInteractions.delete(interactionKey);
        session.send("操作超时，已自动取消。");
      }, this.config.interactionTimeout * 1e3);
    } catch (error) {
      this.logger.error("获取列表时发生内部错误: %o", error);
      await session.send(`列表获取失败：${error.message}`);
      this.activeInteractions.delete(interactionKey);
    }
  }
  async sendWorkInfo(session, workInfo, displayItems, rjCode) {
    if (this.config.useImageMenu && this.ctx.puppeteer) {
      const coverDataUri = await this.api.downloadImageAsDataUri(workInfo.mainCoverUrl);
      const workInfoWithEmbeddedImage = {
        ...workInfo,
        mainCoverUrl: coverDataUri || workInfo.mainCoverUrl
      };
      const html = this.renderer.createWorkInfoHtml(workInfoWithEmbeddedImage, displayItems, "");
      const imageBuffer = await this.renderer.renderHtmlToImage(html);
      if (imageBuffer) {
        await session.send(import_koishi3.h.image(imageBuffer, "image/png"));
        return;
      }
    }
    await this.sendWorkInfoAsText(session, workInfo, displayItems, rjCode);
  }
  async sendWorkInfoAsText(session, workInfo, displayItems, rjCode) {
    const infoBlockArray = [
      `【${rjCode}】`,
      `标题: ${import_koishi3.h.escape(workInfo.title)}`,
      `社团: 🏢 ${import_koishi3.h.escape(workInfo.name)}`,
      `日期: 📅 ${workInfo.release}`,
      `评分: ⭐️ ${workInfo.rate_average_2dp} (${workInfo.rate_count}人)`,
      `销量: 📥 ${workInfo.dl_count}`,
      `时长: ⏱️ ${formatWorkDuration(workInfo.duration)}`,
      `声优: 🎤 ${import_koishi3.h.escape(workInfo.vas.map((v) => v.name).join(", "))}`,
      `标签: 🏷️ ${import_koishi3.h.escape(workInfo.tags.map((t) => t.name).join(", "))}`
    ];
    if (this.config.showLinks) {
      infoBlockArray.push(`asmr.one链接: https://asmr.one/work/${rjCode}`);
      if (workInfo.source_url) infoBlockArray.push(`DLsite链接: ${workInfo.source_url}`);
    }
    const infoBlock = infoBlockArray.join("\n");
    const fileIcons = { folder: "📁", audio: "🎵", image: "🖼️", video: "🎬", doc: "📄", subtitle: "📜", unknown: "❔" };
    const fileListText = `--- 文件列表 ---
` + displayItems.map((item) => {
      const prefix = "  ".repeat(item.depth);
      const icon = fileIcons[item.type] || fileIcons.unknown;
      const indexStr = item.fileIndex ? String(item.fileIndex).padStart(2, " ") + "." : "   ";
      const metaStr = item.meta ? `  (${item.meta})` : "";
      return `${prefix}${indexStr}${icon} ${import_koishi3.h.escape(item.title)}${metaStr}`;
    }).join("\n");
    if (this.config.useForward && session.platform === "onebot") {
      const imageUri = await this.api.downloadImageAsDataUri(workInfo.mainCoverUrl);
      const imageElement = imageUri ? import_koishi3.h.image(imageUri) : (0, import_koishi3.h)("p", "封面加载失败");
      await session.send((0, import_koishi3.h)("figure", [
        (0, import_koishi3.h)("message", { nickname: "作品详情" }, [imageElement, "\n" + infoBlock]),
        (0, import_koishi3.h)("message", { nickname: "文件列表" }, fileListText)
      ]));
    } else {
      await session.send([import_koishi3.h.image(workInfo.mainCoverUrl), infoBlock, fileListText].join("\n\n"));
    }
  }
  async sendSearchTextResult(session, data, page) {
    const header = `为你找到 ${data.pagination.totalCount} 个结果 (第 ${page} 页):`;
    const buildEntryText = /* @__PURE__ */ __name((work, index) => {
      const rjCode = `RJ${String(work.id).padStart(8, "0")}`;
      const tags = work.tags.slice(0, 5).map((t) => t.name).join(", ");
      return [
        `${(page - 1) * this.config.pageSize + index + 1}. 【${rjCode}】`,
        `   标题: ${import_koishi3.h.escape(work.title)}`,
        `   社团: 🏢 ${import_koishi3.h.escape(work.name)}`,
        `   日期: 📅 ${work.release}`,
        `   声优: 🎤 ${import_koishi3.h.escape(work.vas.map((v) => v.name).join(", ") || "未知")}`,
        `   评分: ⭐️ ${work.rate_average_2dp} (${work.rate_count})`,
        `   销量: 📥 ${work.dl_count}`,
        `   时长: ⏱️ ${formatWorkDuration(work.duration)}`,
        `   标签: 🏷️ ${import_koishi3.h.escape(tags)}`
      ].join("\n");
    }, "buildEntryText");
    if (this.config.useForward && session.platform === "onebot") {
      const messageNodes = [(0, import_koishi3.h)("message", { nickname: session.bot.user?.name || session.bot.selfId }, header)];
      for (const [index, work] of data.works.entries()) {
        const entryText = buildEntryText(work, index);
        let content = [entryText];
        if (this.config.showSearchImage) {
          const imageUri = await this.api.downloadImageAsDataUri(work.mainCoverUrl);
          content = imageUri ? [import_koishi3.h.image(imageUri), "\n", entryText] : ["[封面加载失败]\n", entryText];
        }
        messageNodes.push((0, import_koishi3.h)("message", { nickname: `结果 ${(page - 1) * this.config.pageSize + index + 1}` }, content));
      }
      await session.send((0, import_koishi3.h)("figure", messageNodes));
    } else {
      const messageElements = [header];
      for (const [index, work] of data.works.entries()) {
        messageElements.push("\n" + "─".repeat(15) + "\n");
        if (this.config.showSearchImage) messageElements.push((0, import_koishi3.h)("image", { src: work.mainCoverUrl }));
        messageElements.push(buildEntryText(work, index));
      }
      await session.send(messageElements);
    }
  }
};

// src/commands/listen.ts
function registerListenCommand(ctx, handler) {
  ctx.command("听音声 <rjCode> [tracksAndOptions...]", "获取并收听音声").usage(
    `听音声 <RJ号> [音轨序号] [发送方式]
音轨序号: 支持数字和范围，如 1 3 5-8。
发送方式:可选 card, file, zip, link, voice，用于本次发送，不写则使用默认配置。`
  ).example("听音声 RJ00123456").example("听音声 123456 1 3 5-8 zip").action(async ({ session }, rjCode, ...tracksAndOptions) => {
    const query = [rjCode, ...tracksAndOptions].filter(Boolean).join(" ");
    return handler.handleListen(session, query);
  });
}
__name(registerListenCommand, "registerListenCommand");

// src/commands/popular.ts
function registerPopularCommand(ctx, handler) {
  ctx.command("热门音声 [page:number]", "获取当前热门音声列表").usage(
    `热门音声 [页码]

页码: 指令末尾的单个数字。`
  ).example("热门音声").example("热门音声 3").action(async ({ session }, page) => {
    return handler.handlePopular(session, page);
  });
}
__name(registerPopularCommand, "registerPopularCommand");

// src/commands/search.ts
function registerSearchCommand(ctx, handler) {
  ctx.command("搜音声 <query...>", "搜索音声作品").usage(
    `搜音声 <关键词> [筛选条件] [排序方式] [页码]

关键词: 直接输入，多个词用空格分隔。
筛选条件: 使用 key:value 格式。
排序条件: 使用 order:排序值 格式。
页码: 指令末尾的单个数字。

筛选条件 (key:value):
  tag: 标签 (tag:舔耳)
  va: 声优 (va:藤田茜)
  circle: 社团 (circle:C-Lab.)
  rate: 评分 (rate:4.5, 表示>=4.5)
  sell: 销量 (sell:1000, 表示>=1000)
  price: 价格(日元) (price:1000, 表示>=1000)
  age: 年龄分级 (可选: general, r15, adult)
  lang: 语言 (可选: JPN, ENG, CHI_HANS 等)
排除筛选: 在 key 前加 - (减号)，如 -tag:男性向け

排序方式 (order:值)
可用排序值:
${orderKeys.join(", ")}`
  ).example("搜音声 藤田茜").example("搜音声 山田 tag:舔耳 order:发售日 2").action(async ({ session }, ...query) => {
    return handler.handleSearch(session, query.join(" "));
  });
}
__name(registerSearchCommand, "registerSearchCommand");

// src/config.ts
var import_koishi4 = require("koishi");
var Config = import_koishi4.Schema.intersect([
  import_koishi4.Schema.object({
    apiBaseUrl: import_koishi4.Schema.union([
      import_koishi4.Schema.const("https://api.asmr.one/api").description("asmr.one(国内墙)"),
      import_koishi4.Schema.const("https://api.asmr-100.com/api").description("asmr-100.com(国内墙)"),
      import_koishi4.Schema.const("https://api.asmr-200.com/api").description("asmr-200.com(随缘墙)"),
      import_koishi4.Schema.const("https://api.asmr-300.com/api").description("asmr-300.com(随缘墙)"),
      import_koishi4.Schema.string().description("自定义 API 地址 (需以 /api 结尾)")
    ]).default("https://api.asmr-200.com/api").description("音声数据 API 地址。"),
    useForward: import_koishi4.Schema.boolean().default(false).description("(文本模式) 启用合并转发发送长消息。"),
    showSearchImage: import_koishi4.Schema.boolean().default(false).description("(文本模式) 搜索结果中显示封面图 (有风控风险)。"),
    useImageMenu: import_koishi4.Schema.boolean().default(true).description("启用图片菜单 (需 puppeteer)。"),
    showLinks: import_koishi4.Schema.boolean().default(false).description("在详情中显示 asmr.one/DLsite 链接。"),
    pageSize: import_koishi4.Schema.number().min(1).max(40).default(10).description("每页结果数量 (1-40)。"),
    interactionTimeout: import_koishi4.Schema.number().min(15).default(60).description("交互操作超时时间 (秒)。"),
    maxRetries: import_koishi4.Schema.number().min(1).max(5).default(3).description("API 请求及文件下载失败时的最大重试次数。")
  }).description("基础设置"),
  import_koishi4.Schema.object({
    imageMenu: import_koishi4.Schema.object({
      backgroundColor: import_koishi4.Schema.string().role("color").default("#1e1e1e").description("整体背景色。"),
      itemBackgroundColor: import_koishi4.Schema.string().role("color").default("#252526").description("项目/卡片背景色。"),
      textColor: import_koishi4.Schema.string().role("color").default("#f0f0f0").description("主要文本颜色。"),
      titleColor: import_koishi4.Schema.string().role("color").default("#9cdcfe").description("作品标题颜色。"),
      accentColor: import_koishi4.Schema.string().role("color").default("#4ec9b0").description("主题强调色 (用于页头、边框)。"),
      highlightColor: import_koishi4.Schema.string().role("color").default("#c586c0").description("高亮颜色 (用于序号)。"),
      enableAntiCensorship: import_koishi4.Schema.boolean().default(true).description("启用抗审查 (添加随机噪声)。会增加图片生成耗时。"),
      imageRenderScale: import_koishi4.Schema.number().min(0.1).max(3).step(0.1).default(1).description("图片渲染质量 (缩放比例)。越高越清晰，但生成速度越慢。")
    }).description("图片菜单设置")
  }),
  import_koishi4.Schema.object({
    accessMode: import_koishi4.Schema.union([
      import_koishi4.Schema.const(AccessMode.ALL).description("所有群聊均可使用"),
      import_koishi4.Schema.const(AccessMode.WHITELIST).description("白名单模式"),
      import_koishi4.Schema.const(AccessMode.BLACKLIST).description("黑名单模式")
    ]).default(AccessMode.ALL).description("访问权限模式"),
    whitelist: import_koishi4.Schema.array(import_koishi4.Schema.string()).default([]).description("白名单列表 (群号/频道 ID)，仅白名单模式生效。"),
    blacklist: import_koishi4.Schema.array(import_koishi4.Schema.string()).default([]).description("黑名单列表 (群号/频道 ID)，仅黑名单模式生效。")
  }).description("权限设置"),
  import_koishi4.Schema.object({
    defaultSendMode: import_koishi4.Schema.union([
      import_koishi4.Schema.const(SendMode.CARD).description("音乐卡片 (card)"),
      import_koishi4.Schema.const(SendMode.FILE).description("音频文件 (file)"),
      import_koishi4.Schema.const(SendMode.ZIP).description("压缩包 (zip)"),
      import_koishi4.Schema.const(SendMode.LINK).description("下载链接 (link)"),
      import_koishi4.Schema.const(SendMode.VOICE).description("语音 (voice)")
      // [NEW]
    ]).default(SendMode.FILE).description("默认音轨发送方式。"),
    cardModeNonAudioAction: import_koishi4.Schema.union([
      import_koishi4.Schema.const(CardModeNonAudioAction.SKIP).description("跳过 (默认)"),
      import_koishi4.Schema.const(CardModeNonAudioAction.FALLBACK).description("转为 file 模式发送")
    ]).default(CardModeNonAudioAction.SKIP).description("Card模式下对非音频文件的操作。"),
    // [NEW] voice 模式的配置
    voiceModeNonAudioAction: import_koishi4.Schema.union([
      import_koishi4.Schema.const(VoiceModeNonAudioAction.SKIP).description("跳过 (默认)"),
      import_koishi4.Schema.const(VoiceModeNonAudioAction.FALLBACK).description("转为 file 模式发送")
    ]).default(VoiceModeNonAudioAction.SKIP).description("Voice模式下对非音频文件的操作。"),
    downloadTimeout: import_koishi4.Schema.number().default(300).description("单文件下载超时 (秒)。"),
    downloadConcurrency: import_koishi4.Schema.number().min(1).max(10).default(3).description("同时下载文件的最大数量。")
  }).description("下载与发送设置"),
  import_koishi4.Schema.object({
    cache: import_koishi4.Schema.object({
      enableCache: import_koishi4.Schema.boolean().default(true).description("启用音频文件缓存以提高重复请求的速度。"),
      cacheMaxAge: import_koishi4.Schema.number().min(0).default(24).description("缓存文件最长保留时间 (小时)。设置为 0 表示永久保留 (直到插件停用)。")
    }).description("缓存设置")
  }),
  import_koishi4.Schema.object({
    prependRjCodeCard: import_koishi4.Schema.boolean().default(false).description("Card 标题添加 RJ 号。"),
    prependRjCodeFile: import_koishi4.Schema.boolean().default(true).description("File 文件名添加 RJ 号。"),
    prependRjCodeZip: import_koishi4.Schema.boolean().default(true).description("Zip 包名/文件夹添加 RJ 号。"),
    prependRjCodeLink: import_koishi4.Schema.boolean().default(true).description("Link 模式标题添加 RJ 号。")
  }).description("命名规则设置"),
  import_koishi4.Schema.object({
    zipMode: import_koishi4.Schema.union([
      import_koishi4.Schema.const(ZipMode.SINGLE).description("合并为一包"),
      import_koishi4.Schema.const(ZipMode.MULTIPLE).description("每轨一包")
    ]).default(ZipMode.SINGLE).description("多文件压缩方式 (对所有 zip 发送生效)。"),
    zipCompressionLevel: import_koishi4.Schema.number().min(0).max(9).default(1).description("ZIP 压缩级别 (0不压缩, 1最快, 9最高)。级别越高，文件越小但速度越慢。"),
    usePassword: import_koishi4.Schema.boolean().default(false).description("Zip 是否加密。")
  }).description("压缩包设置"),
  import_koishi4.Schema.union([
    import_koishi4.Schema.object({
      usePassword: import_koishi4.Schema.const(true).required(),
      password: import_koishi4.Schema.string().role("secret").default("").description("压缩包密码。")
    }),
    import_koishi4.Schema.object({})
  ]),
  import_koishi4.Schema.object({
    debug: import_koishi4.Schema.boolean().default(false).description("开启Debug模式 (输出详细API日志)。")
  }).description("调试设置")
]);

// src/index.ts
if (!import_archiver2.default.isRegisteredFormat("zip-encrypted")) {
  import_archiver2.default.registerFormat("zip-encrypted", require("archiver-zip-encrypted"));
}
var name = "asmrone";
var inject = ["http", "puppeteer"];
var usage = `

##	注意：部分内容可能不适合在所有场合使用 (NSFW)，请在合适的范围内使用本插件。

---

###	指令用法
*	<>为必需项，[]为可选项
#### 搜音声 <关键词> [筛选条件] [排序方式] [页码]
*	**示例1**: \`搜音声 藤田茜 治愈\`
*	**示例2**: \`搜音声 山田 tag:舔耳 tag:剧情 order:发售日 2\`
	*	关键词: 直接输入，多个词用空格分隔。
	*	筛选条件: 使用 \`key:value\` 格式，支持多个。
	*	排序条件: 使用 \`order:排序值\` 格式。
	*	页码: 指令末尾的单个数字。
*	**更详细的参数说明请使用 \`help 搜音声\` 查询**

#### 热门音声 [页码]
*	**示例**: \`热门音声 3\`

#### 听音声 <RJ号> [音轨序号] [发送方式]
*	**示例1**: \`听音声 RJ01234567\`
*	**示例2**: \`听音声 RJ01234567 1 3-5 zip\`
	*	**音轨序号**: 支持单个或多个序号，如\`1 2 3\` \`5-10\`
	*	**发送方式**: 可选 \`card\`(音乐卡片) \`file\`(文件) \`zip\`(压缩包) \`link\`(下载链接) \`voice\`(语音)

---

###	其他说明

#### 筛选参数
*	**语法**: \`key:value\` ，在 \`key\` 前加 \`-\` 为排除该条件。
*	**可用key**: \`tag\`(标签) \`va\`(声优) \`circle\`(社团) \`rate\`(评分) \`sell\`(销量) \`price\`(价格) \`age\`(年龄分级) \`lang\`(语言)
*	**排序方式**: \`order:排序值\` ，默认按 \`销量\` 排序。可用值: \`${orderKeys.join(", ")}\`

#### 交互操作
*	**列表页**: 回复\`序号\`选择作品，\`F\` 下一页，\`P\` 上一页，\`N\` 取消。
*	**详情页**: 回复\`序号\`选择文件，如 \`1 3-5 [发送方式]\`，\`B\` 返回列表， \`N\` 取消。
 
---

*	**发送图片或文件失败，大概率是由平台风控导致，请尽量使用图片菜单，尽量避免无加密直接发送文件。**
*	**音乐卡片\`card\`模式需要配置音乐签名服务 url，且仅在 onebot 平台可用，请确保bot使用的框架配置支持。**
*	**语音\`voice\`模式需要配置 silk 服务或 ffmpeg ，且音质较差，仅推荐作为预览方式，不建议转换过大的音频文件，资源占用很高。**
`;
async function cleanupCache(logger, tempDir, maxAgeHours) {
  if (maxAgeHours <= 0) return;
  const maxAgeMs = maxAgeHours * 3600 * 1e3;
  const now = Date.now();
  let cleanedCount = 0;
  try {
    const rjFolders = await import_fs2.promises.readdir(tempDir, { withFileTypes: true });
    for (const rjFolder of rjFolders) {
      if (rjFolder.isDirectory()) {
        const folderPath = (0, import_path2.join)(tempDir, rjFolder.name);
        const files = await import_fs2.promises.readdir(folderPath);
        for (const file of files) {
          const filePath = (0, import_path2.join)(folderPath, file);
          try {
            const stats = await import_fs2.promises.stat(filePath);
            if (now - stats.mtimeMs > maxAgeMs) {
              await import_fs2.promises.unlink(filePath);
              cleanedCount++;
            }
          } catch (err) {
            logger.warn(`Failed to process cache file ${filePath}: ${err.message}`);
          }
        }
      }
    }
    if (cleanedCount > 0) {
      logger.info(`[Cache] Cleaned up ${cleanedCount} expired cache file(s).`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.error(`[Cache] Error during cache cleanup: ${error.message}`);
    }
  }
}
__name(cleanupCache, "cleanupCache");
function apply(ctx, config) {
  const logger = ctx.logger("asmrone");
  const tempDir = (0, import_path2.resolve)(ctx.baseDir, "temp", "asmrone");
  const api = new AsmrApi(ctx, config);
  const renderer = new Renderer(ctx, config);
  const sender = new TrackSender(ctx, config, tempDir);
  const commandHandler = new CommandHandler(ctx, config, api, renderer, sender);
  ctx.on("ready", async () => {
    try {
      await import_fs2.promises.mkdir(tempDir, { recursive: true });
      logger.info("临时文件目录已创建: %s", tempDir);
    } catch (error) {
      logger.error("创建临时文件目录失败: %o", error);
    }
    if (config.useImageMenu && !ctx.puppeteer) {
      logger.warn("图片菜单功能已开启，但未找到 puppeteer 服务。请安装 koishi-plugin-puppeteer 并重启。");
    }
    if (config.cache.enableCache) {
      cleanupCache(logger, tempDir, config.cache.cacheMaxAge);
      ctx.setInterval(() => cleanupCache(logger, tempDir, config.cache.cacheMaxAge), import_koishi5.Time.hour);
    }
  });
  ctx.on("dispose", async () => {
    try {
      await import_fs2.promises.rm(tempDir, { recursive: true, force: true });
      logger.info("临时文件及缓存目录已清理: %s", tempDir);
    } catch (error) {
      logger.error("清理临时文件目录失败: %o", error);
    }
  });
  registerPopularCommand(ctx, commandHandler);
  registerSearchCommand(ctx, commandHandler);
  registerListenCommand(ctx, commandHandler);
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  apply,
  inject,
  name,
  usage
});
