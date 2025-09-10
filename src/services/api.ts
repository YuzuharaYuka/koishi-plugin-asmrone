// --- START OF FILE src/services/api.ts --- 

import { Context } from 'koishi'
import { ApiSearchResponse, WorkInfoResponse, TrackItem } from '../common/types'
import { Config } from '../config'

interface CacheEntry<T> {
  data: T;
  expires: number;
}

export class AsmrApi {
  private requestOptions = {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' },
  }
  
  private cache = new Map<string, CacheEntry<any>>();

  constructor(private ctx: Context, private config: Config) {
    setInterval(() => this.cleanExpiredCache(), 5 * 60 * 1000);
  }
  
  private cleanExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expires < now) {
        this.cache.delete(key);
      }
    }
  }

  private async _fetchAndCache<T>(key: string, fetcher: () => Promise<T>, ttl: number = 5 * 60 * 1000): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      if (this.config.debug) this.ctx.logger('asmrone').info(`[Cache] HIT for key: ${key}`);
      return cached.data;
    }
    if (this.config.debug) this.ctx.logger('asmrone').info(`[Cache] MISS for key: ${key}`);

    const data = await fetcher();
    this.cache.set(key, { data, expires: Date.now() + ttl });
    return data;
  }

  private async _requestWithRetry<T>(url: string, method: 'get' | 'post', payload?: any): Promise<T> {
    let lastError: Error | null = null;
    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        if (this.config.debug) this.ctx.logger('asmrone').info(`[Debug] API Request URL: ${url}`);
        const response = method === 'post'
          ? await this.ctx.http.post<T>(url, payload, this.requestOptions)
          : await this.ctx.http.get<T>(url, this.requestOptions);
        
        if (this.config.debug) {
            this.ctx.logger('asmrone').info(`[Debug] API Response (Attempt ${i + 1}):\n${JSON.stringify(response, null, 2)}`);
        }
        return response;
      } catch (error) {
        lastError = error;
        this.ctx.logger('asmrone').warn(`API request to ${url} failed on attempt ${i + 1}/${this.config.maxRetries}. Retrying...`);
        if (i < this.config.maxRetries - 1) {
            await new Promise(res => setTimeout(res, 1500));
        }
      }
    }
    
    let finalError = new Error(`API 请求失败 (共 ${this.config.maxRetries} 次尝试)。`);
    if (this.ctx.http.isError(lastError)) {
      const status = lastError.response?.status;
      if (status) {
        if (status === 404) {
          finalError = new Error('资源未找到 (404)，请检查 RJ 号是否正确。');
        } else if (status >= 500) {
          finalError = new Error(`API 服务器内部错误 (${status})，请稍后再试。`);
        } else {
          finalError = new Error(`API 请求时发生 HTTP 错误 (状态码: ${status})。`);
        }
      } else if (lastError.code === 'ETIMEDOUT' || lastError.code === 'ECONNABORTED') {
        finalError = new Error('API 请求超时，请检查网络连接。');
      }
    }
    this.ctx.logger('asmrone').error(finalError.message);
    throw finalError;
  }

  async search(keyword: string, page: number, order?: string, sort?: string): Promise<ApiSearchResponse> {
    const keywordForApi = keyword.trim();
    const params = new URLSearchParams({
      order: order || 'dl_count',
      sort: sort || 'desc',
      page: String(page),
      pageSize: String(this.config.pageSize),
      subtitle: '0',
      includeTranslationWorks: 'true',
    });

    const url = `${this.config.apiBaseUrl}/search/${encodeURIComponent(keywordForApi)}?${params.toString()}`;
    return this._requestWithRetry<ApiSearchResponse>(url, 'get');
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
    const url = `${this.config.apiBaseUrl}/recommender/popular`;
    return this._requestWithRetry<ApiSearchResponse>(url, 'post', payload);
  }

  async getWorkInfo(rid: string): Promise<WorkInfoResponse> {
    const cacheKey = `workInfo:${rid}`;
    return this._fetchAndCache(cacheKey, () => {
        const url = `${this.config.apiBaseUrl}/workInfo/${rid}`;
        return this._requestWithRetry<WorkInfoResponse>(url, 'get');
    });
  }

  async getTracks(rid: string): Promise<TrackItem[]> {
    const cacheKey = `tracks:${rid}`;
    return this._fetchAndCache(cacheKey, () => {
        const url = `${this.config.apiBaseUrl}/tracks/${rid}`;
        return this._requestWithRetry<TrackItem[]>(url, 'get');
    });
  }

  async downloadImageAsDataUri(url: string): Promise<string | null> {
    const cacheKey = `imgDataUri:${url}`;
    return this._fetchAndCache(cacheKey, async () => {
        for (let i = 0; i < this.config.maxRetries; i++) {
          try {
            const buffer = await this.ctx.http.get<ArrayBuffer>(url, { ...this.requestOptions, responseType: 'arraybuffer', timeout: 15000 });
            const base64 = Buffer.from(buffer).toString('base64');
            const mime = url.includes('.png') ? 'image/png' : 'image/jpeg';
            return `data:${mime};base64,${base64}`;
          } catch (error) {
            this.ctx.logger('asmrone').warn(`下载封面图片失败 %s (Attempt ${i + 1}/${this.config.maxRetries}): %o`, url, error);
            if (i < this.config.maxRetries - 1) {
              await new Promise(res => setTimeout(res, 1000));
            }
          }
        }
        this.ctx.logger('asmrone').error(`下载封面图片失败 %s after ${this.config.maxRetries} attempts.`, url);
        return null;
    }, 60 * 60 * 1000);
  }
}