export type CheckStatus = 'ok' | 'warn' | 'todo';

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  hint?: string;
}

export interface ChecklistInput {
  cameraStatus: 'off' | 'connecting' | 'on' | 'lost' | 'error';
  cameraLabel: string | null;
  cameraSize: { width: number; height: number } | null;
  calibration: { name: string; imageWidth: number; imageHeight: number } | null;
  videoFolder: string | null;
  videoFolderWritable: boolean;
  wakeLockSupported: boolean;
  localModel: boolean;
  activePlayers: number;
  /** Các mục host tự xác nhận bằng tay (id → đã kiểm tra). */
  manual: Record<string, boolean>;
}

/** Các mục host tự kiểm tra bằng mắt (app không đo được). */
export const MANUAL_CHECKS: { id: string; label: string; hint: string }[] = [
  { id: 'charging', label: 'iPhone đang sạc, pin trên 50%', hint: 'Quay 2 tiếng tốn pin và làm máy nóng.' },
  { id: 'focus', label: 'iPhone bật chế độ Không làm phiền', hint: 'Cuộc gọi hoặc thông báo có thể ngắt Continuity Camera.' },
  { id: 'view', label: 'Camera thấy trọn 4 góc sân, không bị cột che', hint: 'Đặt cao sau biên cuối, nghiêng xuống.' },
  { id: 'light', label: 'Đủ sáng, không có đèn chiếu thẳng vào camera', hint: 'Ngược sáng làm nhận diện người kém.' },
];

/** Lập danh sách kiểm tra trước buổi chơi từ trạng thái thiết bị. */
export function buildChecklist(input: ChecklistInput): CheckItem[] {
  const items: CheckItem[] = [];

  const cameraOn = input.cameraStatus === 'on';
  items.push({
    id: 'camera',
    label: cameraOn ? `Camera đã kết nối: ${input.cameraLabel ?? 'không rõ tên'}` : 'Kết nối camera',
    status: cameraOn ? (/iphone|continuity/i.test(input.cameraLabel ?? '') ? 'ok' : 'warn') : 'todo',
    hint: cameraOn && !/iphone|continuity/i.test(input.cameraLabel ?? '') ? 'Đang dùng camera không phải iPhone.' : undefined,
  });

  if (!input.calibration) {
    items.push({ id: 'calibration', label: 'Calibrate sân', status: 'todo', hint: 'Màn hình Calibrate: bấm 4 góc sân.' });
  } else {
    const cam = input.cameraSize;
    const ratioDiffers =
      cam !== null &&
      Math.abs(cam.width / cam.height - input.calibration.imageWidth / input.calibration.imageHeight) > 0.01;
    items.push({
      id: 'calibration',
      label: `Calibrate: ${input.calibration.name}`,
      status: ratioDiffers ? 'warn' : 'ok',
      hint: ratioDiffers
        ? 'Tỉ lệ khung hình camera khác lúc calibrate: calibrate lại.'
        : 'Mở màn hình Calibrate, kiểm tra lưới vàng trùng vạch sân.',
    });
  }

  items.push({
    id: 'folder',
    label: input.videoFolder ? `Lưu video vào: ${input.videoFolder}` : 'Chọn thư mục lưu video',
    status: input.videoFolder ? (input.videoFolderWritable ? 'ok' : 'warn') : 'warn',
    hint: !input.videoFolder
      ? 'Chưa chọn thì video được tải về Downloads khi kết thúc ván.'
      : input.videoFolderWritable
        ? undefined
        : 'Cần cấp lại quyền ghi.',
  });

  items.push({
    id: 'model',
    label: input.localModel ? 'Mô hình nhận diện người có sẵn trên máy' : 'Mô hình nhận diện người tải từ internet',
    status: input.localModel ? 'ok' : 'warn',
    hint: input.localModel ? undefined : 'Sân không có mạng thì chạy `npm run model` ở nhà trước.',
  });

  items.push({
    id: 'wakeLock',
    label: 'Giữ màn hình Mac sáng khi đang ghi',
    status: input.wakeLockSupported ? 'ok' : 'warn',
    hint: input.wakeLockSupported ? undefined : 'Trình duyệt không hỗ trợ: tắt chế độ ngủ của Mac.',
  });

  items.push({
    id: 'players',
    label: `Người chơi có mặt: ${input.activePlayers}`,
    status: input.activePlayers >= 4 ? 'ok' : 'todo',
    hint: input.activePlayers >= 4 ? undefined : 'Cần ít nhất 4 người để bắt đầu ván.',
  });

  for (const check of MANUAL_CHECKS) {
    items.push({ ...check, status: input.manual[check.id] ? 'ok' : 'todo' });
  }
  return items;
}

/** Sẵn sàng khi không còn mục "todo" (mục "warn" chỉ là cảnh báo). */
export function isReady(items: CheckItem[]): boolean {
  return items.every((item) => item.status !== 'todo');
}
