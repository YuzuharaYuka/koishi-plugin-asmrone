import { Track, TrackItem } from './types'

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
  return `${mb.toFixed(2)} MB`;
}

export function flattenTracks(items: TrackItem[]): Track[] {
  const tracks: Track[] = []
  function processItem(item: TrackItem) {
    if (item.type === 'audio' && item.mediaDownloadUrl) {
        tracks.push({ title: item.title, url: item.mediaDownloadUrl, duration: item.duration, size: item.size })
    } else if (item.type === 'folder' && item.children) {
        item.children.forEach(processItem)
    }
  }
  items.forEach(processItem)
  return tracks
}

export const getSafeFilename = (name: string, ext: string = '') => name.replace(/[\/\\?%*:|"<>]/g, '_') + ext;
export const getZipFilename = (baseName: string): string => `${baseName.replace(/[\/\\?%*:|"<>]/g, '_')}.zip`;