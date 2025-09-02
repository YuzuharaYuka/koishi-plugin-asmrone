// --- START OF FILE src/commands/search.ts --- 

import { Context } from 'koishi'
import { CommandHandler } from './handler'

export function registerSearchCommand(ctx: Context, handler: CommandHandler) {
  ctx.command('搜音声 <query:text>', '搜索音声作品')
    .action(async ({ session }, query) => handler.handleSearch(session, query));
}