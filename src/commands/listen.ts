import { Context } from 'koishi'
import { CommandHandler } from './handler'

export function registerListenCommand(ctx: Context, handler: CommandHandler) {
  ctx.command('听音声 <rjCode> [tracksAndOptions...]', '获取并收听音声')
    .usage(
`听音声 <RJ号> [音轨序号] [发送方式]
音轨序号: 支持数字和范围，如 1 3 5-8。
发送方式:可选 card, file, zip, link, voice，用于本次发送，不写则使用默认配置。`
    )
    .example('听音声 RJ00123456')
    .example('听音声 123456 1 3 5-8 zip')
    .action(async ({ session }, rjCode, ...tracksAndOptions) => {
      const query = [rjCode, ...tracksAndOptions].filter(Boolean).join(' ');
      return handler.handleListen(session, query);
    });
}