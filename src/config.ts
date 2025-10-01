// --- START OF FILE src/config.ts ---

import { Schema } from 'koishi'
import { AccessMode, SendMode, ZipMode, CardModeNonAudioAction, VoiceModeNonAudioAction } from './common/constants'

export interface ImageMenuSettings {
  backgroundColor: string;
  itemBackgroundColor: string;
  textColor: string;
  titleColor: string;
  accentColor: string;
  highlightColor: string;
  enableAntiCensorship: boolean;
  imageRenderScale: number;
}

export interface CacheSettings {
  enableCache: boolean;
  cacheMaxAge: number;
}

export interface RenderCacheSettings {
  enableRenderCache: boolean;
  renderCacheMaxAge: number;
}

export interface Config {
  useForward: boolean;
  showSearchImage: boolean;
  useImageMenu: boolean;
  showLinks: boolean;
  pageSize: number;
  interactionTimeout: number;
  maxRetries: number;
  imageMenu: ImageMenuSettings;
  accessMode: AccessMode;
  whitelist: string[];
  blacklist: string[];
  defaultSendMode: SendMode;
  cardModeNonAudioAction: CardModeNonAudioAction;
  voiceModeNonAudioAction: VoiceModeNonAudioAction;
  downloadTimeout: number;
  downloadConcurrency: number;
  apiBaseUrl: string;
  usePassword: boolean;
  password?: string;
  zipMode: ZipMode;
  zipCompressionLevel: number;
  debug: boolean;
  prependRjCodeCard: boolean;
  prependRjCodeFile: boolean;
  prependRjCodeZip: boolean;
  prependRjCodeLink: boolean;
  cache: CacheSettings;
  renderCache: RenderCacheSettings;
}

export const Config = Schema.intersect([
  Schema.object({
    apiBaseUrl: Schema.union([
      Schema.const('https://api.asmr.one/api').description('asmr.one(国内墙)'),
      Schema.const('https://api.asmr-100.com/api').description('asmr-100.com(国内墙)'),
      Schema.const('https://api.asmr-200.com/api').description('asmr-200.com(随缘墙)'),
      Schema.const('https://api.asmr-300.com/api').description('asmr-300.com(随缘墙)'),
      Schema.string().description('自定义 API 地址 (需以 /api 结尾)'),
    ]).default('https://api.asmr-200.com/api').description('音声数据 API 地址。'),
    useForward: Schema.boolean().default(false).description('(文本模式) 启用合并转发消息。'),
    showSearchImage: Schema.boolean().default(false).description('(文本模式) 搜索结果中显示封面图 (有风控风险)。'),
    useImageMenu: Schema.boolean().default(true).description('启用图片菜单 (需 puppeteer)。'),
    showLinks: Schema.boolean().default(false).description('在详情中显示 asmr.one/DLsite 链接。'),
    pageSize: Schema.number().min(1).max(40).default(10).description('每页结果数量 (1-40)。'),
    interactionTimeout: Schema.number().min(10).default(60).description('交互操作超时时间 (秒)。'),
    maxRetries: Schema.number().min(1).max(5).default(3).description('API 请求及文件下载失败时的最大重试次数。'),
  }).description('基础设置'),

  Schema.object({
    imageMenu: Schema.object({
      backgroundColor: Schema.string().role('color').default('#1e1e1e').description('整体背景色。'),
      itemBackgroundColor: Schema.string().role('color').default('#252526').description('项目/卡片背景色。'),
      textColor: Schema.string().role('color').default('#f0f0f0').description('主要文本颜色。'),
      titleColor: Schema.string().role('color').default('#9cdcfe').description('作品标题颜色。'),
      accentColor: Schema.string().role('color').default('#4ec9b0').description('主题强调色 (用于页头、边框)。'),
      highlightColor: Schema.string().role('color').default('#c586c0').description('高亮颜色 (用于序号)。'),
      enableAntiCensorship: Schema.boolean().default(true).description('启用抗审查 (添加随机噪声)。会增加图片生成耗时。'),
      imageRenderScale: Schema.number().min(0.1).max(3).step(0.1).default(1).description('图片渲染质量 (缩放比例)。越高越清晰，但生成速度越慢。'),
    }).description('图片菜单设置')
  }),

  Schema.object({
    accessMode: Schema.union([
      Schema.const(AccessMode.ALL).description('所有群聊均可使用'),
      Schema.const(AccessMode.WHITELIST).description('白名单模式'),
      Schema.const(AccessMode.BLACKLIST).description('黑名单模式'),
    ]).default(AccessMode.ALL).description('访问权限模式'),
    whitelist: Schema.array(Schema.string()).default([]).description('白名单列表 (群号/频道 ID)，仅白名单模式生效。'),
    blacklist: Schema.array(Schema.string()).default([]).description('黑名单列表 (群号/频道 ID)，仅黑名单模式生效。'),
  }).description('权限设置'),

  Schema.object({
    defaultSendMode: Schema.union([
      Schema.const(SendMode.CARD).description('音乐卡片 (card)'),
      Schema.const(SendMode.FILE).description('音频文件 (file)'),
      Schema.const(SendMode.ZIP).description('压缩包 (zip)'),
      Schema.const(SendMode.LINK).description('下载链接 (link)'),
      Schema.const(SendMode.VOICE).description('语音 (voice)'),
    ]).default(SendMode.FILE).description('默认音轨发送方式。'),
    cardModeNonAudioAction: Schema.union([
      Schema.const(CardModeNonAudioAction.SKIP).description('跳过 (默认)'),
      Schema.const(CardModeNonAudioAction.FALLBACK).description('转为 file 模式发送'),
    ]).default(CardModeNonAudioAction.SKIP).description('Card模式下对非音频文件的操作。'),
    voiceModeNonAudioAction: Schema.union([
      Schema.const(VoiceModeNonAudioAction.SKIP).description('跳过 (默认)'),
      Schema.const(VoiceModeNonAudioAction.FALLBACK).description('转为 file 模式发送'),
    ]).default(VoiceModeNonAudioAction.SKIP).description('Voice模式下对非音频文件的操作。'),
    downloadTimeout: Schema.number().default(300).description('单文件下载超时 (秒)。'),
    downloadConcurrency: Schema.number().min(1).max(10).default(3).description('同时下载文件的最大数量。'),
  }).description('下载与发送设置'),

  Schema.object({
    cache: Schema.object({
      enableCache: Schema.boolean().default(true).description('启用音频文件缓存。'),
      cacheMaxAge: Schema.number().min(0).default(24).description('缓存文件保留时间 (小时)。设置为 0 则保留到插件停止。'),
    }).description('音频缓存设置'),
    renderCache: Schema.object({
      enableRenderCache: Schema.boolean().default(true).description('对图片进行缓存，提高重复请求速度。'),
      renderCacheMaxAge: Schema.number().min(0).default(6).description('图片缓存保留时间 (小时)。设置为 0 则保留到插件停止。'),
    }).description('图片缓存设置'),
  }),

  Schema.object({
    prependRjCodeCard: Schema.boolean().default(false).description('Card 标题添加 RJ 号。'),
    prependRjCodeFile: Schema.boolean().default(true).description('File 文件名添加 RJ 号。'),
    prependRjCodeZip: Schema.boolean().default(true).description('Zip 包名/文件夹添加 RJ 号。'),
    prependRjCodeLink: Schema.boolean().default(true).description('Link 模式标题添加 RJ 号。'),
  }).description('命名规则设置'),

  Schema.object({
    zipMode: Schema.union([
      Schema.const(ZipMode.SINGLE).description('合并为一包'),
      Schema.const(ZipMode.MULTIPLE).description('每轨一包'),
    ]).default(ZipMode.SINGLE).description('多文件压缩方式 (对所有 zip 发送生效)。'),
    zipCompressionLevel: Schema.number().min(0).max(9).default(1).description('ZIP 压缩级别 (0不压缩, 1最快, 9最高)。级别越高，文件越小但速度越慢。'),
    usePassword: Schema.boolean().default(false).description('Zip 是否加密。'),
  }).description('压缩包设置'),

  Schema.union([
    Schema.object({
      usePassword: Schema.const(true).required(),
      password: Schema.string().role('secret').default('').description('压缩包密码。'),
    }),
    Schema.object({}),
  ]),

  Schema.object({
    debug: Schema.boolean().default(false).description('开启Debug模式 (输出详细API日志)。'),
  }).description('调试设置'),
]) as Schema<Config>

// --- END OF FILE src/config.ts ---