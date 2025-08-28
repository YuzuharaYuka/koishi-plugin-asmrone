import { Track, TrackItem } from './types';
export declare function formatRjCode(rjInput: string): string | null;
export declare function formatWorkDuration(seconds: number): string;
export declare function formatTrackDuration(seconds: number): string;
export declare function formatTrackSize(bytes: number): string;
export declare function flattenTracks(items: TrackItem[]): Track[];
export declare const getSafeFilename: (name: string, ext?: string) => string;
export declare const getZipFilename: (baseName: string) => string;
