import { Context, Session } from 'koishi';
import { Config, SendMode } from './config';
import { ProcessedFile, WorkInfoResponse } from './types';
export declare class TrackSender {
    private ctx;
    private config;
    private tempDir;
    private logger;
    private requestOptions;
    constructor(ctx: Context, config: Config, tempDir: string);
    processAndSendTracks(indices: number[], allFiles: ProcessedFile[], workInfo: WorkInfoResponse, session: Session, mode: SendMode): Promise<void>;
    private _sendAsCard;
    private _sendAsFile;
    private _sendAsZip;
    private handleSingleZip;
    private handleMultipleZips;
    private createZipArchive;
}
