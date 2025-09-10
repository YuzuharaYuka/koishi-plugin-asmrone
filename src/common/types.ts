// --- START OF FILE src/common/types.ts --- 

import type Puppeteer from 'koishi-plugin-puppeteer'

// 使用模块扩充来为 Context 添加 puppeteer 类型定义
declare module 'koishi' {
  interface Context {
    puppeteer: Puppeteer
  }
}

// [MODIFIED] 补充了 id 字段，使其更完整
export interface Tag { 
  id: number;
  name: string;
  i18n?: any; // i18n 结构复杂，暂时定义为 any
}

// [MODIFIED] 补充了 id 字段，使其更完整
export interface Va { 
  id: string;
  name:string;
}

// [MODIFIED] 补充了 price 和 review_count 字段
export interface BaseWork {
  id: number;
  title: string;
  name: string; // circle name
  mainCoverUrl: string;
  release: string;
  dl_count: number;
  price: number;
  review_count: number;
  rate_average_2dp: number;
  rate_count: number;
  vas: Va[];
  tags: Tag[];
  duration: number;
  source_url: string;
}

// [MODIFIED] 补全了 pagination 的字段
export interface ApiSearchResponse {
  works: BaseWork[];
  pagination: {
    totalCount: number;
    currentPage: number;
    pageSize: number;
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

export type ValidFile = { index: number; file: ProcessedFile };

export interface AdvancedSearchParams {
    keyword: string;
    page: number;
    order?: string;
    sort?: string;
    include: Record<string, string[]>;
    exclude: Record<string, string[]>;
}