// --- START OF FILE src/common/types.ts ---

// 该文件定义了插件所需的所有核心 TypeScript 类型接口。

import type Puppeteer from 'koishi-plugin-puppeteer'

// 为 Koishi 的 Context 类型注入 puppeteer 服务，以获得类型提示支持。
declare module 'koishi' {
  interface Context {
    puppeteer: Puppeteer
  }
}

export interface Tag {
  id: number;
  name: string;
  i18n?: any;
}

export interface Va {
  id: string;
  name: string;
}

export interface BaseWork {
  id: number;
  title: string;
  name: string; // 社团名
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

// 内部处理时，扁平化后的文件结构
export type ProcessedFile = {
  title: string;
  path: string; // 在压缩包内的相对路径
  url: string;
  type: DisplayItem['type'];
  duration?: number;
  size?: number;
};

// 用于在详情页展示的文件/文件夹项
export interface DisplayItem {
  title: string;
  type: 'folder' | 'audio' | 'image' | 'video' | 'doc' | 'subtitle' | 'unknown';
  depth: number;
  fileIndex: number | null; // 可下载文件的序号
  meta: string; // 格式化后的时长和大小
}

// 包含原始文件信息和用户选择序号的有效文件对象
export type ValidFile = { index: number; file: ProcessedFile };

// 高级搜索解析后的参数结构
export interface AdvancedSearchParams {
  keyword: string;
  page: number;
  order?: string;
  sort?: string;
  include: Record<string, string[]>;
  exclude: Record<string, string[]>;
}

// --- END OF FILE src/common/types.ts ---