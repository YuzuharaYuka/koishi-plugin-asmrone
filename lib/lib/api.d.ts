import { Context } from 'koishi';
import { ApiSearchResponse, WorkInfoResponse, TrackItem } from './types';
import { Config } from './config';
export declare class AsmrApi {
    private ctx;
    private config;
    private requestOptions;
    constructor(ctx: Context, config: Config);
    search(keyword: string, page: number): Promise<ApiSearchResponse>;
    getPopular(page: number): Promise<ApiSearchResponse>;
    getWorkInfo(rid: string): Promise<WorkInfoResponse>;
    getTracks(rid: string): Promise<TrackItem[]>;
    downloadImageAsDataUri(url: string): Promise<string | null>;
}
