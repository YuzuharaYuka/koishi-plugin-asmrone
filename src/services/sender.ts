// --- START OF FILE src/services/sender.ts --- 

import { Context, Session, h, Logger } from 'koishi'
import { resolve } from 'path'
import { promises as fs, createWriteStream } from 'fs'
import { pathToFileURL } from 'url'
import archiver from 'archiver'
import { ProcessedFile, ValidFile, WorkInfoResponse } from '../common/types'
import { Config } from '../config'
import { SendMode, ZipMode, CardModeNonAudioAction } from '../common/constants'
import { getSafeFilename, getZipFilename } from '../common/utils'

export class TrackSender {
  private logger: Logger
  private requestOptions = {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' },
  }

  constructor(private ctx: Context, private config: Config, private tempDir: string) {
    this.logger = ctx.logger('asmrone')
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
    if (validFiles.length === 0) { await session.send('选择的序号无效。'); return; }
    if (mode === SendMode.CARD) {
        const audioFiles = validFiles.filter(vf => vf.file.type === 'audio');
        const nonAudioFiles = validFiles.filter(vf => vf.file.type !== 'audio');
        if (nonAudioFiles.length > 0) {
            if (this.config.cardModeNonAudioAction === CardModeNonAudioAction.FALLBACK) {
                await session.send(`Card模式：${nonAudioFiles.length} 个非音频文件转为文件发送...`);
                await this._sendAsFile(nonAudioFiles, workInfo, session);
            } else { await session.send(`Card模式：已跳过 ${nonAudioFiles.length} 个非音频文件。`); }
        }
        if (audioFiles.length > 0) { await this._sendAsCard(audioFiles, workInfo, session); } 
        else if (nonAudioFiles.length > 0) { await session.send('选择的文件均非音频，已按设置处理。'); }
    } else if (mode === SendMode.ZIP) { await this._sendAsZip(validFiles, workInfo, session); } 
    else { await this._sendAsFile(validFiles, workInfo, session); }
    await session.send('请求处理完毕。');
  }

  private async _sendAsCard(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session) {
    if (session.platform !== 'onebot') {
      await session.send('Card模式：当前平台不支持，转为文件发送。');
      await this._sendAsFile(validFiles, workInfo, session);
      return;
    }
    await session.send(`正在发送 ${validFiles.length} 个音乐卡片...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
    const asmrOneUrl = `https://asmr.one/work/${rjCode}`;
    for (const { index, file } of validFiles) {
      try {
        const cardTitle = this.config.prependRjCodeCard ? `${rjCode} ${file.title}` : file.title;
        await session.bot.internal.sendGroupMsg(session.guildId, [{ type: 'music', data: {  type: '163',  url: workInfo.source_url || asmrOneUrl,  audio: file.url,  title: cardTitle,  content: workInfo.name,  image: workInfo.mainCoverUrl  } }]);
      } catch (error) {
        this.logger.error('发送音乐卡片 %s 失败: %o', index, error);
        await session.send(`音轨 ${index} Card发送失败，请检查音乐签名url配置。`);
      }
    }
  }

  private async _sendAsFile(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session) {
    await session.send(`开始发送 ${validFiles.length} 个文件...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
    
    const downloadWorker = ({ index, file }: ValidFile) =>
        this._downloadWithRetry(file.url, file.title)
            .then(buffer => ({ status: 'fulfilled' as const, value: { buffer, file, index } }))
            .catch(error => ({ status: 'rejected' as const, reason: error, index, title: file.title }));

    const results = await this.downloadFilesWithConcurrency(validFiles, downloadWorker);

    for (const result of results) {
        let tempFilePath: string;
        if (result.status === 'fulfilled') {
            const { buffer, file, index } = result.value;
            try {
                const finalFilename = this.config.prependRjCodeFile ? `${rjCode} ${file.title}` : file.title;
                tempFilePath = resolve(this.tempDir, getSafeFilename(finalFilename));
                await fs.writeFile(tempFilePath, buffer);
                await session.send(h('file', { src: pathToFileURL(tempFilePath).href, title: finalFilename }));
            } catch (error) {
                this.logger.error('发送文件 %s 失败: %o', index, error);
                await session.send(`文件 ${index} 发送失败。`);
            } finally {
                if (tempFilePath) await fs.unlink(tempFilePath).catch(e => this.logger.warn('删除临时文件失败: %s', e));
            }
        } else {
            const { reason, index, title } = result;
            this.logger.error('下载并发送文件 %s (%s) 失败: %o', index, title, reason);
            await session.send(`文件 ${index} (${getSafeFilename(title)}) 下载失败。`);
        }
    }
  }

  private async _sendAsZip(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session) {
    if (this.config.zipMode === ZipMode.SINGLE) { await this.handleSingleZip(validFiles, workInfo, session); } 
    else { await this.handleMultipleZips(validFiles, workInfo, session); }
    if (this.config.usePassword && this.config.password) { await session.send(`ZIP 密码: ${this.config.password}`); }
  }

  private async handleSingleZip(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session) {
    await session.send(`正在准备压缩包 (${validFiles.length}个文件)...`);
    let tempZipPath: string;
    try {
        const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
        const downloadWorker = ({ index, file }: ValidFile) =>
            this._downloadWithRetry(file.url, file.title)
                .then(buffer => ({
                    path: this.config.prependRjCodeZip ? `${getSafeFilename(rjCode)}/${file.path}` : file.path,
                    data: buffer
                }))
                .catch(error => {
                    this.logger.error('ZIP下载文件 %s (%s) 失败: %o', index, file.title, error);
                    session.send(`压缩包: 文件 ${index} (${getSafeFilename(file.title)}) 下载失败，已跳过。`);
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
        } else { await session.send('文件全部下载失败，压缩取消。'); }
    } catch (error) {
        this.logger.error('创建或发送合并压缩包失败: %o', error);
        await session.send('压缩包发送失败。');
    } finally {
        if (tempZipPath) await fs.unlink(tempZipPath).catch(e => this.logger.warn('删除临时压缩包失败: %s', e));
    }
  }

  private async handleMultipleZips(validFiles: ValidFile[], workInfo: WorkInfoResponse, session: Session) {
    await session.send(`准备单独压缩 ${validFiles.length} 个文件...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
    for (const { index, file } of validFiles) {
        let tempZipPath: string;
        try {
            const audioBuffer = await this._downloadWithRetry(file.url, file.title);
            const baseFilename = this.config.prependRjCodeZip ? `${rjCode} ${file.title}` : file.title;
            const zipFilename = getZipFilename(baseFilename);
            tempZipPath = await this.createZipArchive([{ path: getSafeFilename(file.title), data: audioBuffer }], zipFilename);
            await session.send(h('file', { src: pathToFileURL(tempZipPath).href, title: zipFilename }));
        } catch (error) {
            this.logger.error('创建或发送独立压缩包失败: %o', error);
            await session.send(`文件 ${index} (${getSafeFilename(file.title)}) 压缩失败。`);
        } finally {
            if (tempZipPath) await fs.unlink(tempZipPath).catch(e => this.logger.warn('删除临时压缩包失败: %s', e));
        }
    }
  }

  private createZipArchive(filesToPack: { path: string; data: Buffer }[], outputZipName: string): Promise<string> {
    return new Promise((promiseResolve, promiseReject) => {
      const tempZipPath = resolve(this.tempDir, outputZipName);
      const output = createWriteStream(tempZipPath);

      const isEncrypted = this.config.usePassword && this.config.password;
      const format = isEncrypted ? 'zip-encrypted' : 'zip';

      const archiveOptions: archiver.ArchiverOptions & { encryptionMethod?: string; password?: string } = {
        zlib: { level: this.config.zipCompressionLevel }
      };

      if (isEncrypted) {
        archiveOptions.encryptionMethod = 'aes256';
        archiveOptions.password = this.config.password;
      }

      const archive = archiver(format, archiveOptions);

      output.on("close", () => promiseResolve(tempZipPath));
      archive.on("warning", (err) => this.logger.warn('Archiver warning: %o', err));
      archive.on("error", (err) => promiseReject(err));
      archive.pipe(output);
      filesToPack.forEach(file => archive.append(file.data, { name: file.path }));
      archive.finalize();
    });
  }
}