// --- START OF FILE src/config.ts --- 

import { Schema } from 'koishi'
import { AccessMode, SendMode, ZipMode, CardModeNonAudioAction } from './common/constants'

// The Config interface is defined here to merge with the const Config Schema.
export interface Config {
  useForward: boolean;
  showSearchImage: boolean;
  useImageMenu: boolean;
  showLinks: boolean;
  pageSize: number;
  interactionTimeout: number;
  accessMode: AccessMode;
  whitelist: string[];
  blacklist: string[];
  defaultSendMode: SendMode;
  cardModeNonAudioAction: CardModeNonAudioAction;
  downloadTimeout: number;
  apiBaseUrl: string;
  usePassword: boolean;
  password: string;
  zipMode: ZipMode;
  debug: boolean;
  prependRjCodeCard: boolean;
  prependRjCodeFile: boolean;
  prependRjCodeZip: boolean;
}

// By removing the type annotation `: Schema<Config>` and relying on the `as` assertion,
// we override TypeScript's faulty inference for complex schemas.
export const Config = Schema.intersect([
    Schema.object({
        apiBaseUrl: Schema.union([
            Schema.const('https://api.asmr.one/api').description('asmr.one(国内墙)'),
            Schema.const('https://api.asmr-100.com/api').description('asmr-100.com(国内墙)'),
            Schema.const('https://api.asmr-200.com/api').description('asmr-200.com(随缘墙)'),
            Schema.const('https://api.asmr-300.com/api').description('asmr-300.com(随缘墙)'),
            Schema.string().description('自定义 API 地址'),
        ]).default('https://api.asmr-200.com/api').description('音声数据 API 地址。'),
        useForward: Schema.boolean().default(false).description('(文本模式) 启用合并转发发送长消息。'),
        showSearchImage: Schema.boolean().default(false).description('(文本模式) 搜索结果中显示封面图 (有风控风险)。'),
        useImageMenu: Schema.boolean().default(true).description('启用图片菜单 (需 puppeteer)。'),
        showLinks: Schema.boolean().default(false).description('在详情中显示 asmr.one/DLsite 链接。'),
        pageSize: Schema.number().min(1).max(40).default(10).description('每页结果数量 (1-40)。'),
        interactionTimeout: Schema.number().min(15).default(60).description('交互操作超时时间 (秒)。'),
    }).description('基础设置'),
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
        ]).default(SendMode.FILE).description('默认音轨发送方式。'),
        cardModeNonAudioAction: Schema.union([
            Schema.const(CardModeNonAudioAction.SKIP).description('跳过 (默认)'),
            Schema.const(CardModeNonAudioAction.FALLBACK).description('转为 file 模式发送'),
        ]).default(CardModeNonAudioAction.SKIP).description('Card模式下对非音频文件的操作。'),
        downloadTimeout: Schema.number().default(300).description('单文件下载超时 (秒)。'),
    }).description('下载与发送设置'),
    Schema.object({
        prependRjCodeCard: Schema.boolean().default(false).description('Card 标题添加 RJ 号。'),
        prependRjCodeFile: Schema.boolean().default(true).description('File 文件名添加 RJ 号。'),
        prependRjCodeZip: Schema.boolean().default(true).description('Zip 包名/文件夹添加 RJ 号。'),
    }).description('命名规则设置'),
    Schema.object({
        zipMode: Schema.union([
            Schema.const(ZipMode.SINGLE).description('合并为一包'),
            Schema.const(ZipMode.MULTIPLE).description('每轨一包'),
        ]).default(ZipMode.SINGLE).description('多文件压缩方式 (对所有 zip 发送生效)。'),
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