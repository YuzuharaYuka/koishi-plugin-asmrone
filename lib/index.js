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
var src_exports = {};
__export(src_exports, {
  Config: () => Config,
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  usage: () => usage
});
module.exports = __toCommonJS(src_exports);
var import_fs2 = require("fs");
var import_path2 = require("path");
var import_archiver2 = __toESM(require("archiver"));

// src/services/api.ts
var AsmrApi = class {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
  }
  static {
    __name(this, "AsmrApi");
  }
  requestOptions = {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0" }
  };
  async search(keyword, page) {
    const keywordForApi = keyword.replace(/\//g, "%20");
    const url = `${this.config.apiBaseUrl}/search/${keywordForApi}?order=dl_count&sort=desc&page=${page}&pageSize=${this.config.pageSize}&subtitle=0&includeTranslationWorks=true`;
    const response = await this.ctx.http.get(url, this.requestOptions);
    if (this.config.debug) {
      const fullResponse = JSON.stringify(response, null, 2);
      this.ctx.logger("asmrone").info(`[Debug] API Response from search for keyword '${keyword}':
${fullResponse}`);
    }
    return response;
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
    const response = await this.ctx.http.post(`${this.config.apiBaseUrl}/recommender/popular`, payload, this.requestOptions);
    if (this.config.debug) {
      const fullResponse = JSON.stringify(response, null, 2);
      this.ctx.logger("asmrone").info(`[Debug] API Response from getPopular for page ${page}:
${fullResponse}`);
    }
    return response;
  }
  async getWorkInfo(rid) {
    const response = await this.ctx.http.get(`${this.config.apiBaseUrl}/workInfo/${rid}`, this.requestOptions);
    if (this.config.debug) {
      const fullResponse = JSON.stringify(response, null, 2);
      this.ctx.logger("asmrone").info(`[Debug] API Response from getWorkInfo for RJ${rid}:
${fullResponse}`);
    }
    return response;
  }
  async getTracks(rid) {
    const response = await this.ctx.http.get(`${this.config.apiBaseUrl}/tracks/${rid}`, this.requestOptions);
    if (this.config.debug) {
      const fullResponse = JSON.stringify(response, null, 2);
      this.ctx.logger("asmrone").info(`[Debug] API Response from getTracks for RJ${rid}:
${fullResponse}`);
    }
    return response;
  }
  async downloadImageAsDataUri(url) {
    try {
      const buffer = await this.ctx.http.get(url, { ...this.requestOptions, responseType: "arraybuffer", timeout: 15e3 });
      const base64 = Buffer.from(buffer).toString("base64");
      const mime = url.includes(".png") ? "image/png" : "image/jpeg";
      return `data:${mime};base64,${base64}`;
    } catch (error) {
      this.ctx.logger("asmrone").warn("下载封面图片失败 %s: %o", url, error);
      return null;
    }
  }
};

// src/services/renderer.ts
var import_koishi = require("koishi");

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
  constructor(ctx) {
    this.ctx = ctx;
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
      await page.setViewport({ width: 840, height: 600, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: "networkidle0" });
      const imageBuffer = await page.screenshot({ fullPage: true, type: "png" });
      return imageBuffer;
    } catch (error) {
      this.logger.error("Puppeteer 渲染失败: %o", error);
      return null;
    } finally {
      if (page) await page.close();
    }
  }
  getMenuStyle() {
    return `
      :root { --bg-color: #1e1e1e; --item-bg-color: #252526; --text-color: #e0e0e0; --text-light-color: #d0d0d0; --title-color: #9cdcfe; --accent-color: #4ec9b0; --highlight-color: #c586c0; --tag-bg-color: #3c3c3c; --tag-text-color: #d0d0d0; }
      body { background-color: var(--bg-color); color: var(--text-color); font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; margin: 0; padding: 20px; }
      .container { max-width: 800px; margin: auto; }
      .header { color: var(--accent-color); font-size: 24px; margin-bottom: 20px; text-align: center; }
    `;
  }
  createSearchHtml(works, keyword, pageNum, total, config) {
    const worksHtml = works.map((work, index) => {
      const rjCode = `RJ${String(work.id).padStart(8, "0")}`;
      const cvs = work.vas.map((v) => import_koishi.h.escape(v.name)).join(", ") || "未知";
      const tags = work.tags.slice(0, 20).map((t) => `<span class="tag">${import_koishi.h.escape(t.name)}</span>`).join("");
      const duration = formatWorkDuration(work.duration);
      return `
          <div class="work-item">
            <div class="index">${(pageNum - 1) * config.pageSize + index + 1}</div>
            <div class="cover-container"><img src="${work.mainCoverUrl}" class="cover" /></div>
            <div class="info">
              <div class="title">【${rjCode}】${import_koishi.h.escape(work.title)}</div>
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
          <div class="header">“${import_koishi.h.escape(keyword)}”的搜索结果 (第 ${pageNum} 页 / 共 ${total} 个)</div>
          ${worksHtml}
        </div></body></html>`;
  }
  createWorkInfoHtml(workInfo, displayItems, linksHtml) {
    const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
    const cvs = workInfo.vas.map((v) => import_koishi.h.escape(v.name)).join(", ") || "未知";
    const tags = workInfo.tags.map((t) => `<span class="tag">${import_koishi.h.escape(t.name)}</span>`).join("");
    const fileIcons = {
      folder: "📁",
      audio: "🎵",
      image: "🖼️",
      video: "🎬",
      doc: "📄",
      subtitle: "📜",
      unknown: "❔"
    };
    const trackHtml = displayItems.map((item) => {
      const icon = fileIcons[item.type] || fileIcons.unknown;
      const indexHtml = item.fileIndex ? `<span class="track-index">${item.fileIndex}.</span>` : `<span class="track-index non-dl"></span>`;
      const itemClass = item.type === "folder" ? "folder-item" : "file-item";
      return `<li class="${itemClass}" style="padding-left: ${item.depth * 25}px;">
                  <div class="track-title">
                    ${indexHtml}
                    <span class="track-icon">${icon}</span>
                    <span>${import_koishi.h.escape(item.title)}</span>
                  </div>
                  <div class="track-meta">${item.meta}</div>
                </li>`;
    }).join("");
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
          <div class="title-header"><h1 class="title">【${rjCode}】${import_koishi.h.escape(workInfo.title)}</h1></div>
          <div class="work-content">
              <div class="cover-container" style="background-image: url('${workInfo.mainCoverUrl}')"></div>
              <div class="info">
                  <div class="details">
                      <span><strong>社团:🏢</strong> ${import_koishi.h.escape(workInfo.name)}</span><span><strong>声优:🎤</strong> ${cvs}</span><span><strong>日期:📅</strong> ${workInfo.release}</span>
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
  ZIP: "zip"
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
    } else if (mode === SendMode.ZIP) {
      await this._sendAsZip(validFiles, workInfo, session);
    } else {
      await this._sendAsFile(validFiles, workInfo, session);
    }
    await session.send("请求处理完毕。");
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
    for (const { index, file } of validFiles) {
      try {
        const cardTitle = this.config.prependRjCodeCard ? `${rjCode} ${file.title}` : file.title;
        await session.bot.internal.sendGroupMsg(session.guildId, [{
          type: "music",
          data: {
            type: "163",
            url: workInfo.source_url || asmrOneUrl,
            audio: file.url,
            title: cardTitle,
            content: workInfo.name,
            image: workInfo.mainCoverUrl
          }
        }]);
      } catch (error) {
        this.logger.error("发送音乐卡片 %s 失败: %o", index, error);
        await session.send(`音轨 ${index} Card发送失败。`);
      }
    }
  }
  async _sendAsFile(validFiles, workInfo, session) {
    await session.send(`开始发送 ${validFiles.length} 个文件...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
    const downloadPromises = validFiles.map(
      ({ index, file }) => this.ctx.http.get(file.url, { ...this.requestOptions, responseType: "arraybuffer", timeout: this.config.downloadTimeout * 1e3 }).then((buffer) => ({ status: "fulfilled", value: { buffer: Buffer.from(buffer), file }, index })).catch((error) => ({ status: "rejected", reason: error, index, title: file.title }))
    );
    const results = await Promise.allSettled(downloadPromises);
    for (const result of results) {
      let tempFilePath;
      if (result.status === "fulfilled" && result.value.status === "fulfilled") {
        const { buffer, file } = result.value.value;
        if (buffer.byteLength > 100) {
          try {
            const finalFilename = this.config.prependRjCodeFile ? `${rjCode} ${file.title}` : file.title;
            tempFilePath = (0, import_path.resolve)(this.tempDir, getSafeFilename(finalFilename));
            await import_fs.promises.writeFile(tempFilePath, buffer);
            await session.send(`发送中: ${import_koishi2.h.escape(finalFilename)}`);
            await session.send((0, import_koishi2.h)("file", { src: (0, import_url.pathToFileURL)(tempFilePath).href, title: finalFilename }));
          } catch (error) {
            this.logger.error("发送文件 %s 失败: %o", result.value.index, error);
            await session.send(`文件 ${result.value.index} 发送失败。`);
          } finally {
            if (tempFilePath) await import_fs.promises.unlink(tempFilePath).catch((e) => this.logger.warn("删除临时文件失败: %s", e));
          }
        } else {
          await session.send(`文件 ${result.value.index} 下载失败 (空文件)。`);
        }
      } else {
        const reason = result.status === "rejected" ? result.reason : result.value;
        this.logger.error("下载文件 %s (%s) 失败: %o", reason.index, reason.title, reason.reason);
        await session.send(`文件 ${reason.index} 下载失败。`);
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
    await session.send(`处理中：准备压缩 ${validFiles.length} 个文件...`);
    let tempZipPath;
    try {
      const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
      const downloadPromises = validFiles.map(
        ({ index, file }) => this.ctx.http.get(file.url, { ...this.requestOptions, responseType: "arraybuffer", timeout: this.config.downloadTimeout * 1e3 }).then((buffer) => ({
          path: this.config.prependRjCodeZip ? `${getSafeFilename(rjCode)}/${file.path}` : file.path,
          data: Buffer.from(buffer)
        })).catch((error) => {
          this.logger.error("下载文件 %s (%s) 失败: %o", index, file.title, error);
          session.send(`ZIP: 文件 ${index} 下载失败，已跳过。`);
          return null;
        })
      );
      const downloadedFiles = (await Promise.all(downloadPromises)).filter((f) => f && f.data.byteLength > 100);
      if (downloadedFiles.length > 0) {
        const zipFileTitle = this.config.prependRjCodeZip ? `${rjCode} ${workInfo.title}` : workInfo.title;
        const zipFilename = getZipFilename(zipFileTitle);
        await session.send(`已下载 ${downloadedFiles.length} 个文件，压缩中...`);
        tempZipPath = await this.createZipArchive(downloadedFiles, zipFilename);
        await session.send(`压缩包创建完毕，发送中... (${import_koishi2.h.escape(zipFilename)})`);
        await session.send((0, import_koishi2.h)("file", { src: (0, import_url.pathToFileURL)(tempZipPath).href, title: zipFilename }));
      } else {
        await session.send("文件全部下载失败，压缩取消。");
      }
    } catch (error) {
      this.logger.error("创建或发送合并压缩包失败: %o", error);
      await session.send("压缩包发送失败。");
    } finally {
      if (tempZipPath) await import_fs.promises.unlink(tempZipPath).catch((e) => this.logger.warn("删除临时压缩包失败: %s", e));
    }
  }
  async handleMultipleZips(validFiles, workInfo, session) {
    await session.send(`准备单独压缩 ${validFiles.length} 个文件...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
    for (const { index, file } of validFiles) {
      let tempZipPath;
      try {
        await session.send(`压缩中: ${index}. ${import_koishi2.h.escape(file.title)}`);
        const audioBuffer = await this.ctx.http.get(file.url, { ...this.requestOptions, responseType: "arraybuffer", timeout: this.config.downloadTimeout * 1e3 });
        if (!audioBuffer || audioBuffer.byteLength < 100) throw new Error("文件为空或过小");
        const baseFilename = this.config.prependRjCodeZip ? `${rjCode} ${file.title}` : file.title;
        const zipFilename = getZipFilename(baseFilename);
        tempZipPath = await this.createZipArchive([{ path: getSafeFilename(file.title), data: Buffer.from(audioBuffer) }], zipFilename);
        await session.send(`压缩包发送中: ${import_koishi2.h.escape(zipFilename)}`);
        await session.send((0, import_koishi2.h)("file", { src: (0, import_url.pathToFileURL)(tempZipPath).href, title: zipFilename }));
      } catch (error) {
        this.logger.error("创建或发送独立压缩包失败: %o", error);
        await session.send(`文件 ${index} 压缩失败。`);
      } finally {
        if (tempZipPath) await import_fs.promises.unlink(tempZipPath).catch((e) => this.logger.warn("删除临时压缩包失败: %s", e));
      }
    }
  }
  createZipArchive(filesToPack, outputZipName) {
    return new Promise((promiseResolve, promiseReject) => {
      const tempZipPath = (0, import_path.resolve)(this.tempDir, outputZipName);
      const output = (0, import_fs.createWriteStream)(tempZipPath);
      const archive = this.config.usePassword && this.config.password ? import_archiver.default.create("zip-encrypted", { encryptionMethod: "aes256", password: this.config.password }) : (0, import_archiver.default)("zip", { zlib: { level: 9 } });
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
    const interactionKey = `${session.platform}:${session.userId}`;
    this.activeInteractions.add(interactionKey);
    const fetcher = /* @__PURE__ */ __name((p) => this.api.getPopular(p), "fetcher");
    const onNextPage = /* @__PURE__ */ __name((nextSession, nextPage) => this.handleListInteraction(nextSession, nextPage, fetcher, "热门音声", onNextPage), "onNextPage");
    await this.handleListInteraction(session, page, fetcher, "热门音声", onNextPage);
  }
  async handleSearch(session, query) {
    if (!this.isAccessAllowed(session)) return;
    if (!query) {
      await session.send("请输入关键词。");
      return;
    }
    if (this.isInteractionActive(session)) return;
    const interactionKey = `${session.platform}:${session.userId}`;
    this.activeInteractions.add(interactionKey);
    const args = query.trim().split(/\s+/);
    const keyword = args[0];
    const page = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : 1;
    const fetcher = /* @__PURE__ */ __name((p) => this.api.search(keyword, p), "fetcher");
    const onNextPage = /* @__PURE__ */ __name((nextSession, nextPage) => this.handleListInteraction(nextSession, nextPage, fetcher, keyword, onNextPage), "onNextPage");
    await this.handleListInteraction(session, page, fetcher, keyword, onNextPage);
  }
  async handleListen(session, query) {
    if (!this.isAccessAllowed(session)) return;
    if (!query) {
      await session.send("请输入 RJ 号。");
      return;
    }
    if (this.isInteractionActive(session)) return;
    const args = query.trim().split(/\s+/).filter(Boolean);
    const formattedRjCode = formatRjCode(args[0]);
    if (!formattedRjCode) {
      await session.send("RJ 号格式错误。");
      return;
    }
    const optionKeywords = [SendMode.CARD, SendMode.FILE, SendMode.ZIP];
    let userOption = null;
    const potentialOption = args[args.length - 1];
    if (optionKeywords.includes(potentialOption)) {
      userOption = potentialOption;
      args.pop();
    }
    const selectionArgs = args.slice(1);
    const uniqueIndices = parseTrackIndices(selectionArgs);
    const rid = formattedRjCode.substring(2);
    if (uniqueIndices.length > 0) {
      try {
        const [workInfo, trackData] = await Promise.all([this.api.getWorkInfo(rid), this.api.getTracks(rid)]);
        if (!workInfo || !trackData) {
          await session.send("获取信息失败。");
          return;
        }
        const { processedFiles } = processFileTree(trackData);
        await this.sender.processAndSendTracks(uniqueIndices, processedFiles, workInfo, session, userOption || this.config.defaultSendMode);
      } catch (error) {
        if (this.ctx.http.isError(error) && error.response?.status === 404) {
          await session.send("未找到该作品。");
          return;
        }
        this.logger.error(error);
        await session.send("查询失败：内部错误。");
        return;
      }
    } else {
      await this.handleWorkSelection(session, formattedRjCode);
    }
  }
  async handleWorkSelection(session, rjCode) {
    const rid = rjCode.substring(2);
    try {
      await session.send(`查询中：${rjCode}...`);
      const [workInfo, trackData] = await Promise.all([this.api.getWorkInfo(rid), this.api.getTracks(rid)]);
      if (!workInfo || !trackData) {
        await session.send("获取信息失败。");
        return;
      }
      const { displayItems, processedFiles } = processFileTree(trackData);
      if (processedFiles.length === 0) {
        await session.send("该作品无可下载文件。");
        return;
      }
      await this.sendWorkInfo(session, workInfo, displayItems, rjCode);
      await session.send(`请在 ${this.config.interactionTimeout} 秒内回复序号 (如 1 3-5 [模式]) 或 N 取消。模式可选card|file|zip`);
      const interactionKey = `${session.platform}:${session.userId}`;
      this.activeInteractions.add(interactionKey);
      const timer = setTimeout(() => {
        this.activeInteractions.delete(interactionKey);
        dispose();
        session.send("操作超时。");
      }, this.config.interactionTimeout * 1e3);
      const dispose = this.ctx.middleware(async (midSession, next) => {
        if (midSession.userId !== session.userId || midSession.channelId !== session.channelId) return next();
        try {
          const choice = midSession.content.trim().toLowerCase();
          if (choice === "n" || choice === "取消") {
            await midSession.send("操作已取消。");
            return;
          }
          const replyArgs = choice.replace(/,/g, " ").split(/\s+/).filter(Boolean);
          let mode = null;
          if ([SendMode.CARD, SendMode.FILE, SendMode.ZIP].includes(replyArgs[replyArgs.length - 1])) {
            mode = replyArgs.pop();
          }
          const uniqueIndices = parseTrackIndices(replyArgs);
          if (uniqueIndices.length === 0) {
            await midSession.send("输入无效，操作取消。");
            return;
          }
          await this.sender.processAndSendTracks(uniqueIndices, processedFiles, workInfo, midSession, mode || this.config.defaultSendMode);
        } catch (error) {
          this.logger.error("处理用户交互时发生错误: %o", error);
          await midSession.send("交互失败：内部错误。");
        } finally {
          this.activeInteractions.delete(interactionKey);
          dispose();
          clearTimeout(timer);
        }
      }, true);
    } catch (error) {
      if (this.ctx.http.isError(error) && error.response?.status === 404) {
        await session.send("未找到该作品。");
      } else {
        this.logger.error(error);
        await session.send("查询失败：内部错误。");
      }
    }
  }
  async handleListInteraction(session, page, fetcher, listTitle, onNextPage) {
    const interactionKey = `${session.platform}:${session.userId}`;
    try {
      await session.send(`获取中... (${listTitle} - P${page})`);
      const data = await fetcher(page);
      if (!data?.works?.length) {
        await session.send(data?.pagination?.totalCount === 0 ? "未找到结果。" : "无更多结果。");
        this.activeInteractions.delete(interactionKey);
        return;
      }
      if (this.config.useImageMenu && this.ctx.puppeteer) {
        const html = this.renderer.createSearchHtml(data.works, listTitle, page, data.pagination.totalCount, this.config);
        const imageBuffer = await this.renderer.renderHtmlToImage(html);
        if (imageBuffer) await session.send(import_koishi3.h.image(imageBuffer, "image/png"));
        else await this.sendSearchTextResult(session, data, page);
      } else {
        await this.sendSearchTextResult(session, data, page);
      }
      await session.send(`请在 ${this.config.interactionTimeout} 秒内回复序号选择，F 翻页，N 取消。`);
      const timer = setTimeout(() => {
        this.activeInteractions.delete(interactionKey);
        dispose();
        session.send("操作超时。");
      }, this.config.interactionTimeout * 1e3);
      const dispose = this.ctx.middleware(async (midSession, next) => {
        if (midSession.userId !== session.userId || midSession.channelId !== session.channelId) return next();
        const content = midSession.content.trim().toLowerCase();
        const choice = parseInt(content, 10);
        const localIndex = choice - (page - 1) * this.config.pageSize;
        const isChoiceInvalid = isNaN(choice) || localIndex < 1 || localIndex > data.works.length;
        if (content !== "f" && content !== "n" && content !== "取消" && isChoiceInvalid) {
          return next();
        }
        try {
          if (content === "f") {
            onNextPage(midSession, page + 1);
            return;
          }
          if (content === "n" || content === "取消") {
            await midSession.send("操作已取消。");
            return;
          }
          const selectedWork = data.works[localIndex - 1];
          this.handleWorkSelection(midSession, `RJ${String(selectedWork.id).padStart(8, "0")}`);
        } catch (error) {
          this.logger.error("处理列表交互时发生错误: %o", error);
          await midSession.send("交互失败：内部错误。");
        } finally {
          this.activeInteractions.delete(interactionKey);
          dispose();
          clearTimeout(timer);
        }
      }, true);
    } catch (error) {
      this.logger.error("获取列表时发生内部错误: %o", error);
      await session.send("列表获取失败：内部错误。");
      this.activeInteractions.delete(interactionKey);
    }
  }
  // sendWorkInfo 和 sendSearchTextResult 中的文本保持不变，因为它们是数据展示的主体，精简会导致信息丢失。
  // ... (sendWorkInfo, sendWorkInfoAsText, sendSearchTextResult 方法保持原样)
  async sendWorkInfo(session, workInfo, displayItems, rjCode) {
    if (this.config.useImageMenu && this.ctx.puppeteer) {
      let linksHtml = "";
      if (this.config.showLinks) {
        const asmrOneUrl = `https://asmr.one/work/${rjCode}`;
        linksHtml = `<div class="links"><span><strong>ASMR.one:</strong> <a href="${asmrOneUrl}">${import_koishi3.h.escape(asmrOneUrl)}</a></span>${workInfo.source_url ? `<span><strong>DLsite:</strong> <a href="${workInfo.source_url}">${import_koishi3.h.escape(workInfo.source_url)}</a></span>` : ""}</div>`;
      }
      const html = this.renderer.createWorkInfoHtml(workInfo, displayItems, linksHtml);
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

// src/commands/popular.ts
function registerPopularCommand(ctx, handler) {
  ctx.command("热门音声 [page:number]", "获取当前热门音声列表").action(async ({ session }, page) => handler.handlePopular(session, page));
}
__name(registerPopularCommand, "registerPopularCommand");

// src/commands/search.ts
function registerSearchCommand(ctx, handler) {
  ctx.command("搜音声 <query:text>", "搜索音声作品").action(async ({ session }, query) => handler.handleSearch(session, query));
}
__name(registerSearchCommand, "registerSearchCommand");

// src/commands/listen.ts
function registerListenCommand(ctx, handler) {
  ctx.command("听音声 <query:text>", "获取并收听音声").action(async ({ session }, query) => handler.handleListen(session, query));
}
__name(registerListenCommand, "registerListenCommand");

// src/config.ts
var import_koishi4 = require("koishi");
var Config = import_koishi4.Schema.intersect([
  import_koishi4.Schema.object({
    apiBaseUrl: import_koishi4.Schema.union([
      import_koishi4.Schema.const("https://api.asmr.one/api").description("asmr.one(国内墙)"),
      import_koishi4.Schema.const("https://api.asmr-100.com/api").description("asmr-100.com(国内墙)"),
      import_koishi4.Schema.const("https://api.asmr-200.com/api").description("asmr-200.com(随缘墙)"),
      import_koishi4.Schema.const("https://api.asmr-300.com/api").description("asmr-300.com(随缘墙)"),
      import_koishi4.Schema.string().description("自定义 API 地址")
    ]).default("https://api.asmr-200.com/api").description("音声数据 API 地址。"),
    useForward: import_koishi4.Schema.boolean().default(false).description("(文本模式) 启用合并转发发送长消息。"),
    showSearchImage: import_koishi4.Schema.boolean().default(false).description("(文本模式) 搜索结果中显示封面图 (有风控风险)。"),
    useImageMenu: import_koishi4.Schema.boolean().default(true).description("启用图片菜单 (需 puppeteer)。"),
    showLinks: import_koishi4.Schema.boolean().default(false).description("在详情中显示 asmr.one/DLsite 链接。"),
    pageSize: import_koishi4.Schema.number().min(1).max(40).default(10).description("每页结果数量 (1-40)。"),
    interactionTimeout: import_koishi4.Schema.number().min(15).default(60).description("交互操作超时时间 (秒)。")
  }).description("基础设置"),
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
      import_koishi4.Schema.const(SendMode.ZIP).description("压缩包 (zip)")
    ]).default(SendMode.FILE).description("默认音轨发送方式。"),
    cardModeNonAudioAction: import_koishi4.Schema.union([
      import_koishi4.Schema.const(CardModeNonAudioAction.SKIP).description("跳过 (默认)"),
      import_koishi4.Schema.const(CardModeNonAudioAction.FALLBACK).description("转为 file 模式发送")
    ]).default(CardModeNonAudioAction.SKIP).description("Card模式下对非音频文件的操作。"),
    downloadTimeout: import_koishi4.Schema.number().default(300).description("单文件下载超时 (秒)。")
  }).description("下载与发送设置"),
  import_koishi4.Schema.object({
    prependRjCodeCard: import_koishi4.Schema.boolean().default(false).description("Card 标题添加 RJ 号。"),
    prependRjCodeFile: import_koishi4.Schema.boolean().default(true).description("File 文件名添加 RJ 号。"),
    prependRjCodeZip: import_koishi4.Schema.boolean().default(true).description("Zip 包名/文件夹添加 RJ 号。")
  }).description("命名规则设置"),
  import_koishi4.Schema.object({
    zipMode: import_koishi4.Schema.union([
      import_koishi4.Schema.const(ZipMode.SINGLE).description("合并为一包"),
      import_koishi4.Schema.const(ZipMode.MULTIPLE).description("每轨一包")
    ]).default(ZipMode.SINGLE).description("多文件压缩方式 (对所有 zip 发送生效)。"),
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
注意：部分内容可能不适合在所有场合使用 (NSFW)，请在合适的范围内使用本插件。

---

### 搜音声 <关键词> [页数]
搜索音声作品
- **关键词**: 必需。 多个标签请用 / 分割。
- **页数**: 可选。 结果的页码。
- **示例**: \`搜音声 催眠/JK 2\`

### 热门音声 [页数]
获取当前热门作品列表
- **页数**: 可选。 结果的页码。
- **示例**: \`热门音声 2\`

### 听音声 <RJ号> [音轨序号...] [选项]
获取作品信息并发送音轨
- **RJ号**: 必需。 作品ID, 如 \`RJ01234567\` 或 \`123456\`。
- **音轨序号**: 可选。 一个或多个音轨的数字序号, 用空格分隔。
- **选项**: 可选。 发送方式 \`card\` | \`file\` | \`zip\`。若省略则使用默认配置。

**使用方式:**
1. 获取详情 (等待交互): \`听音声 RJ01234567\`
2. 直接获取指定音轨并发送压缩包: \`听音声 RJ01234567 1 3 5 zip\`

**交互说明:**
- 在列表指令后, 可回复【序号】选择, 回复【f】翻页。
- 所有交互均可通过回复【n/取消】来中断。

---

**注意:**
- 发送图片或文件失败通常由平台风控导致。
- 音乐卡片(card)模式可能需要签名服务, 且仅在部分适配器 (如 OneBot) 上可用。
`;
function apply(ctx, config) {
  const logger = ctx.logger("asmrone");
  const tempDir = (0, import_path2.resolve)(ctx.baseDir, "temp", "asmrone");
  const api = new AsmrApi(ctx, config);
  const renderer = new Renderer(ctx);
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
