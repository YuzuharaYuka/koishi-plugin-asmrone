// --- START OF FILE src/common/types.ts ---

import type Puppeteer from 'koishi-plugin-puppeteer'

// 使用模块扩充来为 Context 添加 puppeteer 类型定义
declare module 'koishi' {
  interface Context {
    puppeteer: Puppeteer
  }
}

// Config interface has been moved to src/config.ts to fix the build error.

export interface Tag { name: string }
export interface Va { name:string }

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

// Represents any downloadable file, now with its full path.
export type ProcessedFile = {
  title: string;
  path: string; // The full relative path for use in ZIP archives.
  url: string;
  type: DisplayItem['type'];
  duration?: number;
  size?: number;
};

// Represents an item in the final display list (for menus).
export interface DisplayItem {
  title: string;
  type: 'folder' | 'audio' | 'image' | 'video' | 'doc' | 'subtitle' | 'unknown';
  depth: number;
  fileIndex: number | null;
  meta: string;
}

// Represents a user-selected, valid file for download.
export type ValidFile = { index: number; file: ProcessedFile };