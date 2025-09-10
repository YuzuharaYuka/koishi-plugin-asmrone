import { Context, Session } from 'koishi';
import { ProcessedFile, WorkInfoResponse } from '../common/types';
import { Config } from '../config';
import { SendMode } from '../common/constants';
export declare class TrackSender {
    private ctx;
    private config;
    private tempDir;
    private logger;
    private requestOptions;
    constructor(ctx: Context, config: Config, tempDir: string);
    private _downloadWithRetry;
    private downloadFilesWithConcurrency;
    processAndSendTracks(indices: number[], allFiles: ProcessedFile[], workInfo: WorkInfoResponse, session: Session, mode: SendMode): Promise<void>;
    private _sendAsCard;
    private _sendAsFile;
    private _sendAsZip;
    private handleSingleZip;
    private handleMultipleZips;
    private createZipArchive;
}
