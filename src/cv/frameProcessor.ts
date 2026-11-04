import { courtMapping, type CourtMapping } from '../core/homography';
import type { PositionFrame } from '../core/serveFormation';
import type { CalibrationProfile } from '../data/types';
import { CourtTracker, type CourtDetection } from './courtTracker';
import { extractPerson, type Landmark } from './poseFeatures';

/**
 * Biến kết quả pose của một khung hình thành khung vị trí (mét, theo màu).
 * Landmark chuẩn hóa 0..1 nên chỉ cần nhân với kích thước ảnh lúc calibrate:
 * đổi độ phân giải camera (cùng tỉ lệ khung) không làm sai tọa độ.
 */
export class FrameProcessor {
  private readonly mapping: CourtMapping;
  readonly tracker: CourtTracker;

  constructor(
    private readonly calibration: Pick<CalibrationProfile, 'imageWidth' | 'imageHeight' | 'imageCorners'>,
    tracker = new CourtTracker(),
  ) {
    this.mapping = courtMapping(calibration.imageCorners);
    this.tracker = tracker;
  }

  /** Vị trí trên sân (mét) của từng người phát hiện được. */
  toCourt(poses: Landmark[][]): CourtDetection[] {
    const { imageWidth: w, imageHeight: h } = this.calibration;
    const detections: CourtDetection[] = [];
    for (const landmarks of poses) {
      const person = extractPerson(landmarks);
      if (!person) continue;
      const [x, y] = this.mapping.toCourt([person.foot[0] * w, person.foot[1] * h]);
      detections.push({ x, y, handRaised: person.handRaised, confidence: person.confidence });
    }
    return detections;
  }

  process(t: number, poses: Landmark[][]): PositionFrame {
    return { t, players: this.tracker.update(t, this.toCourt(poses)) };
  }
}
