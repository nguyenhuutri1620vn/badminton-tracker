import { courtMapping } from '../../core/homography';
import type { PlayerSample } from '../../core/serveFormation';
import type { CalibrationProfile } from '../../data/types';
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

/** Từ vị trí mét (như giả lập) dựng lại người mà bộ phát hiện sẽ thấy; extras là người đứng ngoài sân. */
export function peopleFromPositions(
  players: PlayerSample[],
  calibration = TEST_CALIBRATION,
  extras: [number, number][] = [],
): PersonDetection[] {
  const mapping = courtMapping(calibration.imageCorners);
  return [...players.map((p) => [p.x, p.y, p.handRaised] as const), ...extras.map(([x, y]) => [x, y, undefined] as const)].map(
    ([x, y, hand]) => {
      const [u, v] = mapping.toImage([x, y]);
      return { foot: [u / calibration.imageWidth, v / calibration.imageHeight], handRaised: hand ?? null, confidence: 0.9 };
    },
  );
}
