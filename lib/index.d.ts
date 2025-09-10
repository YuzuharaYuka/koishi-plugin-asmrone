import { Context } from 'koishi';
import { Config } from './config';
export declare const name = "asmrone";
export declare const inject: string[];
export { Config } from './config';
export declare const usage: string;
export declare function apply(ctx: Context, config: Config): void;
