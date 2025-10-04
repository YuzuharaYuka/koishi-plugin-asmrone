// --- START OF FILE src/common/constants.ts ---

// 该文件集中管理插件中使用的所有常量，便于维护和修改。

export const SendMode = {
  CARD: 'card',
  FILE: 'file',
  ZIP: 'zip',
  LINK: 'link',
  PLAYER: 'player', // 新增
  VOICE: 'voice',
} as const;

export type SendMode = typeof SendMode[keyof typeof SendMode];

export const AccessMode = {
  ALL: 'all',
  WHITELIST: 'whitelist',
  BLACKLIST: 'blacklist',
} as const;

export type AccessMode = typeof AccessMode[keyof typeof AccessMode];

export const ZipMode = {
  SINGLE: 'single',
  MULTIPLE: 'multiple',
} as const;

export type ZipMode = typeof ZipMode[keyof typeof ZipMode];

export const CardModeNonAudioAction = {
  SKIP: 'skip',
  FALLBACK: 'fallbackToFile',
} as const;

export type CardModeNonAudioAction = typeof CardModeNonAudioAction[keyof typeof CardModeNonAudioAction];

export const VoiceModeNonAudioAction = {
  SKIP: 'skip',
  FALLBACK: 'fallbackToFile',
} as const;

export type VoiceModeNonAudioAction = typeof VoiceModeNonAudioAction[keyof typeof VoiceModeNonAudioAction];

// 网络请求与下载相关常量
export const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
export const RETRY_DELAY_MS = 1500;
export const MIN_FILE_SIZE_BYTES = 100;
export const LINK_SEND_DELAY_MS = 300;
export const ONEBOT_MUSIC_CARD_TYPE = '163';

// --- END OF FILE src/common/constants.ts ---