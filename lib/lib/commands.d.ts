import { Context, Session } from 'koishi';
import { Config } from './config';
import { AsmrApi } from './api';
import { Renderer } from './renderer';
import { TrackSender } from './sender';
export declare class CommandHandler {
    private ctx;
    private config;
    private api;
    private renderer;
    private sender;
    private logger;
    private activeInteractions;
    constructor(ctx: Context, config: Config, api: AsmrApi, renderer: Renderer, sender: TrackSender);
    isAccessAllowed(session: Session): boolean;
    isInteractionActive(session: Session): boolean;
    handlePopular(session: Session, page?: number): Promise<void>;
    handleSearch(session: Session, query: string): Promise<string[]>;
    handleListen(session: Session, query: string): Promise<string[]>;
    private handleWorkSelection;
    private handleListInteraction;
    private sendWorkInfo;
    private sendWorkInfoAsText;
    private sendSearchTextResult;
}
