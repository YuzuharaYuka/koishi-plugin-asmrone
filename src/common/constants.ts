export const SendMode = {
  CARD: 'card',
  FILE: 'file',
  ZIP: 'zip',
  LINK: 'link',
  VOICE: 'voice', // [NEW] 新增 voice 模式
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

// [NEW] 为 voice 模式新增非音频文件处理方式
export const VoiceModeNonAudioAction = {
  SKIP: 'skip',
  FALLBACK: 'fallbackToFile',
} as const;

export type VoiceModeNonAudioAction = typeof VoiceModeNonAudioAction[keyof typeof VoiceModeNonAudioAction];