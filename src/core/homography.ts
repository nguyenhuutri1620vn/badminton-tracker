import { COURT } from './court';

export type Point = [number, number];

/** Ma trận 3×3 theo hàng: [h11, h12, h13, h21, h22, h23, h31, h32, h33]. */
export type Matrix3 = number[];

/** Giải hệ tuyến tính Ax = b bằng khử Gauss có chọn phần tử trụ. */
function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) throw new Error('Các điểm calibrate thẳng hàng hoặc trùng nhau');
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row]![col]! / m[col]![col]!;
      for (let k = col; k <= n; k += 1) m[row]![k]! -= factor * m[col]![k]!;
    }
  }
  return m.map((row, i) => row[n]! / row[i]!);
}

/** Homography biến 4 điểm src thành 4 điểm dst (DLT, h33 = 1). */
export function solveHomography(src: Point[], dst: Point[]): Matrix3 {
  if (src.length !== 4 || dst.length !== 4) throw new Error('Cần đúng 4 cặp điểm');
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i]!;
    const [u, v] = dst[i]!;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solveLinear(a, b), 1];
}

export function applyHomography(h: Matrix3, [x, y]: Point): Point {
  const w = h[6]! * x + h[7]! * y + h[8]!;
  return [(h[0]! * x + h[1]! * y + h[2]!) / w, (h[3]! * x + h[4]! * y + h[5]!) / w];
}

export function invertMatrix3(m: Matrix3): Matrix3 {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) throw new Error('Ma trận không khả nghịch');
  return [
    (e * i - f * h) / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    (f * g - d * i) / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    (d * h - e * g) / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
}

/**
 * 4 góc sân đánh đôi (mét) theo thứ tự host bấm trên ảnh:
 * gần-trái, gần-phải, xa-phải, xa-trái (nhìn từ camera).
 */
export const COURT_CORNERS_M: Point[] = [
  [0, 0],
  [COURT.width, 0],
  [COURT.width, COURT.length],
  [0, COURT.length],
];

export const CORNER_LABELS = ['Góc gần bên trái', 'Góc gần bên phải', 'Góc xa bên phải', 'Góc xa bên trái'];

/** Chuyển đổi hai chiều giữa pixel ảnh và mét trên sân. */
export interface CourtMapping {
  toCourt(point: Point): Point;
  toImage(point: Point): Point;
}

export function courtMapping(imageCorners: Point[]): CourtMapping {
  const imageToCourt = solveHomography(imageCorners, COURT_CORNERS_M);
  const courtToImage = invertMatrix3(imageToCourt);
  return {
    toCourt: (p) => applyHomography(imageToCourt, p),
    toImage: (p) => applyHomography(courtToImage, p),
  };
}

/**
 * Kiểm tra 4 góc có tạo thành tứ giác lồi đúng chiều không (bấm sai thứ tự sẽ tạo hình chéo nhau).
 * Trả về thông báo lỗi hoặc null.
 */
export function validateCorners(corners: Point[]): string | null {
  if (corners.length !== 4) return 'Cần bấm đủ 4 góc sân';
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const signs = corners.map((p, i) => Math.sign(cross(p, corners[(i + 1) % 4]!, corners[(i + 2) % 4]!)));
  if (signs.some((s) => s === 0) || !signs.every((s) => s === signs[0])) {
    return 'Các góc không tạo thành hình tứ giác: kiểm tra lại thứ tự bấm (gần-trái, gần-phải, xa-phải, xa-trái)';
  }
  return null;
}
