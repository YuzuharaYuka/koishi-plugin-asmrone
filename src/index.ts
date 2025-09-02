// --- START OF FILE src/index.ts ---

import { Context } from 'koishi'
import { promises as fs } from 'fs'
import { resolve } from 'path'
import archiver from 'archiver'
import { Config } from './config' // <- Updated import path
import { AsmrApi } from './services/api'
import { Renderer } from './services/renderer'
import { TrackSender } from './services/sender'
import { CommandHandler } from './commands/handler'
import { registerPopularCommand } from './commands/popular'
import { registerSearchCommand } from './commands/search'
import { registerListenCommand } from './commands/listen'

// 外部依赖注册
if (!archiver.isRegisteredFormat('zip-encrypted')) {
  archiver.registerFormat('zip-encrypted', require("archiver-zip-encrypted"));
}

export const name = 'asmrone'
export const inject = ['http', 'puppeteer']
export { Config } from './config' // <- Updated export path

export const usage = `
注意：部分内容可能不适合在所有场合使用 (NSFW)，请在合适的范围内使用本插件。

---

### 搜音声 <关键词> [页数]
搜索音声作品
- **关键词**: 必需。 多个标签请用 / 分割。
- **页数**: 可选。 结果的页码。
- **示例**: \`搜音声 催眠/JK 2\`

### 热门音声 [页数]
获取当前热门作品列表
- **页数**: 可选。 结果的页码。
- **示例**: \`热门音声 2\`

### 听音声 <RJ号> [音轨序号...] [选项]
获取作品信息并发送音轨
- **RJ号**: 必需。 作品ID, 如 \`RJ01234567\` 或 \`123456\`。
- **音轨序号**: 可选。 一个或多个音轨的数字序号, 用空格分隔。
- **选项**: 可选。 发送方式 \`card\` | \`file\` | \`zip\`。若省略则使用默认配置。

**使用方式:**
1. 获取详情 (等待交互): \`听音声 RJ01234567\`
2. 直接获取指定音轨并发送压缩包: \`听音声 RJ01234567 1 3 5 zip\`

**交互说明:**
- 在列表指令后, 可回复【序号】选择, 回复【f】翻页。
- 所有交互均可通过回复【n/取消】来中断。

---

**注意:**
- 发送图片或文件失败通常由平台风控导致。
- 音乐卡片(card)模式可能需要签名服务, 且仅在部分适配器 (如 OneBot) 上可用。
`

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('asmrone');
  const tempDir = resolve(ctx.baseDir, 'temp', 'asmrone');

  // 初始化各个服务模块
  const api = new AsmrApi(ctx, config);
  const renderer = new Renderer(ctx);
  const sender = new TrackSender(ctx, config, tempDir);
  const commandHandler = new CommandHandler(ctx, config, api, renderer, sender);

  // 插件启动时的准备工作
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

  // 注册所有指令
  registerPopularCommand(ctx, commandHandler);
  registerSearchCommand(ctx, commandHandler);
  registerListenCommand(ctx, commandHandler);
}