import { Context, Session, h, Logger } from 'koishi'
import { resolve } from 'path'
import { promises as fs, createWriteStream } from 'fs'
import { pathToFileURL } from 'url'
import archiver from 'archiver'
import { ProcessedFile, ValidFile, WorkInfoResponse } from '../common/types'
import { Config } from '../config'
import { SendMode, ZipMode, CardModeNonAudioAction, VoiceModeNonAudioAction } from '../common/constants'
import { getSafeFilename, getZipFilename } from '../common/utils'

// [NEW] 结果追踪器类型
interface SendResultTracker {
  success: number;
  failed: number;
  reasons: Set<string>;
}

export class TrackSender {
  private logger: Logger
  private requestOptions = {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' },
  }

  constructor(private ctx: Context, private config: Config, private tempDir: string) {
    this.logger = ctx.logger('asmrone')
  }

  private async _ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create temporary directory at %s: %o', this.tempDir, error);
      throw new Error(`无法创建临时目录，请检查权限：${this.tempDir}`);
    }
  }

  private async _getCachedFileOrDownload(file: ProcessedFile, rjCode: string): Promise<Buffer> {
    if (!this.config.cache.enableCache) {
      return this._downloadWithRetry(file.url, file.title);
    }
    
    const safeFilename = getSafeFilename(file.title);
    const cacheDir = resolve(this.tempDir, rjCode);
    const cachePath = resolve(cacheDir, safeFilename);

    try {
      const stats = await fs.stat(cachePath);
      const maxAgeMs = this.config.cache.cacheMaxAge * 3600 * 1000;
      if (stats.size > 100 && (maxAgeMs === 0 || (Date.now() - stats.mtimeMs < maxAgeMs))) {
        this.logger.info(`[Cache] HIT for file: ${file.title}`);
        return fs.readFile(cachePath);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.warn(`[Cache] Error checking cache for ${file.title}: %o`, error);
      }
    }

    this.logger.info(`[Cache] MISS for file: ${file.title}, downloading...`);
    const buffer = await this._downloadWithRetry(file.url, file.title);
    
    fs.mkdir(cacheDir, { recursive: true })
      .then(() => fs.writeFile(cachePath, buffer))
      .catch(err => this.logger.error(`[Cache] Failed to write cache for ${file.title}: %o`, err));

    return buffer;
  }

  private async _downloadWithRetry(url: string, title: string): Promise<Buffer> {
    let lastError: Error | null = null;
    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        const buffer = await this.ctx.http.get<ArrayBuffer>(url, { 
          ...this.requestOptions, 
          responseType: 'arraybuffer', 
          timeout: this.config.downloadTimeout * 1000 
        });
        if (!buffer || buffer.byteLength < 100) throw new Error('文件为空或过小');
        return Buffer.from(buffer);
      } catch (error) {
        lastError = error;
        this.logger.warn(`下载文件 "%s" 失败 (尝试 %d/%d): %s`, title, i + 1, this.config.maxRetries, error.message);
        if (i < this.config.maxRetries - 1) {
            await new Promise(res => setTimeout(res, 1500));
        }
      }
    }
    this.logger.error(`下载文件 "%s" 在 %d 次尝试后彻底失败。`, title, this.config.maxRetries);
    throw lastError;
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

  async processAndSendTracks(indices: number[], allFiles: ProcessedFile[], workInfo: WorkInfoResponse, session: Session, mode: SendMode) {
    const validFiles: ValidFile[] = indices
      .map(i => ({ index: i, file: allFiles[i - 1] }))
      .filter(item => item.file);

    if (validFiles.length === 0) {
        await session.send('选择的序号无效。');
        return;
    }

    // [NEW] 初始化结果追踪器
    const results: SendResultTracker = { success: 0, failed: 0, reasons: new Set() };
    const nonAudioFilesToFallback: ValidFile[] = [];

    if (mode === SendMode.CARD) {
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
    } else { // 默认或 file 模式
        await this._sendAsFile(validFiles, workInfo, session, results);
    }

    // [NEW] 处理回退发送的文件
    if (nonAudioFilesToFallback.length > 0) {
        await this._sendAsFile(nonAudioFilesToFallback, workInfo, session, results);
    }
    
    // [NEW] 发送总结报告
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
    await session.send(`正在为您生成 ${validFiles.length} 个下载链接...`);
    
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;

    // 尝试合并转发
    if (session.platform === 'onebot' && typeof session.send === 'function') {
        try {
            const forwardMessages = validFiles.map(({ index, file }) => {
                const title = this.config.prependRjCodeLink ? `${rjCode} ${file.title}` : file.title;
                const content = `${index}. ${h.escape(title)}\n${file.url}`;
                return h('message', { userId: session.bot.selfId, nickname: session.bot.user?.name || session.bot.selfId }, content);
            });
            await session.send(h('figure', forwardMessages));
            results.success += validFiles.length; // 假设合并转发整体成功
            return;
        } catch (error) {
            this.logger.warn('发送合并转发消息失败，将回退到逐条发送模式: %o', error);
        }
    }
    
    // 逐条发送
    for (const { index, file } of validFiles) {
        try {
            const title = this.config.prependRjCodeLink ? `${rjCode} ${file.title}` : file.title;
            await session.send(`${index}. ${h.escape(title)}\n${file.url}`);
            results.success++;
            await new Promise(res => setTimeout(res, 300));
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
                    type: '163',
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
    if (this.config.zipMode === ZipMode.SINGLE) { await this.handleSingleZip(validFiles, workInfo, session, results); } 
    else { await this.handleMultipleZips(validFiles, workInfo, session, results); }
    if (this.config.usePassword && this.config.password) { await session.send(`ZIP 密码: ${this.config.password}`); }
  }

  private async handleSingleZip(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session, results: SendResultTracker) {
    await session.send(`正在准备压缩包 (${validFiles.length}个文件)...`);
    let tempZipPath: string;
    try {
        const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
        const downloadWorker = ({ index, file }: ValidFile) =>
            this._getCachedFileOrDownload(file, rjCode)
                .then(buffer => ({
                    path: this.config.prependRjCodeZip ? `${getSafeFilename(rjCode)}/${file.path}` : file.path,
                    data: buffer
                }))
                .catch(error => {
                    this.logger.error('ZIP下载文件 %s (%s) 失败: %o', index, file.title, error);
                    session.send(`压缩包: 文件 ${index} (${getSafeFilename(file.title)}) 下载失败，已跳过。`);
                    results.failed++;
                    results.reasons.add('下载失败');
                    return null;
                });
        
        const downloadedFiles = (await this.downloadFilesWithConcurrency(validFiles, downloadWorker)).filter(f => f);

        if (downloadedFiles.length > 0) {
            const zipFileTitle = this.config.prependRjCodeZip ? `${rjCode} ${workInfo.title}` : workInfo.title;
            const zipFilename = getZipFilename(zipFileTitle);
            await session.send(`已下载 ${downloadedFiles.length} 个文件，正在压缩...`);
            tempZipPath = await this.createZipArchive(downloadedFiles, zipFilename);
            await session.send(`压缩包创建完毕，发送中...`);
            await session.send(h('file', { src: pathToFileURL(tempZipPath).href, title: zipFilename }));
            results.success++; // 整个 zip 包算一次成功
        } else { await session.send('所有文件均下载失败，压缩取消。'); }
    } catch (error) {
        this.logger.error('创建或发送合并压缩包失败: %o', error);
        results.failed++;
        results.reasons.add('压缩或发送失败');
        await session.send('压缩包发送失败。');
    } finally {
        if (tempZipPath) await fs.unlink(tempZipPath).catch(e => this.logger.warn('删除临时压缩包失败: %s', e.message));
    }
  }

  private async handleMultipleZips(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session, results: SendResultTracker) {
    await session.send(`准备单独压缩 ${validFiles.length} 个文件...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
    for (const { index, file } of validFiles) {
        let tempZipPath: string;
        try {
            const audioBuffer = await this._getCachedFileOrDownload(file, rjCode);
            const baseFilename = this.config.prependRjCodeZip ? `${rjCode} ${file.title}` : file.title;
            const zipFilename = getZipFilename(baseFilename);
            tempZipPath = await this.createZipArchive([{ path: getSafeFilename(file.title), data: audioBuffer }], zipFilename);
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

  private async createZipArchive(filesToPack: { path: string; data: Buffer }[], outputZipName: string): Promise<string> {
    await this._ensureTempDir();
    return new Promise((promiseResolve, promiseReject) => {
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

      output.on("close", () => promiseResolve(tempZipPath));
      archive.on("warning", (err) => this.logger.warn('Archiver warning: %o', err));
      archive.on("error", (err) => promiseReject(err));
      archive.pipe(output);
      filesToPack.forEach(file => archive.append(file.data, { name: file.path }));
      archive.finalize();
    });
  }
}