// --- START OF FILE src/index.ts ---

import { Context, Logger, Time } from 'koishi'
import { promises as fs } from 'fs'
import { resolve, join } from 'path'
import archiver from 'archiver'
import { Config } from './config'
import { AsmrApi } from './services/api'
import { Renderer } from './services/renderer'
import { TrackSender } from './services/sender'
import { CommandHandler, orderKeys } from './commands/handler'
import { registerListenCommand } from './commands/listen'
import { registerPopularCommand } from './commands/popular'
import { registerSearchCommand } from './commands/search'

// 依赖 archiver-zip-encrypted 来支持加密压缩包
if (!archiver.isRegisteredFormat('zip-encrypted')) {
  archiver.registerFormat('zip-encrypted', require("archiver-zip-encrypted"));
}

export const name = 'asmrone'
export const inject = ['http', 'puppeteer']
export { Config } from './config'

// 定义 `help asmrone` 指令所展示的帮助信息
export const usage = `
##	注意：部分内容可能不适合在所有场合使用 (NSFW)，请在合适的范围内使用本插件。

---

###	指令用法
*	<>为必需项，[]为可选项
#### 搜音声 <关键词> [筛选条件] [排序方式] [页码]
*	**示例1**: \`搜音声 藤田茜 治愈\`
*	**示例2**: \`搜音声 山田 tag:舔耳 tag:剧情 order:发售日 2\`
	*	关键词: 直接输入，多个词用空格分隔。
	*	筛选条件: 使用 \`key:value\` 格式，支持多个。
	*	排序条件: 使用 \`order:排序值\` 格式。
	*	页码: 指令末尾的单个数字。
*	**更详细的参数说明请使用 \`help 搜音声\` 查询**

#### 热门音声 [页码]
*	**示例**: \`热门音声 3\`

#### 听音声 <RJ号> [音轨序号] [发送方式]
*	**示例1**: \`听音声 RJ01234567\`
*	**示例2**: \`听音声 RJ01234567 1 3-5 zip\`
	*	**音轨序号**: 支持单个或多个序号，如\`1 2 3\` \`5-10\`
	*	**发送方式**: 可选 \`card\`(音乐卡片) \`file\`(文件) \`zip\`(压缩包) \`link\`(下载链接) \`voice\`(语音)

---

###	其他说明

#### 筛选参数
*	**语法**: \`key:value\` ，在 \`key\` 前加 \`-\` 为排除该条件。
*	**可用key**: \`tag\`(标签) \`va\`(声优) \`circle\`(社团) \`rate\`(评分) \`sell\`(销量) \`price\`(价格) \`age\`(年龄分级) \`lang\`(语言)
*	**排序方式**: \`order:排序值\` ，默认按 \`销量\` 排序。可用值: \`${orderKeys.join(', ')}\`

#### 交互操作
*	**列表页**: 回复\`序号\`选择作品，\`F\` 下一页，\`P\` 上一页，\`N\` 取消。
*	**详情页**: 回复\`序号\`选择文件，如 \`1 3-5 [发送方式]\`，\`B\` 返回列表， \`N\` 取消。

---

#### 注意事项
*	显示发送成功但看不到图片、文件或报错，大概率是由**平台风控**导致，请尽量使用图片菜单，避免无加密直接发送文件。
*	音乐卡片\`card\`模式需要配置音乐签名服务url，且仅在 onebot 平台可用，请确保bot框架配置支持(如napcat)。
*	语音\`voice\`模式需要配置 silk 服务或 ffmpeg ，且音质较差，仅建议作为预览方式，不建议转换过大的音频文件，资源占用很高。
*	如果遇到问题或有建议，反馈请通过[issue](https://github.com/YuzuharaYuka/koishi-plugin-asmrone/issues)。
`

// 定期清理过期的音频缓存文件
async function cleanupAudioCache(logger: Logger, audioTempDir: string, maxAgeHours: number) {
  if (maxAgeHours <= 0) return;
  const maxAgeMs = maxAgeHours * 3600 * 1000;
  const now = Date.now();
  let cleanedCount = 0;

  try {
    const rjFolders = await fs.readdir(audioTempDir, { withFileTypes: true });
    for (const rjFolder of rjFolders) {
      if (rjFolder.isDirectory()) {
        const folderPath = join(audioTempDir, rjFolder.name);
        try {
          const files = await fs.readdir(folderPath);
          for (const file of files) {
            const filePath = join(folderPath, file);
            try {
              const stats = await fs.stat(filePath);
              if (now - stats.mtimeMs > maxAgeMs) {
                await fs.unlink(filePath);
                cleanedCount++;
              }
            } catch (err) { /* 忽略单个文件处理失败 */ }
          }
        } catch (err) { /* 忽略单个RJ目录处理失败 */ }
      }
    }
    if (cleanedCount > 0) {
      logger.info(`[Audio Cache] Cleaned up ${cleanedCount} expired audio cache file(s).`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') logger.error(`[Audio Cache] Error during cleanup: ${error.message}`);
  }
}

// 定期清理过期的渲染图片缓存
async function cleanupRenderCache(logger: Logger, renderCacheDir: string, maxAgeHours: number) {
  if (maxAgeHours <= 0) return;
  const maxAgeMs = maxAgeHours * 3600 * 1000;
  const now = Date.now();
  let cleanedCount = 0;

  try {
    const files = await fs.readdir(renderCacheDir);
    for (const file of files) {
      const filePath = join(renderCacheDir, file);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
          cleanedCount++;
        }
      } catch (err) {
        logger.warn(`Failed to process render cache file ${filePath}: ${err.message}`);
      }
    }
    if (cleanedCount > 0) {
      logger.info(`[Render Cache] Cleaned up ${cleanedCount} expired image(s).`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error(`[Render Cache] Error during cleanup: ${error.message}`);
    }
  }
}

// 插件的主入口函数
export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('asmrone');
  const tempDir = resolve(ctx.baseDir, 'data', 'temp', 'asmrone');
  const renderCacheDir = resolve(tempDir, 'render-cache');

  // 实例化所有服务
  const api = new AsmrApi(ctx, config);
  const renderer = new Renderer(ctx, config, renderCacheDir);
  const sender = new TrackSender(ctx, config, tempDir);
  const commandHandler = new CommandHandler(ctx, config, api, renderer, sender);

  // 注册插件启动时的生命周期钩子
  ctx.on('ready', async () => {
    try {
      await fs.mkdir(tempDir, { recursive: true });
      await fs.mkdir(renderCacheDir, { recursive: true });
      logger.info('临时文件及缓存目录已创建: %s', tempDir);
    } catch (error) {
      logger.error('创建临时目录失败: %o', error);
    }
    // 启动定时缓存清理任务
    if (config.cache.enableCache) {
      cleanupAudioCache(logger, tempDir, config.cache.cacheMaxAge);
      ctx.setInterval(() => cleanupAudioCache(logger, tempDir, config.cache.cacheMaxAge), Time.hour);
    }
    if (config.renderCache.enableRenderCache) {
      cleanupRenderCache(logger, renderCacheDir, config.renderCache.renderCacheMaxAge);
      ctx.setInterval(() => cleanupRenderCache(logger, renderCacheDir, config.renderCache.renderCacheMaxAge), Time.hour);
    }
  });

  // 注册插件停用时的生命周期钩子
  ctx.on('dispose', async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      logger.info('临时文件及缓存目录已清理: %s', tempDir);
    } catch (error) {
      logger.error('清理临时文件目录失败: %o', error);
    }
  });

  // 注册所有指令
  registerPopularCommand(ctx, commandHandler);
  registerSearchCommand(ctx, commandHandler);
  registerListenCommand(ctx, commandHandler);
}
// --- END OF FILE src/index.ts ---