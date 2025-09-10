// --- START OF FILE src/index.ts --- 

import { Context } from 'koishi'
import { promises as fs } from 'fs'
import { resolve } from 'path'
import archiver from 'archiver'
import { Config } from './config'
import { AsmrApi } from './services/api'
import { Renderer } from './services/renderer'
import { TrackSender } from './services/sender'
import { CommandHandler, orderKeys } from './commands/handler'
import { registerPopularCommand } from './commands/popular'
import { registerSearchCommand } from './commands/search'
import { registerListenCommand } from './commands/listen'

if (!archiver.isRegisteredFormat('zip-encrypted')) {
  archiver.registerFormat('zip-encrypted', require("archiver-zip-encrypted"));
}

export const name = 'asmrone'
export const inject = ['http', 'puppeteer']
export { Config } from './config'

export const usage = `
##	注意：部分内容可能不适合在所有场合使用 (NSFW)，请在合适的范围内使用本插件。

---
##	指令用法
\n\n<>为必需项，[]为可选项
### 搜音声 <关键词> [筛选条件] [排序方式] [页码]
根据关键词搜索并获取音声列表。\n\n
*	关键词: 直接输入，多个词用空格分隔。
*	筛选条件: 使用 key:value 格式。
*	排序条件: 使用 order:排序值 格式。
*	页码: 指令末尾的单个数字。
- **示例**: \`搜音声 山田 tag:舔耳 order:发售日 2\`

*	**详细参数说明请使用\`help 搜音声\`查询**

### 热门音声 [页码]
获取当前热门作品列表。可包含页码。
- **示例**: \`热门音声 3\`

### 听音声 <RJ号> [音轨序号] [发送方式]
获取作品信息并发送音轨。\n\n
*	音轨序号: 支持单个或多个序号，如\`1 2 3,1-10\`
*	发送方式: 可选 \`card\` \`file\` \`zip\`，分别对应音乐卡片，文件，压缩包模式
- **获取详情**: \`听音声 RJ01234567\`
- **直接下载**: \`听音声 RJ01234567 1 3-5 zip\`

---

#### **高级筛选**
- **语法**: \`key:value\`，在 key 前加 \`-\` 为排除该条件。
- **可用 key**: \`tag\`(标签), \`va\`(声优), \`circle\`(社团), \`rate\`(评分), \`sell\`(销量), \`price\`(价格), \`age\`(年龄分级), \`lang\`(语言)。
- **排序**: 使用 \`order:排序值\`，默认按销量排序。可用值: ${orderKeys.join(', ')}。

#### **交互说明**
- **列表页**: 回复【序号】选择，【F】翻页，【N】取消。
- **详情页**: 回复【音轨序号】下载，【N】取消。

---

###	注意：
*	**音乐卡片card模式需要配置音乐签名服务url，且仅在QQ平台可用，请确保bot使用的框架配置支持。**
*	**发送图片或文件失败，大概率是由平台风控导致，请尽量使用图片菜单，发送方式选择card或zip加密模式。**
`

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('asmrone');
  const tempDir = resolve(ctx.baseDir, 'temp', 'asmrone');

  const api = new AsmrApi(ctx, config);
  const renderer = new Renderer(ctx, config);
  const sender = new TrackSender(ctx, config, tempDir);
  const commandHandler = new CommandHandler(ctx, config, api, renderer, sender);

  ctx.on('ready', async () => {
    try {
      await fs.mkdir(tempDir, { recursive: true });
      logger.info('临时文件目录已创建: %s', tempDir);
    } catch (error) {
      logger.error('创建临时文件目录失败: %o', error);
    }
    if (config.useImageMenu && !ctx.puppeteer) {
      logger.warn('图片菜单功能已开启，但未找到 puppeteer 服务。请安装 koishi-plugin-puppeteer 并重启。');
    }
  });

  registerPopularCommand(ctx, commandHandler);
  registerSearchCommand(ctx, commandHandler);
  registerListenCommand(ctx, commandHandler);
}