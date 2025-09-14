import { Schema } from 'koishi';
import { AccessMode, SendMode, ZipMode, CardModeNonAudioAction, VoiceModeNonAudioAction } from './common/constants';
export interface ImageMenuSettings {
    backgroundColor: string;
    itemBackgroundColor: string;
    textColor: string;
    titleColor: string;
    accentColor: string;
    highlightColor: string;
    enableAntiCensorship: boolean;
    imageRenderScale: number;
}
export interface CacheSettings {
    enableCache: boolean;
    cacheMaxAge: number;
}
export interface Config {
    useForward: boolean;
    showSearchImage: boolean;
    useImageMenu: boolean;
    showLinks: boolean;
    pageSize: number;
    interactionTimeout: number;
    maxRetries: number;
    imageMenu: ImageMenuSettings;
    accessMode: AccessMode;
    whitelist: string[];
    blacklist: string[];
    defaultSendMode: SendMode;
    cardModeNonAudioAction: CardModeNonAudioAction;
    voiceModeNonAudioAction: VoiceModeNonAudioAction;
    downloadTimeout: number;
    downloadConcurrency: number;
    apiBaseUrl: string;
    usePassword: boolean;
    password?: string;
    zipMode: ZipMode;
    zipCompressionLevel: number;
    debug: boolean;
    prependRjCodeCard: boolean;
    prependRjCodeFile: boolean;
    prependRjCodeZip: boolean;
    prependRjCodeLink: boolean;
    cache: CacheSettings;
}
export declare const Config: Schema<Config>;
