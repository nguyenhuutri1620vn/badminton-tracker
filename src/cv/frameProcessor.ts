import { courtMapping, type CourtMapping } from '../core/homography';
import type { PositionFrame } from '../core/serveFormation';
import type { CalibrationProfile } from '../data/types';
import { CourtTracker, type CourtDetection } from './courtTracker';
import type { PersonDetection } from './personBoxes';

/** Hai phát hiện gần hơn khoảng này là cùng một người (thấy ở chỗ hai ô nhận diện chồng nhau). */
const SAME_PERSON_M = 0.6;

/**
 * Biến người phát hiện được trong một khung hình thành khung vị trí (mét, theo màu).
 * Điểm chân chuẩn hóa 0..1 nên chỉ cần nhân với kích thước ảnh lúc calibrate:
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

  /** Vị trí trên sân (mét) của từng người phát hiện được; người bị thấy hai lần chỉ giữ lần tin cậy hơn. */
  toCourt(people: PersonDetection[]): CourtDetection[] {
    const { imageWidth: w, imageHeight: h } = this.calibration;
    const detections: CourtDetection[] = [];
    for (const person of people) {
      const [x, y] = this.mapping.toCourt([person.foot[0] * w, person.foot[1] * h]);
      detections.push({ x, y, handRaised: person.handRaised, confidence: person.confidence });
    }
    return dedupe(detections);
  }

  process(t: number, people: PersonDetection[]): PositionFrame {
    return { t, players: this.tracker.update(t, this.toCourt(people)) };
  }
}

function dedupe(detections: CourtDetection[]): CourtDetection[] {
  const kept: CourtDetection[] = [];
  for (const d of [...detections].sort((a, b) => b.confidence - a.confidence)) {
    if (kept.every((k) => Math.hypot(k.x - d.x, k.y - d.y) >= SAME_PERSON_M)) kept.push(d);
  }
  return kept;
}
