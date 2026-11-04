import { courtMapping } from '../../core/homography';
import type { PlayerSample } from '../../core/serveFormation';
import type { CalibrationProfile } from '../../data/types';
import type { Landmark } from '../poseFeatures';

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

/** Dựng 33 landmark của người đứng tại điểm chân (chuẩn hóa) cho trước. */
export function standingPerson(fx: number, fy: number, handRaised?: boolean): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: fx, y: fy - 0.1, visibility: 0.1 }));
  const set = (i: number, dx: number, dy: number) => (lm[i] = { x: fx + dx, y: fy + dy, visibility: 0.95 });
  set(11, -0.01, -0.12);
  set(12, 0.01, -0.12);
  set(23, -0.008, -0.06);
  set(24, 0.008, -0.06);
  set(15, -0.015, handRaised ? -0.17 : -0.07);
  set(16, 0.015, -0.07);
  set(27, -0.005, 0);
  set(28, 0.005, 0);
  return lm;
}

/** Từ vị trí mét (như giả lập) dựng lại kết quả pose mà camera sẽ thấy. */
export function posesFromPositions(
  players: PlayerSample[],
  calibration = TEST_CALIBRATION,
  extras: [number, number][] = [],
): Landmark[][] {
  const mapping = courtMapping(calibration.imageCorners);
  return [...players.map((p) => [p.x, p.y, p.handRaised] as const), ...extras.map(([x, y]) => [x, y, undefined] as const)].map(
    ([x, y, hand]) => {
      const [u, v] = mapping.toImage([x, y]);
      return standingPerson(u / calibration.imageWidth, v / calibration.imageHeight, hand);
    },
  );
}
