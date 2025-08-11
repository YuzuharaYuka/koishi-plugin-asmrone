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
var import_path = require("path");
var import_fs = require("fs");
var import_fs2 = require("fs");
var import_url = require("url");
var import_koishi = require("koishi");
var import_archiver = __toESM(require("archiver"));
if (!import_archiver.default.isRegisteredFormat("zip-encrypted")) {
  import_archiver.default.registerFormat("zip-encrypted", require("archiver-zip-encrypted"));
}
var name = "asmrone";
var inject = ["http"];
var Config = import_koishi.Schema.intersect([
  import_koishi.Schema.object({
    useForward: import_koishi.Schema.boolean().default(true).description("在 QQ 等平台使用合并转发的形式发送长消息。"),
    showSearchImage: import_koishi.Schema.boolean().default(false).description("在“搜音声”结果中显示封面图。\n\n注意：开启此项会增加图片消息被平台审查导致发送失败的风险。")
  }).description("基础设置"),
  import_koishi.Schema.object({
    accessMode: import_koishi.Schema.union([
      import_koishi.Schema.const("all").description("所有群聊均可使用"),
      import_koishi.Schema.const("whitelist").description("白名单模式"),
      import_koishi.Schema.const("blacklist").description("黑名单模式")
    ]).default("all").description("访问权限模式"),
    whitelist: import_koishi.Schema.array(import_koishi.Schema.string()).default([]).description("白名单列表（仅在白名单模式下生效）。请填入群号或频道 ID。"),
    blacklist: import_koishi.Schema.array(import_koishi.Schema.string()).default([]).description("黑名单列表（仅在黑名单模式下生效）。请填入群号或频道 ID。")
  }).description("权限设置"),
  import_koishi.Schema.object({
    defaultSendMode: import_koishi.Schema.union([
      import_koishi.Schema.const("card").description("音乐卡片 (card)"),
      import_koishi.Schema.const("file").description("音频文件 (file)"),
      import_koishi.Schema.const("zip").description("压缩包 (zip)")
    ]).default("file").description("**默认发送方式**：在指令中未指定发送方式时，采用此设置。")
  }).description("下载与发送设置"),
  import_koishi.Schema.union([
    import_koishi.Schema.object({
      // 当默认模式是 zip 时，才显示这些相关配置
      defaultSendMode: import_koishi.Schema.const("zip").required(),
      zipMode: import_koishi.Schema.union([
        import_koishi.Schema.const("single").description("合并为一个压缩包"),
        import_koishi.Schema.const("multiple").description("每个音轨一个压缩包")
      ]).default("single").description("多音轨压缩方式"),
      usePassword: import_koishi.Schema.boolean().default(false).description("是否为压缩包添加密码。")
    }),
    import_koishi.Schema.object({})
  ]),
  import_koishi.Schema.union([
    import_koishi.Schema.object({
      // 当启用了密码时，才显示密码输入框
      defaultSendMode: import_koishi.Schema.const("zip").required(),
      usePassword: import_koishi.Schema.const(true).required(),
      password: import_koishi.Schema.string().role("secret").default("0721").description("压缩包密码。")
    }),
    import_koishi.Schema.object({})
  ])
]);
var usage = `

##	注意：部分内容可能不适合在所有场合使用 (NSFW)，请在合适的范围内使用本插件。

## 插件指令

### 搜音声 <关键词> [页数]: 搜索音声作品。
*	**示例 ：** \`搜音声 藤田茜\` 
	*	如果想使用多个标签进行搜索，请用 / 分割，例如：\`搜音声 催眠/JK 2\`

### 听音声 <RJ号> [序号] [选项]: 获取音声信息并收听。
*   **选项 (可选参数):**
    *   **card**: 以音乐卡片形式发送 (仅测试了onebot平台和napcat框架，其他情况可能需要配置签名服务或是不可用)。
    *   **file**: 逐个发送音频文件。
    *   **zip**: 将所有请求的音轨打包成ZIP压缩包发送。
	*	如果未提供选项，将使用插件配置中的【默认发送方式】。
*   **示例 1 (使用默认方式):** \`听音声 RJ00123456\`
	*	返回作品的详细信息和音轨列表，可以根据提示回复序号进行处理。
*   **示例 2 (指定发送卡片):** \`听音声 RJ00123456 3 card\`
	*	直接获取第 3 个音轨，并以音乐卡片形式发送。
*   **示例 3 (指定发送压缩包):** \`听音声 RJ00123456 1 3 5 zip\`
    *	一次性处理第 1, 3, 5 个音轨，并打包成 ZIP 发送。
    
### 注意：在 QQ 平台发送失败大概率是平台风控导致。
`;
function apply(ctx, config) {
  const logger = ctx.logger("asmrone");
  const tempDir = (0, import_path.resolve)(ctx.baseDir, "temp", "asmrone");
  function isAccessAllowed(session) {
    if (session.isDirect) return true;
    if (!session.guildId) return false;
    if (config.accessMode === "whitelist") return config.whitelist.includes(session.guildId);
    else if (config.accessMode === "blacklist") return !config.blacklist.includes(session.guildId);
    return true;
  }
  __name(isAccessAllowed, "isAccessAllowed");
  ctx.on("ready", async () => {
    try {
      await import_fs.promises.mkdir(tempDir, { recursive: true });
      logger.info("临时文件目录已创建: %s", tempDir);
    } catch (error) {
      logger.error("创建临时文件目录失败: %o", error);
    }
  });
  const requestOptions = {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0" }
  };
  function formatDuration(seconds) {
    if (isNaN(seconds) || seconds < 0) return "未知";
    const h2 = Math.floor(seconds / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = seconds % 60;
    let result = "";
    if (h2 > 0) result += `${h2}小时`;
    if (m > 0 || h2 > 0) result += `${m}分`;
    result += `${s}秒`;
    return result;
  }
  __name(formatDuration, "formatDuration");
  function flattenTracks(items) {
    const tracks = [];
    function processItem(item) {
      if (item.type === "audio" && item.mediaDownloadUrl) tracks.push({ title: item.title, url: item.mediaDownloadUrl });
      else if (item.type === "folder" && item.children) item.children.forEach(processItem);
    }
    __name(processItem, "processItem");
    items.forEach(processItem);
    return tracks;
  }
  __name(flattenTracks, "flattenTracks");
  const getSafeFilename = /* @__PURE__ */ __name((name2, ext = "") => name2.replace(/[\/\\?%*:|"<>]/g, "_") + ext, "getSafeFilename");
  const getZipFilename = /* @__PURE__ */ __name((baseName) => `${baseName.replace(/[\/\\?%*:|"<>]/g, "_")}.zip`, "getZipFilename");
  async function createZipArchive(filesToPack, outputZipName) {
    return new Promise((promiseResolve, promiseReject) => {
      const tempZipPath = (0, import_path.resolve)(tempDir, outputZipName);
      const output = (0, import_fs2.createWriteStream)(tempZipPath);
      const archive = config.usePassword && config.password ? import_archiver.default.create("zip-encrypted", { encryptionMethod: "aes256", password: config.password }) : (0, import_archiver.default)("zip", { zlib: { level: 9 } });
      output.on("close", () => promiseResolve(tempZipPath));
      archive.on("warning", (err) => logger.warn("Archiver warning: %o", err));
      archive.on("error", (err) => promiseReject(err));
      archive.pipe(output);
      for (const file of filesToPack) {
        archive.append(Buffer.from(file.data), { name: file.name });
      }
      archive.finalize();
    });
  }
  __name(createZipArchive, "createZipArchive");
  async function processAndSendTracks(indices, allTracks, workInfo, session, mode) {
    const validTracks = indices.map((i) => ({ index: i, track: allTracks[i - 1] })).filter((item) => item.track);
    if (validTracks.length === 0) {
      await session.send("未找到任何有效的音轨序号。");
      return;
    }
    if (mode === "card") {
      if (session.platform !== "onebot") {
        await session.send("音乐卡片模式 (card) 仅在 onebot 平台受支持，已自动切换为发送文件。");
        await processAndSendTracks(indices, allTracks, workInfo, session, "file");
        return;
      }
      await session.send(`正在为 ${validTracks.length} 个音轨生成音乐卡片...`);
      const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
      const asmrOneUrl = `https://asmr.one/work/${rjCode}`;
      for (const { index, track } of validTracks) {
        try {
          const onebotMessageArray = [{
            type: "music",
            data: { type: "163", url: workInfo.source_url || asmrOneUrl, audio: track.url, title: track.title, content: workInfo.name, image: workInfo.mainCoverUrl }
          }];
          logger.info(`[asmrone] 发送音乐卡片: %j`, onebotMessageArray);
          await session.bot.internal.sendGroupMsg(session.guildId, onebotMessageArray);
        } catch (error) {
          logger.error("发送音乐卡片 %s 失败: %o", index, error);
          await session.send(`发送音轨 ${index} 「${import_koishi.h.escape(track.title)}」的音乐卡片失败。`);
        }
      }
    } else if (mode === "zip") {
      if (config.zipMode === "single" && validTracks.length > 0) {
        await session.send(`正在准备合并压缩包，共 ${validTracks.length} 个音轨...`);
        let tempZipPath;
        try {
          const downloadedFiles = [];
          for (const { index, track } of validTracks) {
            try {
              await session.send(`  ↳ 正在下载音轨 ${index}: 「${import_koishi.h.escape(track.title)}」...`);
              const audioBuffer = await ctx.http.get(track.url, { ...requestOptions, responseType: "arraybuffer", timeout: 300 * 1e3 });
              if (!audioBuffer || audioBuffer.byteLength < 100) throw new Error("文件为空或过小");
              downloadedFiles.push({ name: getSafeFilename(track.title), data: new Uint8Array(audioBuffer) });
            } catch (error) {
              logger.error("下载音轨 %s 失败: %o", index, error);
              await session.send(`下载音轨 ${index} 「${import_koishi.h.escape(track.title)}」失败，已跳过。`);
            }
          }
          if (downloadedFiles.length > 0) {
            const zipFilename = getZipFilename(workInfo.title);
            await session.send(`正在创建压缩包 「${import_koishi.h.escape(zipFilename)}」...`);
            tempZipPath = await createZipArchive(downloadedFiles, zipFilename);
            await session.send(`压缩包已创建，正在发送...`);
            await session.send((0, import_koishi.h)("file", { src: (0, import_url.pathToFileURL)(tempZipPath).href, title: zipFilename }));
            if (config.usePassword && config.password) await session.send(`压缩包密码为: ${config.password}`);
          } else {
            await session.send("所有音轨均下载失败，无法创建压缩包。");
          }
        } catch (error) {
          logger.error("创建或发送合并压缩包失败: %o", error);
          await session.send("创建或发送压缩包失败，详情请检查后台日志。");
        } finally {
          if (tempZipPath) await import_fs.promises.unlink(tempZipPath).catch((e) => logger.warn("删除临时压缩包失败: %s", e));
        }
      } else if (config.zipMode === "multiple" && validTracks.length > 0) {
        await session.send(`正在准备单独压缩，共 ${validTracks.length} 个音轨...`);
        for (const { index, track } of validTracks) {
          let tempZipPath;
          try {
            await session.send(`正在处理音轨 ${index}: 「${import_koishi.h.escape(track.title)}」...`);
            const audioBuffer = await ctx.http.get(track.url, { ...requestOptions, responseType: "arraybuffer", timeout: 300 * 1e3 });
            if (!audioBuffer || audioBuffer.byteLength < 100) throw new Error("文件为空或过小");
            const filesToPack = [{ name: getSafeFilename(track.title), data: new Uint8Array(audioBuffer) }];
            const zipFilename = getZipFilename(track.title);
            tempZipPath = await createZipArchive(filesToPack, zipFilename);
            await session.send(`压缩包「${import_koishi.h.escape(zipFilename)}」已创建，正在发送...`);
            await session.send((0, import_koishi.h)("file", { src: (0, import_url.pathToFileURL)(tempZipPath).href, title: zipFilename }));
          } catch (error) {
            logger.error("创建或发送独立压缩包失败: %o", error);
            await session.send(`处理音轨 ${index} 失败，详情请检查后台日志。`);
          } finally {
            if (tempZipPath) await import_fs.promises.unlink(tempZipPath).catch((e) => logger.warn("删除临时压缩包失败: %s", e));
          }
        }
        if (config.usePassword && config.password) await session.send(`所有压缩包的密码统一为: ${config.password}`);
      }
    } else {
      await session.send("将开始逐个发送音频文件，请稍候...");
      for (const { index, track } of validTracks) {
        let tempFilePath;
        try {
          await session.send(`正在下载音轨 ${index}: 「${import_koishi.h.escape(track.title)}」...`);
          const audioBuffer = await ctx.http.get(track.url, { ...requestOptions, responseType: "arraybuffer", timeout: 300 * 1e3 });
          if (!audioBuffer || audioBuffer.byteLength < 100) throw new Error("文件为空或过小");
          tempFilePath = (0, import_path.resolve)(tempDir, getSafeFilename(track.title));
          await import_fs.promises.writeFile(tempFilePath, Buffer.from(audioBuffer));
          await session.send(`下载完成，正在发送文件: 「${import_koishi.h.escape(track.title)}」`);
          await session.send((0, import_koishi.h)("file", { src: (0, import_url.pathToFileURL)(tempFilePath).href, title: track.title }));
        } catch (error) {
          logger.error("下载或发送音频文件失败: %o", error);
          await session.send(`处理音轨 ${index} 失败，详情请检查后台日志。`);
        } finally {
          if (tempFilePath) await import_fs.promises.unlink(tempFilePath).catch((e) => logger.warn("删除临时文件失败: %s", e));
        }
      }
    }
    await session.send("所有请求的音轨已处理完毕。");
  }
  __name(processAndSendTracks, "processAndSendTracks");
  ctx.command("搜音声 <query:text>", "搜索音声作品").action(async ({ session }, query) => {
    if (!isAccessAllowed(session)) return "本群聊/频道无权使用此功能。";
    if (!query) return "请输入搜索关键词！";
    const args = query.trim().split(/\s+/);
    const keyword = args[0].replace(/\//g, "%20");
    const page = args[1] && /^\d+$/.test(args[1]) ? parseInt(args[1], 10) : 1;
    await session.send(`正在搜索“${args[0]}”，第 ${page} 页...`);
    try {
      const url = `https://api.asmr-200.com/api/search/${keyword}?order=dl_count&sort=desc&page=${page}&pageSize=10&subtitle=0&includeTranslationWorks=true`;
      const data = await ctx.http.get(url, requestOptions);
      if (!data || !data.works || data.works.length === 0) {
        if (data && data.pagination?.totalCount === 0) return "搜索结果为空。";
        if (data && data.pagination) return `当前页无结果。此搜索共有 ${data.pagination.totalCount} 个结果。`;
        return "搜索结果为空或API返回格式不正确。";
      }
      const header = `为你找到 ${data.pagination.totalCount} 个结果 (第 ${page} 页):`;
      const footer = "请使用 `听音声 <RJ号> [选项]` 获取详细信息和收听。";
      if (config.useForward && session.platform === "onebot") {
        const messageNodes = [(0, import_koishi.h)("message", { nickname: session.bot.user?.name || session.bot.selfId }, header)];
        data.works.forEach((work, index) => {
          const rjCode = `RJ${String(work.id).padStart(8, "0")}`;
          const cvs = work.vas.map((v) => v.name).join(", ") || "未知";
          const tags = work.tags.slice(0, 5).map((t) => t.name).join(", ");
          const entryText = [`${index + 1}. 【${rjCode}】${import_koishi.h.escape(work.title)}`, `   评分: ⭐️ ${work.rate_average_2dp} (${work.rate_count}人)`, `   销量: 📥 ${work.dl_count}`, `   日期: 📅 ${work.release}`, `   声优: 🎤 ${import_koishi.h.escape(cvs)}`, `   标签: 🏷️ ${import_koishi.h.escape(tags)}`].join("\n");
          if (config.showSearchImage) {
            messageNodes.push((0, import_koishi.h)("message", { nickname: `结果 ${index + 1}` }, [import_koishi.h.image(work.mainCoverUrl), "\n", entryText]));
          } else {
            messageNodes.push((0, import_koishi.h)("message", { nickname: `结果 ${index + 1}` }, entryText));
          }
        });
        await session.send((0, import_koishi.h)("figure", messageNodes));
      } else {
        const messageElements = [header];
        data.works.forEach((work) => {
          const rjCode = `RJ${String(work.id).padStart(8, "0")}`;
          const cvs = work.vas.map((v) => v.name).join(", ") || "未知";
          const tags = work.tags.slice(0, 5).map((t) => t.name).join(", ");
          const entryText = [`【${rjCode}】${import_koishi.h.escape(work.title)}`, `   评分: ⭐️ ${work.rate_average_2dp} (${work.rate_count}人)`, `   销量: 📥 ${work.dl_count}`, `   日期: 📅 ${work.release}`, `   声优: 🎤 ${import_koishi.h.escape(cvs)}`, `   标签: 🏷️ ${import_koishi.h.escape(tags)}`].join("\n");
          if (config.showSearchImage) {
            messageElements.push((0, import_koishi.h)("image", { src: work.mainCoverUrl }));
          }
          messageElements.push(entryText);
        });
        await session.send(messageElements);
      }
      await session.send(footer);
      return;
    } catch (error) {
      logger.error(error);
      return "搜索时发生内部错误。";
    }
  });
  ctx.command("听音声 <query:text>", "获取并收听音声").action(async ({ session }, query) => {
    if (!isAccessAllowed(session)) return "本群聊/频道无权使用此功能。";
    if (!query) return "请输入 RJ 号！";
    const args = query.trim().split(/\s+/).filter(Boolean);
    const rjWithPrefix = args[0].toUpperCase();
    if (!/^RJ\d+$/.test(rjWithPrefix)) return "输入的RJ号格式不正确，必须以RJ开头。";
    const optionKeywords = ["card", "file", "zip"];
    let userOption = null;
    let trackIndices = [];
    const potentialOption = args[args.length - 1];
    if (optionKeywords.includes(potentialOption)) {
      userOption = potentialOption;
      args.pop();
    }
    trackIndices = args.slice(1).map((arg) => parseInt(arg, 10)).filter((num) => !isNaN(num) && num > 0);
    const finalSendMode = userOption || config.defaultSendMode;
    const rid = rjWithPrefix.substring(2);
    try {
      await session.send(`正在查询音声 ${rjWithPrefix} 的信息...`);
      const [workInfo, trackData] = await Promise.all([
        ctx.http.get(`https://api.asmr-200.com/api/workInfo/${rid}`, requestOptions),
        ctx.http.get(`https://api.asmr-200.com/api/tracks/${rid}`, requestOptions)
      ]);
      if (!workInfo || !trackData) return "获取音声信息失败，API可能返回了无效数据。";
      const allTracks = flattenTracks(trackData);
      if (allTracks.length === 0) return "找到了作品信息，但未能获取到任何有效音轨。";
      if (trackIndices.length > 0) {
        await processAndSendTracks(trackIndices, allTracks, workInfo, session, finalSendMode);
        return;
      }
      const rjCode = `RJ${String(workInfo.id).padStart(8, "0")}`;
      const cvs = workInfo.vas.map((v) => v.name).join(", ") || "未知";
      const tags = workInfo.tags.map((t) => t.name).join(", ");
      const asmrOneUrl = `https://asmr.one/work/${rjCode}`;
      const infoBlock = [`【${rjCode}】`, `标题: ${import_koishi.h.escape(workInfo.title)}`, `社团: ${import_koishi.h.escape(workInfo.name)}`, `日期: 📅 ${workInfo.release}`, `评分: ⭐️ ${workInfo.rate_average_2dp} (${workInfo.rate_count}人评价)`, `销量: 📥 ${workInfo.dl_count}`, `时长: ⏱️ ${formatDuration(workInfo.duration)}`, `声优: 🎤 ${import_koishi.h.escape(cvs)}`, `标签: 🏷️ ${import_koishi.h.escape(tags)}`, `asmr.one链接: ${asmrOneUrl}`, `DLsite链接: ${workInfo.source_url}`].join("\n");
      const trackListText = `--- 音轨列表 ---
` + allTracks.map((track, index) => `${index + 1}. ${import_koishi.h.escape(track.title)}`).join("\n");
      const instruction = `请在60秒内回复一个或多个[序号]，可选发送[card|file|zip]，留空则为默认配置。
示例："1 2 3 card"。`;
      if (config.useForward && session.platform === "onebot") {
        const messageElements = [(0, import_koishi.h)("message", { nickname: "作品详情" }, [import_koishi.h.image(workInfo.mainCoverUrl), "\n" + infoBlock]), (0, import_koishi.h)("message", { nickname: "音轨列表" }, trackListText)];
        await session.send((0, import_koishi.h)("figure", messageElements));
      } else {
        const messageText = [infoBlock, "-------------------", trackListText].join("\n\n");
        await session.send(import_koishi.h.image(workInfo.mainCoverUrl) + messageText);
      }
      await session.send(instruction);
      const dispose = ctx.middleware(async (middlewareSession, next) => {
        if (middlewareSession.userId !== session.userId || middlewareSession.channelId !== session.channelId) return next();
        dispose();
        clearTimeout(timer);
        const choice = middlewareSession.content.trim();
        if (["取消", "cancel"].includes(choice.toLowerCase())) {
          await middlewareSession.send("操作已取消。");
          return;
        }
        const replyArgs = choice.replace(/,/g, " ").split(/\s+/).filter(Boolean);
        let modeFromReply = null;
        const lastArg = replyArgs[replyArgs.length - 1];
        if (optionKeywords.includes(lastArg)) {
          modeFromReply = lastArg;
          replyArgs.pop();
        }
        const indicesFromReply = [...new Set(replyArgs.map((s) => parseInt(s, 10)).filter((n) => !isNaN(n) && n > 0))];
        if (indicesFromReply.length === 0) {
          await middlewareSession.send("输入无效，请输入一个或多个有效的音轨序号。");
          return;
        }
        const modeForThisSend = modeFromReply || finalSendMode;
        await processAndSendTracks(indicesFromReply, allTracks, workInfo, middlewareSession, modeForThisSend);
        return;
      }, true);
      const timer = setTimeout(() => {
        dispose();
        session.send("选择超时，操作已自动取消。");
      }, 6e4);
    } catch (error) {
      if (ctx.http.isError(error) && error.response?.status === 404) {
        return "未找到该 RJ 号对应的音声信息。";
      }
      logger.error(error);
      return "查询时发生内部错误。";
    }
  });
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
