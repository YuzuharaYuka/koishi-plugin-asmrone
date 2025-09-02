import { Schema } from 'koishi';
import { AccessMode, SendMode, ZipMode, CardModeNonAudioAction } from './common/constants';
export interface Config {
    useForward: boolean;
    showSearchImage: boolean;
    useImageMenu: boolean;
    showLinks: boolean;
    pageSize: number;
    interactionTimeout: number;
    accessMode: AccessMode;
    whitelist: string[];
    blacklist: string[];
    defaultSendMode: SendMode;
    cardModeNonAudioAction: CardModeNonAudioAction;
    downloadTimeout: number;
    apiBaseUrl: string;
    usePassword: boolean;
    password: string;
    zipMode: ZipMode;
    debug: boolean;
    prependRjCodeCard: boolean;
    prependRjCodeFile: boolean;
    prependRjCodeZip: boolean;
}
export declare const Config: Schema<Config>;
