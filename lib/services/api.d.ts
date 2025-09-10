import { Context } from 'koishi';
import { ApiSearchResponse, WorkInfoResponse, TrackItem } from '../common/types';
import { Config } from '../config';
export declare class AsmrApi {
    private ctx;
    private config;
    private requestOptions;
    private cache;
    constructor(ctx: Context, config: Config);
    private cleanExpiredCache;
    private _fetchAndCache;
    private _requestWithRetry;
    search(keyword: string, page: number, order?: string, sort?: string): Promise<ApiSearchResponse>;
    getPopular(page: number): Promise<ApiSearchResponse>;
    getWorkInfo(rid: string): Promise<WorkInfoResponse>;
    getTracks(rid: string): Promise<TrackItem[]>;
    downloadImageAsDataUri(url: string): Promise<string | null>;
}
