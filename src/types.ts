import type Puppeteer from 'koishi-plugin-puppeteer'

// 使用模块扩充来为 Context 添加 puppeteer 类型定义
declare module 'koishi' {
  interface Context {
    puppeteer: Puppeteer
  }
}

export interface Tag { name: string }
export interface Va { name: string }

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
  type: 'audio' | 'folder';
  title: string;
  mediaDownloadUrl?: string;
  children?: TrackItem[];
  duration?: number;
  size?: number;
}

export type WorkInfoResponse = BaseWork;
export type Track = { title: string; url: string; duration?: number; size?: number; };
export type ValidTrack = { index: number; track: Track };