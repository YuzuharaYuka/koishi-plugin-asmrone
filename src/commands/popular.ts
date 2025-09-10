// --- START OF FILE src/commands/popular.ts --- 

import { Context } from 'koishi'
import { CommandHandler, orderKeys } from './handler'

export function registerPopularCommand(ctx: Context, handler: CommandHandler) {
  ctx.command('热门音声 [page:number]', '获取当前热门音声列表')
    .usage(
`热门音声 [页码]

页码: 指令末尾的单个数字。`      
    )
    .example('热门音声')
    .example('热门音声 3')
    .action(async ({ session }, page) => {
      // 直接传递页码，不再处理复杂的查询字符串
      return handler.handlePopular(session, page);
    });
}