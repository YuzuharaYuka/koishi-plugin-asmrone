// --- START OF FILE src/commands/popular.ts --- 

import { Context } from 'koishi'
import { CommandHandler } from './handler'

export function registerPopularCommand(ctx: Context, handler: CommandHandler) {
  ctx.command('热门音声 [page:number]', '获取当前热门音声列表')
    .action(async ({ session }, page) => handler.handlePopular(session, page));
}