import { COURT } from '../core/court';
import { courtMapping, type CourtMapping, type Point } from '../core/homography';
import type { CalibrationProfile } from '../data/types';
import type { Landmark } from './poseFeatures';

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
  /** Mỗi ô tốn khoảng 30 ms nhận diện; nhiều ô quá thì không đủ khung hình mỗi giây. */
  maxTiles: number;
}

export const DEFAULT_TILING: TilingOptions = { personHeightM: 1.8, marginM: 1, overlap: 0.25, maxTiles: 6 };

/** Ô của nửa sân gần nhỏ nhất bằng 1,3 lần người đứng sát camera, để người đó nằm trọn trong ô. */
const NEAR_FIT = 1.3;
/** Ô bằng 2,4 lần người đứng xa nhất trong nửa sân: lớn hơn thì người xa quá nhỏ với mô hình. */
const FAR_ZOOM = 2.4;

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
    size: Math.max(FAR_ZOOM * personFar, NEAR_FIT * personNear),
    personWidth: 0.5 * personNear,
  };
}

function countAlong(length: number, size: number, overlap: number): number {
  if (length <= size) return 1;
  return Math.ceil((length - size) / (size - overlap)) + 1;
}

function tilesOf(band: Band, overlap: number): Tile[] {
  const bw = band.right - band.left;
  const bh = band.bottom - band.top;
  const w = Math.min(band.size, bw);
  const h = Math.min(band.size, bh);
  const minOverlap = (size: number) => Math.min(Math.max(overlap * size, band.personWidth), 0.9 * size);
  const nx = countAlong(bw, w, minOverlap(w));
  const ny = countAlong(bh, h, minOverlap(h));
  const tiles: Tile[] = [];
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      // Chia đều để ô cuối chạm đúng mép vùng phủ.
      const x = nx === 1 ? band.left : band.left + ((bw - w) * i) / (nx - 1);
      const y = ny === 1 ? band.top : band.top + ((bh - h) * j) / (ny - 1);
      tiles.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    }
  }
  return tiles;
}

/**
 * Chia khung hình thành các ô để nhận diện người, dựa trên calibrate.
 * MediaPipe thu cả khung về khoảng 256 px trước khi tìm người, nên người ở nửa sân xa (cao ~100 px trên ảnh 720p)
 * gần như không được nhận ra. Mỗi nửa sân được phủ bằng các ô đủ nhỏ để người xa nhất vẫn đủ lớn,
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

  const count = (b: Band) => tilesOf(b, options.overlap).length;
  for (let guard = 0; bands.reduce((sum, b) => sum + count(b), 0) > options.maxTiles && guard < 50; guard += 1) {
    // Phóng to nửa đang có nhiều ô hơn (bằng nhau thì nửa gần, nơi người vốn đã lớn),
    // để không nửa nào bị dồn về một ô quá lớn so với người trong đó.
    const band = bands.reduce((a, b) => (count(b) >= count(a) ? b : a));
    band.size *= 1.15;
  }
  return bands.flatMap((b) => tilesOf(b, options.overlap));
}

/** Đổi landmark chuẩn hóa theo ô về chuẩn hóa theo cả khung hình. */
export function tileToFrameLandmarks(landmarks: Landmark[], tile: Tile, width: number, height: number): Landmark[] {
  return landmarks.map((p) => ({ ...p, x: (tile.x + p.x * tile.w) / width, y: (tile.y + p.y * tile.h) / height }));
}

/** Landmark thân và chân (vai, hông, gối, cổ chân, gót, mũi chân): tay vươn ra ngoài ô không tính là bị cắt. */
const BODY = [11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
/** Landmark bàn chân. */
const FEET = [27, 28, 29, 30, 31, 32];
const EDGE = 0.01;

/**
 * Người bị mép ô cắt ngang (mép đó không phải mép khung hình): ô chỉ thấy một phần người nên vị trí chân
 * bị đoán từ hông và lệch cả mét. Bỏ đi được vì `planTiles` bảo đảm người đó nằm trọn trong một ô khác.
 * MediaPipe vẫn đoán vị trí các điểm nằm ngoài ô (tọa độ < 0 hoặc > 1), nên dựa vào đó để biết người bị cắt.
 */
export function isCutByTile(landmarks: Landmark[], tile: Tile, width: number, height: number): boolean {
  const body = BODY.map((i) => landmarks[i]).filter((p): p is Landmark => p !== undefined);
  const feet = FEET.map((i) => landmarks[i]).filter((p): p is Landmark => p !== undefined);
  const cutLeft = tile.x > 0.5 && body.some((p) => p.x < EDGE);
  const cutRight = tile.x + tile.w < width - 0.5 && body.some((p) => p.x > 1 - EDGE);
  const cutBottom = tile.y + tile.h < height - 0.5 && feet.some((p) => p.y > 1 - EDGE);
  return cutLeft || cutRight || cutBottom;
}
