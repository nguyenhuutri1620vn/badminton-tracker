import { COURT } from '../core/court';
import { courtMapping, type CourtMapping, type Point } from '../core/homography';
import type { CalibrationProfile } from '../data/types';

/** Một ô cắt từ khung hình, tính theo pixel của ảnh lúc calibrate. */
export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TilingOptions {
  /** Chiều cao người dùng để ước lượng kích thước người trên ảnh. */
  personHeightM: number;
  /** Phần ngoài biên cũng cần nhìn (người đứng sát biên, lùi sau biên cuối). */
  marginM: number;
  /** Tỉ lệ chồng lên nhau giữa hai ô kề nhau, để người đứng ở mép ô vẫn nằm trọn trong ô bên cạnh. */
  overlap: number;
  /** Mỗi ô tốn khoảng 30–50 ms nhận diện; nhiều ô quá thì không đủ khung hình mỗi giây. */
  maxTiles: number;
  /** Cạnh ô tối thiểu so với người đứng gần camera nhất trong nửa sân, để người đó nằm trọn trong ô. */
  nearFit: number;
  /** Cạnh ô so với người đứng xa nhất trong nửa sân: lớn hơn thì người xa quá nhỏ với mô hình. */
  farZoom: number;
}

/**
 * Cho bộ phát hiện khung người EfficientDet-Lite2 (ảnh vào 448 px): nhận được người cao khoảng 30 px trên ảnh
 * vào, nên ô có thể lớn gấp 6 lần người xa nhất. Đo trên video thật: 2 ô (nửa xa, nửa gần) thấy đủ 4 người
 * ở 73% khung, so với 52% khi chạy cả khung.
 */
export const DEFAULT_TILING: TilingOptions = {
  personHeightM: 1.8,
  marginM: 1,
  overlap: 0.25,
  maxTiles: 3,
  nearFit: 1.3,
  farZoom: 6,
};

interface Band {
  /** Vùng cần phủ (pixel). */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Cạnh ô. */
  size: number;
  /** Bề ngang người lớn nhất trong nửa sân: hai ô kề nhau phải chồng ít nhất chừng này. */
  personWidth: number;
}

/** Số điểm lấy mẫu dọc mỗi mép nửa sân để đo kích thước người (camera lệch thì hai bên khác nhau). */
const SAMPLES = 9;

/** Chiều cao (pixel) của người đứng tại (x, y) mét, đo theo tỉ lệ ngang tại chỗ đó. */
function personHeightAt(mapping: CourtMapping, x: number, y: number, personHeightM: number): number {
  const [ax, ay] = mapping.toImage([x - 0.5, y]);
  const [bx, by] = mapping.toImage([x + 0.5, y]);
  return personHeightM * Math.hypot(bx - ax, by - ay);
}

function planBand(
  mapping: CourtMapping,
  nearY: number,
  farY: number,
  width: number,
  height: number,
  options: TilingOptions,
): Band | null {
  const m = options.marginM;
  const points: { foot: Point; person: number; y: number }[] = [];
  for (const y of [nearY, farY]) {
    for (let i = 0; i < SAMPLES; i += 1) {
      const x = -m + ((COURT.width + 2 * m) * i) / (SAMPLES - 1);
      points.push({ foot: mapping.toImage([x, y]), person: personHeightAt(mapping, x, y, options.personHeightM), y });
    }
  }
  // Vùng phủ: chân người trong nửa sân, cộng phần thân phía trên chân và nửa bề ngang người hai bên.
  const left = Math.max(0, Math.min(...points.map((p) => p.foot[0] - 0.25 * p.person)));
  const right = Math.min(width, Math.max(...points.map((p) => p.foot[0] + 0.25 * p.person)));
  const top = Math.max(0, Math.min(...points.map((p) => p.foot[1] - p.person)));
  const bottom = Math.min(height, Math.max(...points.map((p) => p.foot[1] + 0.05 * p.person)));
  if (right - left < 1 || bottom - top < 1) return null;
  const personNear = Math.max(...points.filter((p) => p.y === nearY).map((p) => p.person));
  const personFar = Math.min(...points.filter((p) => p.y === farY).map((p) => p.person));
  return {
    left,
    top,
    right,
    bottom,
    size: Math.max(options.farZoom * personFar, options.nearFit * personNear),
    personWidth: 0.5 * personNear,
  };
}

function countAlong(length: number, size: number, overlap: number): number {
  if (length <= size) return 1;
  return Math.ceil((length - size) / (size - overlap)) + 1;
}

/**
 * Bộ phát hiện kéo giãn ảnh vào thành hình vuông (không giữ tỉ lệ): ô dẹt 2,65:1 làm người bị bóp còn 1/3 bề ngang
 * và không được nhận ra nữa, trong khi cả khung 16:9 vẫn nhận tốt. Ô không được dẹt hơn tỉ lệ này.
 */
const MAX_ASPECT = 16 / 9;

function tilesOf(band: Band, overlap: number, frameWidth: number, frameHeight: number): Tile[] {
  const bw = band.right - band.left;
  const bh = band.bottom - band.top;
  let w = Math.min(band.size, bw);
  let h = Math.min(band.size, bh);
  // Ô dẹt thì mở rộng chiều còn lại (lấn ra ngoài vùng phủ, vẫn trong khung hình), không được thì thu hẹp.
  h = Math.min(Math.max(h, w / MAX_ASPECT), frameHeight);
  w = Math.min(Math.max(w, h / MAX_ASPECT), frameWidth, h * MAX_ASPECT);
  const minOverlap = (size: number) => Math.min(Math.max(overlap * size, band.personWidth), 0.9 * size);
  const nx = countAlong(bw, w, minOverlap(w));
  const ny = countAlong(bh, h, minOverlap(h));
  const place = (start: number, length: number, size: number, n: number, i: number, frame: number) => {
    // Chia đều để ô cuối chạm đúng mép vùng phủ; ô lớn hơn vùng phủ thì đặt giữa vùng phủ.
    const pos = n === 1 ? start + (length - size) / 2 : start + ((length - size) * i) / (n - 1);
    return Math.round(Math.min(Math.max(pos, 0), frame - size));
  };
  const tiles: Tile[] = [];
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      tiles.push({
        x: place(band.left, bw, w, nx, i, frameWidth),
        y: place(band.top, bh, h, ny, j, frameHeight),
        w: Math.round(w),
        h: Math.round(h),
      });
    }
  }
  return tiles;
}

/**
 * Chia khung hình thành các ô để nhận diện người, dựa trên calibrate.
 * Bộ phát hiện thu cả khung về kích thước ảnh vào của mô hình trước khi tìm người, nên người ở nửa sân xa
 * (cao 45–100 px trên ảnh 720p) dễ bị bỏ sót. Mỗi nửa sân được phủ bằng các ô đủ nhỏ để người xa nhất vẫn đủ lớn,
 * nhưng đủ lớn để người đứng gần camera nằm trọn trong một ô.
 * Quá nhiều ô thì phóng to ô của nửa đang có nhiều ô hơn cho đến khi không vượt maxTiles.
 */
export function planTiles(
  calibration: Pick<CalibrationProfile, 'imageWidth' | 'imageHeight' | 'imageCorners'>,
  options: TilingOptions = DEFAULT_TILING,
): Tile[] {
  const { imageWidth: width, imageHeight: height } = calibration;
  const mapping = courtMapping(calibration.imageCorners);
  const m = options.marginM;
  // Nửa xa trước: thứ tự ô không quan trọng, nhưng giữ cố định cho dễ kiểm tra.
  const bands = [
    planBand(mapping, COURT.netY, COURT.length + m, width, height, options),
    planBand(mapping, -m, COURT.netY, width, height, options),
  ].filter((b): b is Band => b !== null);

  const count = (b: Band) => tilesOf(b, options.overlap, width, height).length;
  for (let guard = 0; bands.reduce((sum, b) => sum + count(b), 0) > options.maxTiles && guard < 50; guard += 1) {
    // Phóng to nửa đang có nhiều ô hơn (bằng nhau thì nửa gần, nơi người vốn đã lớn),
    // để không nửa nào bị dồn về một ô quá lớn so với người trong đó.
    const band = bands.reduce((a, b) => (count(b) >= count(a) ? b : a));
    band.size *= 1.15;
  }
  return bands.flatMap((b) => tilesOf(b, options.overlap, width, height));
}
