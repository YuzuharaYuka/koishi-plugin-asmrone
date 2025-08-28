import { Schema } from 'koishi'

export type SendMode = 'card' | 'file' | 'zip';

export interface Config {
  useForward: boolean;
  showSearchImage: boolean;
  useImageMenu: boolean;
  showLinks: boolean;
  pageSize: number;
  accessMode: 'all' | 'whitelist' | 'blacklist';
  whitelist: string[];
  blacklist: string[];
  defaultSendMode: SendMode;
  downloadTimeout: number;
  apiBaseUrl: string;
  usePassword: boolean;
  password: string;
  zipMode: 'single' | 'multiple';
}

export const Config: Schema<Config> = Schema.intersect([
    Schema.object({
        apiBaseUrl: Schema.string().default('https://api.asmr-200.com/api').description('获取音声数据的 API 地址。\n可选值参考:\n- `asmr-300.com` (随缘墙)\n- `asmr-200.com` (随缘墙)\n- `asmr-100.com` (国内墙)\n- `asmr.one` (国内墙)\n请替换域名部分, 如: `https://api.asmr.one/api`'),
        useForward: Schema.boolean().default(false).description('【非图片菜单模式下】使用合并转发发送长消息。'),
        showSearchImage: Schema.boolean().default(false).description('【非图片菜单模式下】在搜索结果中显示封面图。\n注意：可能增加平台风控风险。'),
        useImageMenu: Schema.boolean().default(true).description('使用图片菜单模式发送结果。\n需要 `koishi-plugin-puppeteer`。'),
        showLinks: Schema.boolean().default(false).description('在作品详情中返回 asmr.one 和 DLsite 的链接。'),
        pageSize: Schema.number().min(1).max(40).default(10).description('每页展示的结果数量 (范围 1-40)。'),
    }).description('基础设置'),
    Schema.object({
        accessMode: Schema.union([
            Schema.const('all').description('所有群聊均可使用'),
            Schema.const('whitelist').description('白名单模式'),
            Schema.const('blacklist').description('黑名单模式'),
        ]).default('all').description('访问权限模式'),
        whitelist: Schema.array(Schema.string()).default([]).description('白名单列表 (群号或频道 ID)。\n仅在白名单模式下生效。'),
        blacklist: Schema.array(Schema.string()).default([]).description('黑名单列表 (群号或频道 ID)。\n仅在黑名单模式下生效。'),
    }).description('权限设置'),
    Schema.object({
        defaultSendMode: Schema.union([
            Schema.const('card').description('音乐卡片 (card)'),
            Schema.const('file').description('音频文件 (file)'),
            Schema.const('zip').description('压缩包 (zip)'),
        ]).default('file').description('`听音声` 指令的默认发送方式。'),
        downloadTimeout: Schema.number().default(300).description('单个音轨下载的超时时间 (秒)。'),
    }).description('下载与发送设置'),
    Schema.object({
        zipMode: Schema.union([
            Schema.const('single').description('合并为一包'),
            Schema.const('multiple').description('每轨一包'),
        ]).default('single').description('多音轨压缩方式。\n对所有 `zip` 模式的发送生效。'),
        usePassword: Schema.boolean().default(false).description('是否为压缩包添加密码。'),
    }).description('压缩包设置'),
    Schema.union([
        Schema.object({
            usePassword: Schema.const(true).required(),
            password: Schema.string().role('secret').default('').description('压缩包密码。'),
        }),
        Schema.object({}),
    ]),
]) as Schema<Config>