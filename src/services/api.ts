// --- START OF FILE src/services/api.ts --- 

import { Context } from 'koishi'
import { ApiSearchResponse, WorkInfoResponse, TrackItem } from '../common/types'
import { Config } from '../config' // <- Updated import path

export class AsmrApi {
  private requestOptions = {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' },
  }

  constructor(private ctx: Context, private config: Config) {}

  async search(keyword: string, page: number): Promise<ApiSearchResponse> {
    const keywordForApi = keyword.replace(/\//g, '%20');
    const url = `${this.config.apiBaseUrl}/search/${keywordForApi}?order=dl_count&sort=desc&page=${page}&pageSize=${this.config.pageSize}&subtitle=0&includeTranslationWorks=true`;
    
    const response = await this.ctx.http.get<ApiSearchResponse>(url, this.requestOptions);
    if (this.config.debug) {
      const fullResponse = JSON.stringify(response, null, 2);
      this.ctx.logger('asmrone').info(`[Debug] API Response from search for keyword '${keyword}':\n${fullResponse}`);
    }
    return response;
  }

  async getPopular(page: number): Promise<ApiSearchResponse> {
    const payload = {
      keyword: ' ',
      page,
      pageSize: this.config.pageSize,
      subtitle: 0,
      localSubtitledWorks: [],
      withPlaylistStatus: [],
    };

    const response = await this.ctx.http.post<ApiSearchResponse>(`${this.config.apiBaseUrl}/recommender/popular`, payload, this.requestOptions);
    if (this.config.debug) {
      const fullResponse = JSON.stringify(response, null, 2);
      this.ctx.logger('asmrone').info(`[Debug] API Response from getPopular for page ${page}:\n${fullResponse}`);
    }
    return response;
  }

  async getWorkInfo(rid: string): Promise<WorkInfoResponse> {
    const response = await this.ctx.http.get<WorkInfoResponse>(`${this.config.apiBaseUrl}/workInfo/${rid}`, this.requestOptions);
    if (this.config.debug) {
      const fullResponse = JSON.stringify(response, null, 2);
      this.ctx.logger('asmrone').info(`[Debug] API Response from getWorkInfo for RJ${rid}:\n${fullResponse}`);
    }
    return response;
  }

  async getTracks(rid: string): Promise<TrackItem[]> {
    const response = await this.ctx.http.get<TrackItem[]>(`${this.config.apiBaseUrl}/tracks/${rid}`, this.requestOptions);
    if (this.config.debug) {
      const fullResponse = JSON.stringify(response, null, 2);
      this.ctx.logger('asmrone').info(`[Debug] API Response from getTracks for RJ${rid}:\n${fullResponse}`);
    }
    return response;
  }

  async downloadImageAsDataUri(url: string): Promise<string | null> {
    try {
      const buffer = await this.ctx.http.get<ArrayBuffer>(url, { ...this.requestOptions, responseType: 'arraybuffer', timeout: 15000 });
      const base64 = Buffer.from(buffer).toString('base64');
      const mime = url.includes('.png') ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${base64}`;
    } catch (error) {
      this.ctx.logger('asmrone').warn('下载封面图片失败 %s: %o', url, error);
      return null;
    }
  }
}