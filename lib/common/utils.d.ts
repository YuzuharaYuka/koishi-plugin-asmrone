import { TrackItem, DisplayItem, ProcessedFile } from './types';
export declare function formatRjCode(rjInput: string): string | null;
export declare function formatWorkDuration(seconds: number): string;
export declare function formatTrackDuration(seconds: number): string;
export declare function formatTrackSize(bytes: number): string;
export declare function parseTrackIndices(args: string[]): number[];
export declare const getSafeFilename: (name: string) => string;
export declare const getZipFilename: (baseName: string) => string;
export declare function processFileTree(items: TrackItem[]): {
    displayItems: DisplayItem[];
    processedFiles: ProcessedFile[];
};
