// --- START OF FILE src/common/utils.ts ---

import { TrackItem, DisplayItem, ProcessedFile } from './types'

export function formatRjCode(rjInput: string): string | null {
  if (!rjInput) return null;
  const numericPart = rjInput.replace(/^RJ/i, '');
  if (!/^\d+$/.test(numericPart)) {
    return null;
  }
  return 'RJ' + numericPart.padStart(8, '0');
}

export function formatWorkDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '未知';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  let result = '';
  if (h > 0) result += `${h}小时`;
  if (m > 0 || h > 0) result += `${m}分`;
  result += `${s}秒`;
  return result;
}

export function formatTrackDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function formatTrackSize(bytes: number): string {
  if (isNaN(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) {
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  }
  return `${mb.toFixed(2)} MB`;
}

export function parseTrackIndices(args: string[]): number[] {
    const indices: number[] = [];
    for (const arg of args) {
        if (arg.includes('-')) {
            const [start, end] = arg.split('-').map(n => parseInt(n, 10));
            if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
                for (let i = start; i <= end; i++) {
                    indices.push(i);
                }
            }
        } else {
            const num = parseInt(arg, 10);
            if (!isNaN(num) && num > 0) {
                indices.push(num);
            }
        }
    }
    return [...new Set(indices)].sort((a, b) => a - b);
}

export const getSafeFilename = (name: string) => name.replace(/[\/\\?%*:|"<>]/g, '_');
export const getZipFilename = (baseName: string): string => `${baseName.replace(/[\/\\?%*:|"<>]/g, '_')}.zip`;

export function processFileTree(items: TrackItem[]): { displayItems: DisplayItem[], processedFiles: ProcessedFile[] } {
  const displayItems: DisplayItem[] = [];
  const processedFiles: ProcessedFile[] = [];
  let fileCounter = 0;

  function getFileType(item: TrackItem): DisplayItem['type'] {
    switch (item.type) {
      case 'folder': return 'folder';
      case 'audio': return 'audio';
      case 'image': return 'image';
      case 'text': return 'subtitle';
    }
    const title = item.title.toLowerCase();
    if (/\.(mp4|mov|avi|mkv|webm)$/.test(title)) return 'video';
    if (/\.(jpg|jpeg|png|gif|webp)$/.test(title)) return 'image';
    if (/\.(mp3|wav|flac|m4a|ogg)$/.test(title)) return 'audio';
    if (/\.(pdf|doc|docx)$/.test(title)) return 'doc';
    if (/\.(txt|vtt|srt|ass)$/.test(title)) return 'subtitle';
    return 'unknown';
  }

  const sorter = (a: TrackItem, b: TrackItem) => {
    const typePriority = {
        audio: 0, video: 1, image: 2, subtitle: 3, doc: 4, unknown: 5, folder: 6
    };
    const typeA = getFileType(a);
    const typeB = getFileType(b);
    const priorityA = typePriority[typeA];
    const priorityB = typePriority[typeB];
    if (priorityA !== priorityB) {
        return priorityA - priorityB;
    }
    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
  };
  
  function traverse(item: TrackItem, depth: number, currentPath: string) {
    const fileType = getFileType(item);
    const isDownloadable = !!item.mediaDownloadUrl;
    const safeTitle = getSafeFilename(item.title);
    const newPath = currentPath ? `${currentPath}/${safeTitle}` : safeTitle;

    displayItems.push({
      title: item.title,
      type: fileType,
      depth,
      fileIndex: isDownloadable ? ++fileCounter : null,
      meta: [
        item.duration ? formatTrackDuration(item.duration) : null,
        item.size ? formatTrackSize(item.size) : null,
      ].filter(Boolean).join(' | '),
    });

    if (isDownloadable) {
      processedFiles.push({
        title: item.title,
        path: newPath,
        url: item.mediaDownloadUrl,
        type: fileType,
        duration: item.duration,
        size: item.size,
      });
    }

    if (item.type === 'folder' && item.children) {
      item.children.sort(sorter);
      item.children.forEach(child => traverse(child, depth + 1, newPath));
    }
  }

  items.sort(sorter);
  items.forEach(item => traverse(item, 0, ''));

  return { displayItems, processedFiles };
}