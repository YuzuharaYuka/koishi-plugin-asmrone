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

// 解析用户输入的音轨序号，支持单个数字和范围 (如 "1 3-5")
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

// --- V7 优化：修复文件排序逻辑 ---
export function processFileTree(items: TrackItem[]): { displayItems: DisplayItem[], processedFiles: ProcessedFile[] } {
  const displayItems: DisplayItem[] = [];
  const processedFiles: ProcessedFile[] = [];
  let fileCounter = 0;

  function getFileType(item: TrackItem): DisplayItem['type'] {
    if (item.type === 'folder') return 'folder';
    if (item.mediaDownloadUrl) {
      const title = item.title.toLowerCase();
      if (item.type === 'audio' || /\.(mp3|wav|flac|m4a|ogg)$/.test(title)) return 'audio';
      if (item.type === 'image' || /\.(jpg|jpeg|png|gif|webp)$/.test(title)) return 'image';
      if (item.type === 'video' || /\.(mp4|mov|avi|mkv|webm)$/.test(title)) return 'video';
      if (/\.(txt|srt|ass|vtt|lrc)$/.test(title)) return 'subtitle';
      if (/\.(pdf|doc|docx)$/.test(title)) return 'doc';
    }
    if (item.type === 'folder') return 'folder';
    return 'unknown';
  }

  const sorter = (a: TrackItem, b: TrackItem) => {
    const typePriority = {
      audio: 1, video: 2, image: 3, subtitle: 4, doc: 5, unknown: 6, folder: 7
    };
    const typeA = getFileType(a);
    const typeB = getFileType(b);
    // 将文件夹排在文件之后
    const priorityA = typeA === 'folder' ? typePriority.folder : (typePriority[typeA] || typePriority.unknown);
    const priorityB = typeB === 'folder' ? typePriority.folder : (typePriority[typeB] || typePriority.unknown);

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
  };

  function traverse(item: TrackItem, depth: number, currentPath: string) {
    const fileType = getFileType(item);
    const isDownloadable = !!item.mediaDownloadUrl && item.type !== 'folder';
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
      });
    }

    if (item.type === 'folder' && item.children?.length > 0) {
      // 修复：排序应该在每个子目录级别进行，而不是全局
      item.children.sort(sorter).forEach(child => traverse(child, depth + 1, newPath));
    }
  }

  // 修复：移除全局排序，从根级别开始遍历
  items.forEach(item => traverse(item, 0, ''));

  return { displayItems, processedFiles };
}
// --- END OF FILE src/common/utils.ts ---