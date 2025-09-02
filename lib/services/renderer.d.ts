import { Context } from 'koishi';
import { BaseWork, WorkInfoResponse, DisplayItem } from '../common/types';
import { Config } from '../config';
export declare class Renderer {
    private ctx;
    private logger;
    constructor(ctx: Context);
    renderHtmlToImage(html: string): Promise<Buffer | null>;
    private getMenuStyle;
    createSearchHtml(works: BaseWork[], keyword: string, pageNum: number, total: number, config: Config): string;
    createWorkInfoHtml(workInfo: WorkInfoResponse, displayItems: DisplayItem[], linksHtml: string): string;
}
