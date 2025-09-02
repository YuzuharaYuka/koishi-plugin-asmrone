import type Puppeteer from 'koishi-plugin-puppeteer';
declare module 'koishi' {
    interface Context {
        puppeteer: Puppeteer;
    }
}
export interface Tag {
    name: string;
}
export interface Va {
    name: string;
}
export interface BaseWork {
    id: number;
    title: string;
    name: string;
    mainCoverUrl: string;
    release: string;
    dl_count: number;
    rate_average_2dp: number;
    rate_count: number;
    vas: Va[];
    tags: Tag[];
    duration: number;
    source_url: string;
}
export interface ApiSearchResponse {
    works: BaseWork[];
    pagination: {
        totalCount: number;
        currentPage: number;
    };
}
export interface TrackItem {
    type: 'audio' | 'folder' | 'image' | 'text' | 'other' | string;
    title: string;
    mediaDownloadUrl?: string;
    children?: TrackItem[];
    duration?: number;
    size?: number;
}
export type WorkInfoResponse = BaseWork;
export type ProcessedFile = {
    title: string;
    path: string;
    url: string;
    type: DisplayItem['type'];
    duration?: number;
    size?: number;
};
export interface DisplayItem {
    title: string;
    type: 'folder' | 'audio' | 'image' | 'video' | 'doc' | 'subtitle' | 'unknown';
    depth: number;
    fileIndex: number | null;
    meta: string;
}
export type ValidFile = {
    index: number;
    file: ProcessedFile;
};
