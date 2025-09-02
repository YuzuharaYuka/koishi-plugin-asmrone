export declare const SendMode: {
    readonly CARD: "card";
    readonly FILE: "file";
    readonly ZIP: "zip";
};
export type SendMode = typeof SendMode[keyof typeof SendMode];
export declare const AccessMode: {
    readonly ALL: "all";
    readonly WHITELIST: "whitelist";
    readonly BLACKLIST: "blacklist";
};
export type AccessMode = typeof AccessMode[keyof typeof AccessMode];
export declare const ZipMode: {
    readonly SINGLE: "single";
    readonly MULTIPLE: "multiple";
};
export type ZipMode = typeof ZipMode[keyof typeof ZipMode];
export declare const CardModeNonAudioAction: {
    readonly SKIP: "skip";
    readonly FALLBACK: "fallbackToFile";
};
export type CardModeNonAudioAction = typeof CardModeNonAudioAction[keyof typeof CardModeNonAudioAction];
