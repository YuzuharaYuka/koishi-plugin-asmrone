import { Context, Session } from 'koishi';
import { Config } from '../config';
import { AsmrApi } from '../services/api';
import { Renderer } from '../services/renderer';
import { TrackSender } from '../services/sender';
export declare const orderKeys: string[];
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
    private parseAdvancedSearch;
    handleSearch(session: Session, query: string): Promise<void>;
    handleListen(session: Session, query: string): Promise<void>;
    private handleWorkSelection;
    private handleListInteraction;
    private sendWorkInfo;
    private sendWorkInfoAsText;
    private sendSearchTextResult;
}
