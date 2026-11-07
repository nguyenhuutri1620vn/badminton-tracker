import { COURT } from '../core/court';
import { courtMapping, type CourtMapping, type Point } from '../core/homography';
import type { PositionFrame } from '../core/serveFormation';
import type { CalibrationProfile } from '../data/types';
import { CourtTracker, type CourtDetection } from './courtTracker';
import type { PersonDetection } from './personBoxes';

/** Hai phát hiện gần hơn khoảng này là cùng một người (thấy ở chỗ hai ô nhận diện chồng nhau). */
const SAME_PERSON_M = 0.6;

/**
 * Chiều cao khung người chia cho số pixel của 1 m theo chiều ngang tại chân. Đo trên video thật (camera sau biên
 * cuối, trên cao): người đứng ở cả hai nửa sân đều trong khoảng 1,45–1,95, trung vị 1,65.
 */
export const TYPICAL_HEIGHT_RATIO = 1.65;

/**
 * Ở nửa xa, băng lưới cắt ngang người đứng sau lưới: bộ phát hiện có lúc chỉ lấy phần trên lưới, đáy khung khi đó
 * là băng lưới chứ không phải chân (đo được tỉ lệ 1,24–1,46, chân bị đẩy ra xa 1–2 m). Thấp hơn mức này là bị cắt.
 */
const CUT_HEIGHT_RATIO = 1.45;
/** Băng lưới trên ảnh có thể rơi hơi quá biên cuối xa (theo chiều cao camera). */
const CUT_ZONE_BEYOND_M = 0.5;

/** Khung người theo pixel của ảnh lúc calibrate. */
interface ImageBox {
  cx: number;
  top: number;
  bottom: number;
  confidence: number;
  handRaised: boolean | null;
}

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

  /**
   * Vị trí trên sân (mét) của từng người phát hiện được; người bị thấy hai lần chỉ giữ lần tin cậy hơn.
   * Khung bị băng lưới cắt bị bỏ: thường đã có khung đủ của cùng người ở ô khác, không có thì tracker giữ vị trí cũ.
   * Đo trên video thật: bỏ đi giảm số khung thấy thừa người ở nửa xa từ 43% xuống 26%; ước lượng chân từ đỉnh đầu
   * thì lệch theo dáng và chiều cao từng người, làm vị trí rung hơn.
   */
  toCourt(people: PersonDetection[]): CourtDetection[] {
    const { imageWidth: w, imageHeight: h } = this.calibration;
    const boxes = people
      .map((p) => ({
        cx: p.foot[0] * w,
        top: p.top * h,
        bottom: p.foot[1] * h,
        confidence: p.confidence,
        handRaised: p.handRaised,
      }))
      .filter((box) => !this.isCutByNet(box));
    return dedupe(
      boxes.map((box) => {
        const [x, y] = this.mapping.toCourt([box.cx, box.bottom]);
        return { x, y, handRaised: box.handRaised, confidence: box.confidence };
      }),
    );
  }

  /** Khung vị trí theo màu; mỗi người kèm số mét của 1 pixel tại chỗ đứng để bộ phát hiện nới ngưỡng ở xa. */
  process(t: number, people: PersonDetection[]): PositionFrame {
    const players = this.tracker.update(t, this.toCourt(people));
    return { t, players: players.map((p) => ({ ...p, metersPerPixel: this.metersPerPixel([p.x, p.y]) })) };
  }

  /** Số mét trên sân ứng với 1 pixel theo chiều dọc ảnh (chiều kém nhất với camera sau biên cuối). */
  private metersPerPixel(point: Point): number {
    const [u, v] = this.mapping.toImage(point);
    const [x, y] = this.mapping.toCourt([u, v + 1]);
    return Math.hypot(x - point[0], y - point[1]);
  }

  /**
   * Khung thấp bất thường với đáy nằm giữa lưới và biên cuối xa (băng lưới trên ảnh rơi vào khoảng này).
   * Người đứng sau biên cuối (khán giả, người chờ sát tường) thì không xét: họ đã bị vùng nhận người loại.
   */
  private isCutByNet(box: ImageBox): boolean {
    const foot = this.mapping.toCourt([box.cx, box.bottom]);
    if (foot[1] <= COURT.netY || foot[1] > COURT.length + CUT_ZONE_BEYOND_M) return false;
    return box.bottom - box.top < CUT_HEIGHT_RATIO * this.pixelsPerMeter(foot);
  }

  /** Số pixel của 1 m theo chiều ngang tại một điểm trên sân. */
  private pixelsPerMeter([x, y]: Point): number {
    const [ax, ay] = this.mapping.toImage([x - 0.5, y]);
    const [bx, by] = this.mapping.toImage([x + 0.5, y]);
    return Math.hypot(bx - ax, by - ay);
  }
}

function dedupe(detections: CourtDetection[]): CourtDetection[] {
  const kept: CourtDetection[] = [];
  for (const d of [...detections].sort((a, b) => b.confidence - a.confidence)) {
    if (kept.every((k) => Math.hypot(k.x - d.x, k.y - d.y) >= SAME_PERSON_M)) kept.push(d);
  }
  return kept;
}
