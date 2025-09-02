// --- START OF FILE src/common/constants.ts --- 

export const SendMode = {
  CARD: 'card',
  FILE: 'file',
  ZIP: 'zip',
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