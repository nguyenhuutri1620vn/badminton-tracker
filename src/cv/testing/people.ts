import { courtMapping } from '../../core/homography';
import type { PlayerSample } from '../../core/serveFormation';
import type { CalibrationProfile } from '../../data/types';
import { TYPICAL_HEIGHT_RATIO } from '../frameProcessor';
import type { PersonDetection } from '../personBoxes';

/** Calibrate giả lập: camera 1280×720 sau biên cuối, trên cao. */
export const TEST_CALIBRATION: Pick<CalibrationProfile, 'imageWidth' | 'imageHeight' | 'imageCorners'> = {
  imageWidth: 1280,
  imageHeight: 720,
  imageCorners: [
    [170, 690],
    [1110, 690],
    [860, 150],
    [420, 150],
  ],
};

export interface PersonOptions {
  handRaised?: boolean | null;
  confidence?: number;
  /** Chiều cao khung so với người đứng thẳng (khom người thì nhỏ hơn 1). */
  heightScale?: number;
  /** Đáy khung bị cắt tại dòng ảnh này (pixel), như khi băng lưới che chân. */
  cutAtImageY?: number;
}

/** Khung người mà bộ phát hiện sẽ thấy khi một người đứng tại (x, y) mét. */
export function personAt(
  x: number,
  y: number,
  options: PersonOptions = {},
  calibration = TEST_CALIBRATION,
): PersonDetection {
  const mapping = courtMapping(calibration.imageCorners);
  const [u, v] = mapping.toImage([x, y]);
  const [ax, ay] = mapping.toImage([x - 0.5, y]);
  const [bx, by] = mapping.toImage([x + 0.5, y]);
  const height = TYPICAL_HEIGHT_RATIO * Math.hypot(bx - ax, by - ay) * (options.heightScale ?? 1);
  const top = v - height;
  const bottom = options.cutAtImageY === undefined ? v : Math.min(v, options.cutAtImageY);
  return {
    foot: [u / calibration.imageWidth, bottom / calibration.imageHeight],
    top: top / calibration.imageHeight,
    handRaised: options.handRaised ?? null,
    confidence: options.confidence ?? 0.9,
  };
}

/** Từ vị trí mét (như giả lập) dựng lại người mà bộ phát hiện sẽ thấy; extras là người đứng ngoài sân. */
export function peopleFromPositions(
  players: PlayerSample[],
  calibration = TEST_CALIBRATION,
  extras: [number, number][] = [],
): PersonDetection[] {
  return [
    ...players.map((p) => personAt(p.x, p.y, { handRaised: p.handRaised ?? null }, calibration)),
    ...extras.map(([x, y]) => personAt(x, y, {}, calibration)),
  ];
}
