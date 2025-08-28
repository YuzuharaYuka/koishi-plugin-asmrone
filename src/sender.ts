import { Context, Session, h, Logger } from 'koishi'
import { resolve } from 'path'
import { promises as fs, createWriteStream } from 'fs'
import { pathToFileURL } from 'url'
import archiver from 'archiver'
import { Config, SendMode } from './config'
import { Track, ValidTrack, WorkInfoResponse } from './types'
import { getSafeFilename, getZipFilename } from './utils'

export class TrackSender {
  private logger: Logger
  private requestOptions = {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' },
  }

  constructor(private ctx: Context, private config: Config, private tempDir: string) {
    this.logger = ctx.logger('asmrone')
  }

  async processAndSendTracks(indices: number[], allTracks: Track[], workInfo: WorkInfoResponse, session: Session, mode: SendMode) {
    const validTracks: ValidTrack[] = indices
      .map(i => ({ index: i, track: allTracks[i - 1] }))
      .filter(item => item.track);

    if (validTracks.length === 0) {
      await session.send('未找到任何有效的音轨序号。');
      return;
    }

    switch (mode) {
      case 'card': await this._sendAsCard(validTracks, workInfo, session); break;
      case 'zip': await this._sendAsZip(validTracks, workInfo, session); break;
      case 'file': await this._sendAsFile(validTracks, workInfo, session); break;
    }
    await session.send('所有请求的音轨已处理完毕。');
  }

  private async _sendAsCard(validTracks: ValidTrack[], workInfo: WorkInfoResponse, session: Session) {
    if (session.platform !== 'onebot') {
      await session.send('音乐卡片模式 (card) 仅在 onebot 平台受支持，已自动切换为发送文件。');
      await this._sendAsFile(validTracks, workInfo, session);
      return;
    }
    await session.send(`正在为 ${validTracks.length} 个音轨生成音乐卡片...`);
    const rjCode = `RJ${String(workInfo.id).padStart(8, '0')}`;
    const asmrOneUrl = `https://asmr.one/work/${rjCode}`;
    for (const { index, track } of validTracks) {
      try {
        await session.bot.internal.sendGroupMsg(session.guildId, [{
          type: 'music',
          data: { type: '163', url: workInfo.source_url || asmrOneUrl, audio: track.url, title: track.title, content: workInfo.name, image: workInfo.mainCoverUrl }
        }]);
      } catch (error) {
        this.logger.error('发送音乐卡片 %s 失败: %o', index, error);
        await session.send(`发送音轨 ${index} 「${h.escape(track.title)}」的音乐卡片失败。`);
      }
    }
  }

  private async _sendAsFile(validTracks: ValidTrack[], workInfo: WorkInfoResponse, session: Session) {
    await session.send(`将开始并行下载 ${validTracks.length} 个音频文件，下载完成后将逐个发送...`);
    
    const downloadPromises = validTracks.map(({ index, track }) =>
        this.ctx.http.get<ArrayBuffer>(track.url, { ...this.requestOptions, responseType: 'arraybuffer', timeout: this.config.downloadTimeout * 1000 })
            .then(buffer => ({ status: 'fulfilled' as const, value: { buffer: Buffer.from(buffer), track }, index }))
            .catch(error => ({ status: 'rejected' as const, reason: error, index, title: track.title }))
    );
    const results = await Promise.allSettled(downloadPromises);

    for (const result of results) {
        let tempFilePath: string;
        if (result.status === 'fulfilled' && result.value.status === 'fulfilled') {
            const { buffer, track } = result.value.value;
            if (buffer.byteLength > 100) {
                try {
                    tempFilePath = resolve(this.tempDir, getSafeFilename(track.title));
                    await fs.writeFile(tempFilePath, buffer);
                    await session.send(`正在发送文件: 「${h.escape(track.title)}」`);
                    await session.send(h('file', { src: pathToFileURL(tempFilePath).href, title: track.title }));
                } catch (error) {
                    this.logger.error('发送音频文件 %s 失败: %o', result.value.index, error);
                    await session.send(`发送音轨 ${result.value.index} 「${h.escape(track.title)}」失败。`);
                } finally {
                    if (tempFilePath) await fs.unlink(tempFilePath).catch(e => this.logger.warn('删除临时文件失败: %s', e));
                }
            } else {
                await session.send(`音轨 ${result.value.index} 下载失败 (文件为空)，已跳过。`);
            }
        } else {
            const reason = result.status === 'rejected' ? result.reason : (result.value as any);
            this.logger.error('下载音轨 %s (%s) 失败: %o', reason.index, reason.title, reason.reason);
            await session.send(`下载音轨 ${reason.index} 「${h.escape(reason.title)}」失败，已跳过。`);
        }
    }
  }

  private async _sendAsZip(validTracks: ValidTrack[], workInfo: WorkInfoResponse, session: Session) {
    if (this.config.zipMode === 'single') {
        await this.handleSingleZip(validTracks, workInfo, session);
    } else {
        await this.handleMultipleZips(validTracks, session);
    }
    if (this.config.usePassword && this.config.password) {
        await session.send(`所有压缩包的密码统一为: ${this.config.password}`);
    }
  }

  private async handleSingleZip(validTracks: ValidTrack[], workInfo: WorkInfoResponse, session: Session) {
    await session.send(`正在并行下载 ${validTracks.length} 个音轨，准备合并压缩...`);
    let tempZipPath: string;
    try {
        const downloadPromises = validTracks.map(({ index, track }) =>
            this.ctx.http.get<ArrayBuffer>(track.url, { ...this.requestOptions, responseType: 'arraybuffer', timeout: this.config.downloadTimeout * 1000 })
                .then(buffer => ({ name: getSafeFilename(track.title), data: Buffer.from(buffer) }))
                .catch(error => {
                    this.logger.error('下载音轨 %s (%s) 失败: %o', index, track.title, error);
                    session.send(`下载音轨 ${index} 「${h.escape(track.title)}」失败，已跳过。`);
                    return null;
                })
        );
        const downloadedFiles = (await Promise.all(downloadPromises)).filter(f => f && f.data.byteLength > 100);

        if (downloadedFiles.length > 0) {
            const zipFilename = getZipFilename(workInfo.title);
            await session.send(`下载完成 ${downloadedFiles.length} 个文件，正在创建压缩包 「${h.escape(zipFilename)}」...`);
            tempZipPath = await this.createZipArchive(downloadedFiles, zipFilename);
            await session.send(`压缩包已创建，正在发送...`);
            await session.send(h('file', { src: pathToFileURL(tempZipPath).href, title: zipFilename }));
        } else {
            await session.send('所有音轨均下载失败，无法创建压缩包。');
        }
    } catch (error) {
        this.logger.error('创建或发送合并压缩包失败: %o', error);
        await session.send('创建或发送压缩包失败，详情请检查后台日志。');
    } finally {
        if (tempZipPath) await fs.unlink(tempZipPath).catch(e => this.logger.warn('删除临时压缩包失败: %s', e));
    }
  }

  private async handleMultipleZips(validTracks: ValidTrack[], session: Session) {
    await session.send(`正在准备单独压缩，共 ${validTracks.length} 个音轨...`);
    for (const { index, track } of validTracks) {
        let tempZipPath: string;
        try {
            await session.send(`正在处理音轨 ${index}: 「${h.escape(track.title)}」...`);
            const audioBuffer = await this.ctx.http.get<ArrayBuffer>(track.url, { ...this.requestOptions, responseType: 'arraybuffer', timeout: this.config.downloadTimeout * 1000 });
            if (!audioBuffer || audioBuffer.byteLength < 100) throw new Error('文件为空或过小');
            
            const zipFilename = getZipFilename(track.title);
            tempZipPath = await this.createZipArchive([{ name: getSafeFilename(track.title), data: Buffer.from(audioBuffer) }], zipFilename);
            
            await session.send(`压缩包「${h.escape(zipFilename)}」已创建，正在发送...`);
            await session.send(h('file', { src: pathToFileURL(tempZipPath).href, title: zipFilename }));
        } catch (error) {
            this.logger.error('创建或发送独立压缩包失败: %o', error);
            await session.send(`处理音轨 ${index} 失败，详情请检查后台日志。`);
        } finally {
            if (tempZipPath) await fs.unlink(tempZipPath).catch(e => this.logger.warn('删除临时压缩包失败: %s', e));
        }
    }
  }

  private createZipArchive(filesToPack: { name: string; data: Buffer }[], outputZipName: string): Promise<string> {
    return new Promise((promiseResolve, promiseReject) => {
      const tempZipPath = resolve(this.tempDir, outputZipName);
      const output = createWriteStream(tempZipPath);
      const archive = this.config.usePassword && this.config.password
        ? archiver.create("zip-encrypted", { encryptionMethod: "aes256", password: this.config.password } as any)
        : archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => promiseResolve(tempZipPath));
      archive.on("warning", (err) => this.logger.warn('Archiver warning: %o', err));
      archive.on("error", (err) => promiseReject(err));

      archive.pipe(output);
      filesToPack.forEach(file => archive.append(file.data, { name: file.name }));
      archive.finalize();
    });
  }
}