// --- START OF FILE src/commands/listen.ts --- 

import { Context } from 'koishi'
import { CommandHandler } from './handler'

export function registerListenCommand(ctx: Context, handler: CommandHandler) {
  ctx.command('听音声 <query:text>', '获取并收听音声')
    .action(async ({ session }, query) => handler.handleListen(session, query));
}