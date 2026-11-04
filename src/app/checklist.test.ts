import { describe, expect, it } from 'vitest';
import { MANUAL_CHECKS, buildChecklist, isReady, type ChecklistInput } from './checklist';

const ready: ChecklistInput = {
  cameraStatus: 'on',
  cameraLabel: 'iPhone của Tri Camera',
  cameraSize: { width: 1920, height: 1080 },
  calibration: { name: 'Sân A', imageWidth: 1280, imageHeight: 720 },
  videoFolder: 'Video cầu lông',
  videoFolderWritable: true,
  wakeLockSupported: true,
  localModel: true,
  activePlayers: 8,
  manual: Object.fromEntries(MANUAL_CHECKS.map((c) => [c.id, true])),
};

const status = (input: ChecklistInput, id: string) => buildChecklist(input).find((i) => i.id === id)?.status;

describe('danh sách kiểm tra trước buổi', () => {
  it('đủ mọi thứ thì sẵn sàng (cùng tỉ lệ 16:9 dù khác độ phân giải)', () => {
    const items = buildChecklist(ready);
    expect(items.every((i) => i.status === 'ok')).toBe(true);
    expect(isReady(items)).toBe(true);
  });

  it('chưa kết nối camera, chưa calibrate, thiếu người thì chưa sẵn sàng', () => {
    const input = { ...ready, cameraStatus: 'off' as const, calibration: null, activePlayers: 3 };
    expect(status(input, 'camera')).toBe('todo');
    expect(status(input, 'calibration')).toBe('todo');
    expect(status(input, 'players')).toBe('todo');
    expect(isReady(buildChecklist(input))).toBe(false);
  });

  it('cảnh báo nhưng không chặn: camera không phải iPhone, chưa chọn thư mục, model từ internet', () => {
    const input = { ...ready, cameraLabel: 'FaceTime HD Camera', videoFolder: null, localModel: false };
    expect(status(input, 'camera')).toBe('warn');
    expect(status(input, 'folder')).toBe('warn');
    expect(status(input, 'model')).toBe('warn');
    expect(isReady(buildChecklist(input))).toBe(true);
  });

  it('tỉ lệ khung hình camera khác lúc calibrate thì cảnh báo', () => {
    expect(status({ ...ready, cameraSize: { width: 1440, height: 1080 } }, 'calibration')).toBe('warn');
  });

  it('mục kiểm tra bằng mắt chưa đánh dấu thì là việc cần làm', () => {
    expect(status({ ...ready, manual: {} }, 'charging')).toBe('todo');
  });
});
