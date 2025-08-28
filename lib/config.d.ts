import { Schema } from 'koishi';
export type SendMode = 'card' | 'file' | 'zip';
export interface Config {
    useForward: boolean;
    showSearchImage: boolean;
    useImageMenu: boolean;
    showLinks: boolean;
    pageSize: number;
    accessMode: 'all' | 'whitelist' | 'blacklist';
    whitelist: string[];
    blacklist: string[];
    defaultSendMode: SendMode;
    downloadTimeout: number;
    apiBaseUrl: string;
    usePassword: boolean;
    password: string;
    zipMode: 'single' | 'multiple';
}
export declare const Config: Schema<Config>;
