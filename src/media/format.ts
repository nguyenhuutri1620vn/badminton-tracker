/** Thứ tự ưu tiên định dạng ghi: mp4 (mở được bằng QuickTime) trước, webm sau. */
const CANDIDATES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

export function chooseMimeType(isTypeSupported: (type: string) => boolean): string | null {
  return CANDIDATES.find((type) => isTypeSupported(type)) ?? null;
}

export function extensionFor(mimeType: string): 'mp4' | 'webm' {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}
