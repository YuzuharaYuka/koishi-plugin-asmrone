// --- START OF FILE src/config.ts ---

import { Schema } from 'koishi'
import { AccessMode, SendMode, ZipMode, CardModeNonAudioAction, VoiceModeNonAudioAction } from './common/constants'

// --- 类型定义 ---

export interface PlayerSettings {
  playerBaseUrl: string;
}

export interface CacheSettings {
  enableCache: boolean;
  cacheMaxAge: number;
  enableRenderCache: boolean;
  renderCacheMaxAge: number;
}

export interface ImageMenuSettings {
  backgroundColor: string;
  itemBackgroundColor: string;
  textColor: string;
  titleColor: string;
  accentColor: string;
  highlightColor: string;
}

export interface Config {
  // 核心设置
  apiBaseUrl: string;
  defaultSendMode: SendMode;
  useImageMenu: boolean;
  useForward: boolean;
  showSearchImage: boolean;
  
  // 权限设置
  accessMode: AccessMode;
  whitelist: string[];
  blacklist: string[];

  // 下载与发送设置
  downloadConcurrency: number;
  downloadTimeout: number;
  maxRetries: number;
  cardModeNonAudioAction: CardModeNonAudioAction;
  voiceModeNonAudioAction: VoiceModeNonAudioAction;
  zipMode: ZipMode;
  zipCompressionLevel: number;
  usePassword: boolean;
  password?: string;
  
  // 显示与交互设置
  showLinks: boolean;
  pageSize: number;
  interactionTimeout: number;

  // 缓存设置
  cache: CacheSettings;
  
  // 命名设置
  prependRjCodeCard: boolean;
  prependRjCodeFile: boolean;
  prependRjCodeZip: boolean;
  prependRjCodeLink: boolean;

  // 其他设置
  player: PlayerSettings;
  imageMenu: ImageMenuSettings;
  imageRenderScale: number;
  enableAntiCensorship: boolean;

  // 调试设置
  debug: boolean;
}

// --- Schema 定义 ---

export const Config = Schema.intersect([
  // 核心设置
  Schema.object({
    apiBaseUrl: Schema.union([
      Schema.const('https://api.asmr.one/api').description('asmr.one (国内墙)'),
      Schema.const('https://api.asmr-100.com/api').description('asmr-100.com (国内墙)'),
      Schema.const('https://api.asmr-200.com/api').description('asmr-200.com (随缘墙)'),
      Schema.const('https://api.asmr-300.com/api').description('asmr-300.com (随缘墙)'),
      Schema.string().description('自定义 API 地址'),
    ]).default('https://api.asmr-200.com/api').description('音声数据 API 地址。'),
    defaultSendMode: Schema.union([
      Schema.const(SendMode.CARD).description('音乐卡片 (card)'),
      Schema.const(SendMode.FILE).description('音频文件 (file)'),
      Schema.const(SendMode.ZIP).description('压缩包 (zip)'),
      Schema.const(SendMode.PLAYER).description('在线播放器 (player)'),
      Schema.const(SendMode.LINK).description('下载链接 (link)'),
      Schema.const(SendMode.VOICE).description('语音 (voice)'),
    ]).default(SendMode.CARD).description('`听音声` 指令的默认音轨发送方式。'),
    useImageMenu: Schema.boolean().default(true).description('使用图片发送搜索结果和作品详情 (推荐，需要 puppeteer 服务)。'),
    useForward: Schema.boolean().default(true).description('[文本模式] 启用合并转发发送长消息，减少刷屏。'),
    showSearchImage: Schema.boolean().default(false).description('[文本模式] 在搜索结果的文本消息中也显示封面图。'),
  }).description('基础设置'),

  // 权限设置
  Schema.object({
    accessMode: Schema.union([
      Schema.const(AccessMode.ALL).description('所有群聊和频道'),
      Schema.const(AccessMode.WHITELIST).description('仅白名单'),
      Schema.const(AccessMode.BLACKLIST).description('除黑名单外'),
    ]).default(AccessMode.ALL).description('插件在不同群聊/频道中的可用性模式。'),
    whitelist: Schema.array(String).role('table').description('白名单列表 (群号/频道 ID)，仅在白名单模式下生效。'),
    blacklist: Schema.array(String).role('table').description('黑名单列表 (群号/频道 ID)，仅在黑名单模式下生效。'),
  }).description('权限设置'),

  // 修正：将 description 附加到内部的 object 上，并使用正确的 Schema.intersect 语法
  Schema.intersect([
    Schema.object({
      downloadConcurrency: Schema.number().min(1).max(10).default(3).description('同时下载文件的最大数量。'),
      downloadTimeout: Schema.number().min(30).default(300).description('单个文件下载的超时时间 (秒)。'),
      maxRetries: Schema.number().min(0).max(5).default(3).description('API 请求或文件下载失败时的最大重试次数。'),
      cardModeNonAudioAction: Schema.union([
        Schema.const(CardModeNonAudioAction.SKIP).description('跳过'),
        Schema.const(CardModeNonAudioAction.FALLBACK).description('转为文件发送'),
      ]).default(CardModeNonAudioAction.SKIP).description('Card 模式下遇到非音频文件时的处理方式。'),
      voiceModeNonAudioAction: Schema.union([
        Schema.const(VoiceModeNonAudioAction.SKIP).description('跳过'),
        Schema.const(VoiceModeNonAudioAction.FALLBACK).description('转为文件发送'),
      ]).default(VoiceModeNonAudioAction.SKIP).description('Voice 模式下遇到非音频文件时的处理方式。'),
      zipMode: Schema.union([
        Schema.const(ZipMode.SINGLE).description('所有文件合并为一个包'),
        Schema.const(ZipMode.MULTIPLE).description('每个文件单独压缩'),
      ]).default(ZipMode.SINGLE).description('当选择多个音轨以 ZIP 方式发送时的压缩策略。'),
      zipCompressionLevel: Schema.number().min(0).max(9).step(1).role('slider').default(1).description('ZIP 压缩级别 (0不压缩, 1最快, 9最高)。'),
      usePassword: Schema.boolean().default(false).description('是否为生成的 ZIP 压缩包设置密码。'),
    }).description('下载与发送'), // 将标题放在这里
    Schema.union([
      Schema.object({
        usePassword: Schema.const(true).required(),
        password: Schema.string().role('secret').description('要设置的压缩包密码。'),
      }),
      Schema.object({}),
    ]),
  ]),

  // 显示与交互设置
  Schema.object({
    showLinks: Schema.boolean().default(false).description('在作品详情中显示 asmr.one 和 DLsite 的网页链接。'),
    pageSize: Schema.number().min(1).max(40).default(10).description('搜索结果每页显示的数量 (1-40)。'),
    interactionTimeout: Schema.number().min(10).default(60).description('等待用户交互操作的超时时间 (秒)。'),
  }).description('显示与交互'),

  // 缓存设置
  Schema.object({
    cache: Schema.object({
      enableCache: Schema.boolean().default(true).description('启用音频文件缓存，避免重复下载。'),
      cacheMaxAge: Schema.number().min(0).default(1).description('音频缓存文件保留时间 (小时)。设为 0 表示永久保留。'),
      enableRenderCache: Schema.boolean().default(true).description('启用图片菜单渲染缓存，加快重复请求的响应速度。'),
      renderCacheMaxAge: Schema.number().min(0).default(1).description('图片缓存文件保留时间 (小时)。设为 0 表示永久保留。'),
    }).description('缓存设置'),
  }),
  
  // 命名设置
  Schema.object({
    prependRjCodeCard: Schema.boolean().default(false).description('是否在 `card` 标题前添加 RJ 号'),
    prependRjCodeFile: Schema.boolean().default(true).description('是否在 `file` 标题前添加 RJ 号'),
    prependRjCodeZip: Schema.boolean().default(true).description('是否在 `zip` 标题前添加 RJ 号'),
    prependRjCodeLink: Schema.boolean().default(true).description('是否在 `link` 标题前添加 RJ 号'),
  }).description('命名设置'),

  // 其他设置
  Schema.object({
    player: Schema.object({
      playerBaseUrl: Schema.string().role('link').default('https://yuzuharayuka.github.io/amsrone-audio-player/').description('在线播放器页面的 URL 地址。'),
    }),
    imageMenu: Schema.object({
      backgroundColor: Schema.string().role('color').default('#1e1e1e').description('图片整体背景色。'),
      itemBackgroundColor: Schema.string().role('color').default('#252526').description('项目/卡片背景色。'),
      textColor: Schema.string().role('color').default('#f0f0f0').description('主要文本颜色。'),
      titleColor: Schema.string().role('color').default('#9cdcfe').description('作品标题颜色。'),
      accentColor: Schema.string().role('color').default('#4ec9b0').description('主题强调色 (如边框)。'),
      highlightColor: Schema.string().role('color').default('#c586c0').description('高亮颜色 (如序号)。'),
    }).description('图片菜单外观').collapse(),
    imageRenderScale: Schema.number().min(0.5).max(3).step(0.1).role('slider').default(1).description('图片渲染质量 (缩放比例)。越高越清晰，但生成越慢，图片越大。'),
    enableAntiCensorship: Schema.boolean().default(true).description('图片抗风控处理，会略微增加生成耗时。').experimental(),
  }).description('其他设置'),
  
  // 调试设置
  Schema.object({
    debug: Schema.boolean().default(false).description('启用调试模式，将在控制台输出详细的 API 请求日志。'),
  }).description('调试设置'),
  
]) as Schema<Config>
// --- END OF FILE src/config.ts ---