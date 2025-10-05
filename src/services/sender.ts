// --- START OF FILE src/services/sender.ts ---

import { Context, Session, h, Logger } from 'koishi'
import { resolve } from 'path'
import { promises as fs, createWriteStream } from 'fs'
import { pathToFileURL } from 'url'
import archiver from 'archiver'
import pako from 'pako'
import { ProcessedFile, ValidFile, WorkInfoResponse } from '../common/types'
import { Config } from '../config'
import { SendMode, ZipMode, CardModeNonAudioAction, VoiceModeNonAudioAction, USER_AGENT, RETRY_DELAY_MS, MIN_FILE_SIZE_BYTES, LINK_SEND_DELAY_MS, ONEBOT_MUSIC_CARD_TYPE } from '../common/constants'
import { getSafeFilename, getZipFilename } from '../common/utils'

// --- V10 Payload 扩充字典 ---
const URL_DICTIONARY = {
  // d0-d9: API & Cover Domains
  'd0': 'https://api.asmr-200.com/api/',
  'd1': 'https://api.asmr.one/api/',
  'd2': 'https://api.asmr-100.com/api/',
  'd3': 'https://api.asmr-300.com/api/',
  // a0-a9: Audio CDN Domains
  'a0': 'https://raw.kiko-play-niptan.one/',
  'a1': 'https://fast.kiko-play-niptan.one/',
  'a2': 'https://large.kiko-play-niptan.one/',
  // p0-p9: Common Paths
  'p0': 'cover/',
  'p1': 'media/download/',
  'p2': 'media/stream/',
};
// 预处理字典，按前缀长度降序排序，以便优先匹配最长的前缀
const DICTIONARY_ENTRIES = Object.entries(URL_DICTIONARY).sort((a, b) => b[1].length - a[1].length);

interface SendResultTracker {
  success: number;
  failed: number;
  reasons: Set<string>;
}

export class TrackSender {
  private logger: Logger
  // 修正：将 User--Agent 改为标准的 User-Agent
  private requestOptions = {
    headers: { 'User-Agent': USER_AGENT },
  }

  constructor(private ctx: Context, private config: Config, private tempDir: string) {
    this.logger = ctx.logger('asmrone')
  }

  // 辅助函数：压缩单个 URL (优化版)
  private _compressUrl(url: string): string | (string | (string | string[])[])[] {
    // 寻找域名+路径的最佳匹配
    for (const [domainKey, domainPrefix] of DICTIONARY_ENTRIES.filter(([k]) => k.startsWith('d') || k.startsWith('a'))) {
      if (url.startsWith(domainPrefix)) {
        const remainingPath = url.substring(domainPrefix.length);
        for (const [pathKey, pathPrefix] of DICTIONARY_ENTRIES.filter(([k]) => k.startsWith('p'))) {
          if (remainingPath.startsWith(pathPrefix)) {
            // 匹配到 域名+路径
            return [[domainKey, pathKey], remainingPath.substring(pathPrefix.length)];
          }
        }
        // 只匹配到域名
        return [domainKey, remainingPath];
      }
    }
    // 未找到任何匹配，返回原始URL
    return url;
  }

  /**
   * 生成并发送在线播放器链接
   * V10 Payload 结构:
   * {
   *   w: string,                  // Work Title
   *   r: string,                  // RJ Code (36进制压缩)
   *   c: string | [string, any],  // Cover URL (压缩后)
   *   t: [string | [string, any], string][] // Tracks: [[compressedUrl, trackTitle], ...]
   * }
   */
  private async _sendAsPlayer(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session, results: SendResultTracker) {
    const playerBaseUrl = this.config.player?.playerBaseUrl;
    if (!playerBaseUrl || !playerBaseUrl.startsWith('http')) {
      await session.send('错误：未配置或配置了无效的在线播放器地址 (playerBaseUrl)。');
      results.failed += validFiles.length;
      results.reasons.add('未配置播放器');
      return;
    }

    const audioFiles = validFiles.filter(vf => vf.file.type === 'audio');
    if (audioFiles.length === 0) {
      await session.send('选择的文件中没有可播放的音频。');
      return;
    }

    // 1. RJ号转为36进制以缩短长度
    const rjNum = parseInt(String(workInfo.id).replace(/^RJ/i, ''), 10);
    const compressedRj = rjNum.toString(36);

    // 2. 压缩封面和音轨URL
    const compressedCover = this._compressUrl(workInfo.mainCoverUrl);
    const tracks = audioFiles.map(({ file }) => [this._compressUrl(file.url), file.title]);

    // 3. 构建 V10 Payload
    const payload = {
      w: workInfo.title,
      r: compressedRj,
      c: compressedCover,
      t: tracks,
    };

    // 4. 压缩与编码
    const jsonString = JSON.stringify(payload);
    const compressed = pako.deflate(jsonString, { level: 9 });
    const base64Payload = Buffer.from(compressed).toString('base64url');
    const finalPlayerUrl = `${playerBaseUrl.endsWith('/') ? playerBaseUrl : playerBaseUrl + '/'}?p=${base64Payload}`;

    // 5. 发送消息
    try {
      const message = audioFiles.length > 1
        ? `已为您生成包含 ${audioFiles.length} 个音轨的播放列表，请点击下方链接收听：`
        : `请点击下方链接在线收听：`;
      await session.send(message);
      
      const linkMessage = this.config.useForward && session.platform === 'onebot'
        ? h('figure', h('message', { userId: session.bot.selfId, nickname: workInfo.title }, finalPlayerUrl))
        : finalPlayerUrl;

      await session.send(linkMessage);
      results.success += audioFiles.length;
    } catch (error) {
      this.logger.error('发送播放链接失败: %o', error);
      results.failed += audioFiles.length;
      results.reasons.add('发送失败');
      await session.send(`发送播放链接失败。`);
    }
  }

  async processAndSendTracks(indices: number[], allFiles: ProcessedFile[], workInfo: WorkInfoResponse, session: Session, mode: SendMode) {
    const validFiles: ValidFile[] = indices
      .map(i => ({ index: i, file: allFiles[i - 1] }))
      .filter(item => item.file);

    if (validFiles.length === 0) {
      await session.send('选择的序号无效。');
      return;
    }

    const results: SendResultTracker = { success: 0, failed: 0, reasons: new Set() };
    const nonAudioFilesToFallback: ValidFile[] = [];

    if (mode === SendMode.PLAYER) {
      await this._sendAsPlayer(validFiles, workInfo, session, results);
    }
    else if (mode === SendMode.CARD) {
      const audioFiles = validFiles.filter(vf => vf.file.type === 'audio');
      const nonAudioFiles = validFiles.filter(vf => vf.file.type !== 'audio');
      if (nonAudioFiles.length > 0) {
        if (this.config.cardModeNonAudioAction === CardModeNonAudioAction.FALLBACK) {
          await session.send(`Card模式：${nonAudioFiles.length} 个非音频文件将转为文件模式发送...`);
          nonAudioFilesToFallback.push(...nonAudioFiles);
        } else {
          await session.send(`Card模式：已跳过 ${nonAudioFiles.length} 个非音频文件。`);
        }
      }
      if (audioFiles.length > 0) await this._sendAsCard(audioFiles, workInfo, session, results);
    } else if (mode === SendMode.VOICE) {
      const audioFiles = validFiles.filter(vf => vf.file.type === 'audio');
      const nonAudioFiles = validFiles.filter(vf => vf.file.type !== 'audio');
      if (nonAudioFiles.length > 0) {
        if (this.config.voiceModeNonAudioAction === VoiceModeNonAudioAction.FALLBACK) {
          await session.send(`Voice模式：${nonAudioFiles.length} 个非音频文件将转为文件模式发送...`);
          nonAudioFilesToFallback.push(...nonAudioFiles);
        } else {
          await session.send(`Voice模式：已跳过 ${nonAudioFiles.length} 个非音频文件。`);
        }
      }
      if (audioFiles.length > 0) await this._sendAsVoice(audioFiles, workInfo, session, results);
    } else if (mode === SendMode.ZIP) {
      await this._sendAsZip(validFiles, workInfo, session, results);
    } else if (mode === SendMode.LINK) {
      await this._sendAsLink(validFiles, workInfo, session, results);
    }
    else {
      await this._sendAsFile(validFiles, workInfo, session, results);
    }

    if (nonAudioFilesToFallback.length > 0) {
      await this._sendAsFile(nonAudioFilesToFallback, workInfo, session, results);
    }

    let summary = '请求处理完毕。';
    if (results.success > 0) summary += ` 成功 ${results.success} 个。`;
    if (results.failed > 0) {
      summary += ` 失败 ${results.failed} 个。`;
      if (results.reasons.size > 0) {
        summary += ` 原因: ${[...results.reasons].join(', ')}。`;
      }
    }
    await session.send(summary);
  }

  private _findCommonBase(urls: string[]): string {
    if (!urls || urls.length === 0) return '';
    if (urls.length === 1) {
      const url = urls[0];
      const lastSlash = url.lastIndexOf('/');
      return lastSlash > -1 ? url.substring(0, lastSlash + 1) : '';
    }
    const sortedUrls = [...urls].sort();
    const first = sortedUrls[0];
    const last = sortedUrls[sortedUrls.length - 1];
    let i = 0;
    while (i < first.length && first[i] === last[i]) {
      i++;
    }
    const commonPrefix = first.substring(0, i);
    const lastSlash = commonPrefix.lastIndexOf('/');
    return lastSlash > -1 ? commonPrefix.substring(0, lastSlash + 1) : '';
  }

  private async _sendAsVoice(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session, results: SendResultTracker) {
    if (session.platform !== 'onebot') {
      await session.send('Voice模式：当前平台不支持，转为文件发送。');
      await this._sendAsFile(validFiles, workInfo, session, results);
      return;
    }
    await session.send(`正在发送 ${validFiles.length} 条语音...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
    for (const { index, file } of validFiles) {
      let tempFilePath: string;
      try {
        const buffer = await this._getCachedFileOrDownload(file, rjCode);
        await this._ensureTempDir();
        tempFilePath = resolve(this.tempDir, getSafeFilename(file.title));
        await fs.writeFile(tempFilePath, buffer);
        await session.send(h('audio', { src: pathToFileURL(tempFilePath).href, type: 'voice' }));
        results.success++;
      } catch (error) {
        this.logger.error('发送语音 %s 失败: %o', index, error);
        results.failed++;
        results.reasons.add('发送失败');
        await session.send(`语音 ${index} (${getSafeFilename(file.title)}) 发送失败。`);
      } finally {
        if (tempFilePath) {
          await fs.unlink(tempFilePath).catch(e => this.logger.warn('删除语音临时文件失败: %s', e.message));
        }
      }
    }
  }
  private async _sendAsLink(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session, results: SendResultTracker) {
    await session.send(`正在发送 ${validFiles.length} 个下载链接...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
    if (session.platform === 'onebot' && typeof session.send === 'function' && this.config.useForward) {
      try {
        const forwardMessages = validFiles.map(({ index, file }) => {
          const title = this.config.prependRjCodeLink ? `${rjCode} ${file.title}` : file.title;
          const content = `${index}. ${h.escape(title)}\n${file.url}`;
          return h('message', { userId: session.bot.selfId, nickname: session.bot.user?.name || session.bot.selfId }, content);
        });
        await session.send(h('figure', forwardMessages));
        results.success += validFiles.length;
        return;
      } catch (error) {
        this.logger.warn('发送合并转发消息失败，回退到逐条发送模式: %o', error);
      }
    }
    for (const { index, file } of validFiles) {
      try {
        const title = this.config.prependRjCodeLink ? `${rjCode} ${file.title}` : file.title;
        await session.send(`${index}. ${h.escape(title)}\n${file.url}`);
        results.success++;
        await new Promise(res => setTimeout(res, LINK_SEND_DELAY_MS));
      } catch (error) {
        this.logger.error('逐条发送链接 %s 失败: %o', index, error);
        results.failed++;
        results.reasons.add('发送失败');
        await session.send(`发送链接 ${index} 失败。`);
      }
    }
  }
  private async _sendAsCard(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session, results: SendResultTracker) {
    if (session.platform !== 'onebot') {
      await session.send('Card模式：当前平台不支持，转为文件发送。');
      await this._sendAsFile(validFiles, workInfo, session, results);
      return;
    }
    await session.send(`正在发送 ${validFiles.length} 个音乐卡片...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
    const cvs = workInfo.vas?.map(v => v.name).join(', ') || '未知声优';
    for (const { index, file } of validFiles) {
      try {
        const musicPayload = [{
          type: 'music',
          data: {
            type: ONEBOT_MUSIC_CARD_TYPE,
            url: `https://asmr.one/work/${rjCode}`,
            audio: file.url,
            title: this.config.prependRjCodeCard ? `${rjCode} ${file.title}` : file.title,
            content: cvs,
            image: workInfo.mainCoverUrl
          }
        }];
        if (session.isDirect) {
          await session.bot.internal.sendPrivateMsg(session.userId, musicPayload);
        } else {
          await session.bot.internal.sendGroupMsg(session.guildId, musicPayload);
        }
        results.success++;
      } catch (error) {
        this.logger.error('发送音乐卡片 %s 失败: %o', index, error);
        results.failed++;
        results.reasons.add('发送失败(签名服务?)');
        await session.send(`音轨 ${index} Card发送失败，请检查音乐签名url配置。`);
      }
    }
  }
  private async _sendAsFile(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session, results: SendResultTracker) {
    await session.send(`开始发送 ${validFiles.length} 个文件...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
    const downloadWorker = ({ index, file }: ValidFile) =>
      this._getCachedFileOrDownload(file, rjCode)
        .then(buffer => ({ status: 'fulfilled' as const, value: { buffer, file, index } }))
        .catch(error => ({ status: 'rejected' as const, reason: error, index, title: file.title }));
    const downloadResults = await this.downloadFilesWithConcurrency(validFiles, downloadWorker);
    for (const result of downloadResults) {
      let tempFilePath: string;
      if (result.status === 'fulfilled') {
        const { buffer, file, index } = result.value;
        try {
          await this._ensureTempDir();
          const finalFilename = this.config.prependRjCodeFile ? `${rjCode} ${file.title}` : file.title;
          tempFilePath = resolve(this.tempDir, getSafeFilename(finalFilename));
          await fs.writeFile(tempFilePath, buffer);
          await session.send(h('file', { src: pathToFileURL(tempFilePath).href, title: finalFilename }));
          results.success++;
        } catch (error) {
          this.logger.error('发送文件 %s 失败: %o', index, error);
          results.failed++;
          results.reasons.add('发送失败(风控?)');
          await session.send(`文件 ${index} 发送失败。`);
        } finally {
          if (tempFilePath) await fs.unlink(tempFilePath).catch(e => this.logger.warn('删除临时文件失败: %s', e.message));
        }
      } else {
        const { reason, index, title } = result;
        this.logger.error('下载并发送文件 %s (%s) 失败: %o', index, title, reason);
        results.failed++;
        results.reasons.add('下载失败');
        await session.send(`文件 ${index} (${getSafeFilename(title)}) 下载失败。`);
      }
    }
  }
  private async _sendAsZip(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session, results: SendResultTracker) {
    if (this.config.zipMode === ZipMode.SINGLE) {
      await this.handleSingleZip(validFiles, workInfo, session, results);
    }
    else {
      await this.handleMultipleZips(validFiles, workInfo, session, results);
    }
    if (this.config.usePassword && this.config.password) {
      await session.send(`ZIP 密码: ${this.config.password}`);
    }
  }
  private async handleSingleZip(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session, results: SendResultTracker) {
    await session.send(`正在准备压缩${validFiles.length}个文件...`);
    let tempZipPath: string;
    try {
      await this._ensureTempDir();
      const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
      const zipFileTitle = this.config.prependRjCodeZip ? `${rjCode} ${workInfo.title}` : workInfo.title;
      const zipFilename = getZipFilename(zipFileTitle);
      const { archive, finishPromise, tempPath } = this.createZipArchiveStream(zipFilename);
      tempZipPath = tempPath;
      let filesAdded = 0;
      for (const { index, file } of validFiles) {
        try {
          const filePathOnDisk = await this._getCachedFilePathOrDownload(file, rjCode);
          const pathInZip = this.config.prependRjCodeZip
            ? `${getSafeFilename(rjCode)}/${file.path}`
            : file.path;
          archive.file(filePathOnDisk, { name: pathInZip });
          filesAdded++;
        } catch (error) {
          this.logger.error('ZIP下载文件 %s (%s) 失败: %o', index, file.title, error);
          session.send(`压缩包: 文件 ${index} (${getSafeFilename(file.title)}) 下载失败，已跳过。`);
          results.failed++;
          results.reasons.add('下载失败');
        }
      }
      if (filesAdded > 0) {
        await session.send(`已处理 ${filesAdded} 个文件，正在压缩...`);
        await archive.finalize();
        await finishPromise;
        await session.send(`压缩包创建完毕，发送中...`);
        await session.send(h('file', { src: pathToFileURL(tempZipPath).href, title: zipFilename }));
        results.success++;
      } else {
        archive.abort();
        await session.send('所有文件均下载失败，压缩取消。');
      }
    } catch (error) {
      this.logger.error('创建或发送合并压缩包失败: %o', error);
      results.failed += validFiles.length - results.failed;
      results.reasons.add('压缩或发送失败');
      await session.send('压缩包发送失败。');
    } finally {
      if (tempZipPath) await fs.unlink(tempZipPath).catch(e => this.logger.warn('删除临时压缩包失败: %s', e.message));
    }
  }
  private async handleMultipleZips(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session, results: SendResultTracker) {
    await session.send(`准备单独压缩 ${validFiles.length} 个文件...`);
    await this._ensureTempDir();
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
    for (const { index, file } of validFiles) {
      let tempZipPath: string;
      try {
        const filePathOnDisk = await this._getCachedFilePathOrDownload(file, rjCode);
        const baseFilename = this.config.prependRjCodeZip ? `${rjCode} ${file.title}` : file.title;
        const zipFilename = getZipFilename(baseFilename);
        const { archive, finishPromise, tempPath } = this.createZipArchiveStream(zipFilename);
        tempZipPath = tempPath;
        archive.file(filePathOnDisk, { name: getSafeFilename(file.title) });
        await archive.finalize();
        await finishPromise;
        await session.send(h('file', { src: pathToFileURL(tempZipPath).href, title: zipFilename }));
        results.success++;
      } catch (error) {
        this.logger.error('创建或发送独立压缩包失败: %o', error);
        results.failed++;
        results.reasons.add('压缩或下载失败');
        await session.send(`文件 ${index} (${getSafeFilename(file.title)}) 压缩失败。`);
      } finally {
        if (tempZipPath) await fs.unlink(tempZipPath).catch(e => this.logger.warn('删除临时压缩包失败: %s', e.message));
      }
    }
  }
  private createZipArchiveStream(outputZipName: string): { archive: archiver.Archiver, finishPromise: Promise<void>, tempPath: string } {
    const tempZipPath = resolve(this.tempDir, outputZipName);
    const output = createWriteStream(tempZipPath);
    const isEncrypted = this.config.usePassword && this.config.password && this.config.password.length > 0;
    const format = isEncrypted ? 'zip-encrypted' : 'zip';
    const archiveOptions: archiver.ArchiverOptions & { encryptionMethod?: string; password?: string } = {
      zlib: { level: this.config.zipCompressionLevel }
    };
    if (isEncrypted) {
      archiveOptions.encryptionMethod = 'aes256';
      archiveOptions.password = this.config.password;
    }
    const archive = archiver(format as archiver.Format, archiveOptions);
    archive.pipe(output);
    const finishPromise = new Promise<void>((resolve, reject) => {
      output.on("close", resolve);
      archive.on("warning", (err) => this.logger.warn('Archiver warning: %o', err));
      archive.on("error", reject);
    });
    return { archive, finishPromise, tempPath: tempZipPath };
  }
  private async downloadFilesWithConcurrency<T, R>(
    items: T[],
    worker: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];
    const queue = [...items];
    const concurrency = this.config.downloadConcurrency;
    const runWorker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          const result = await worker(item);
          results.push(result);
        }
      }
    };
    const workers = Array(concurrency).fill(null).map(() => runWorker());
    await Promise.all(workers);
    return results;
  }
  private async _downloadFileWithRetry(url: string, title: string, outputPath: string): Promise<void> {
    let lastError: Error | null = null;
    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        const arrayBuffer = await this.ctx.http.get<ArrayBuffer>(url, {
          ...this.requestOptions,
          responseType: 'arraybuffer',
          timeout: this.config.downloadTimeout * 1000
        });
        if (!arrayBuffer || arrayBuffer.byteLength < MIN_FILE_SIZE_BYTES) throw new Error('文件为空或过小');
        await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(`下载文件 "%s" 失败 (尝试 %d/%d): %s`, title, i + 1, this.config.maxRetries, error.message);
        await fs.unlink(outputPath).catch(() => { });
        if (i < this.config.maxRetries - 1) {
          await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
        }
      }
    }
    this.logger.error(`下载文件 "%s" 在 %d 次尝试后彻底失败。`, title, this.config.maxRetries);
    throw lastError;
  }
  private async _getCachedFileOrDownload(file: ProcessedFile, rjCode: string): Promise<Buffer> {
    const filePath = await this._getCachedFilePathOrDownload(file, rjCode);
    return fs.readFile(filePath);
  }
  private async _getCachedFilePathOrDownload(file: ProcessedFile, rjCode: string): Promise<string> {
    const safeFilename = getSafeFilename(file.title);
    const cacheDir = resolve(this.tempDir, rjCode);
    const cachePath = resolve(cacheDir, safeFilename);
    if (this.config.cache.enableCache) {
      try {
        const stats = await fs.stat(cachePath);
        const maxAgeMs = this.config.cache.cacheMaxAge * 3600 * 1000;
        if (stats.size > MIN_FILE_SIZE_BYTES && (maxAgeMs === 0 || (Date.now() - stats.mtimeMs < maxAgeMs))) {
          this.logger.info(`[Cache] HIT for file path: ${file.title}`);
          return cachePath;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          this.logger.warn(`[Cache] Error checking cache for ${file.title}: %o`, error);
        }
      }
    }
    this.logger.info(`[Cache] MISS for file path: ${file.title}, downloading...`);
    await this._ensureTempDir(cacheDir);
    await this._downloadFileWithRetry(file.url, file.title, cachePath);
    return cachePath;
  }
  private async _ensureTempDir(path: string = this.tempDir): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create directory at %s: %o', path, error);
      throw new Error(`无法创建目录，请检查权限：${path}`);
    }
  }
}
// --- END OF FILE src/services/sender.ts ---