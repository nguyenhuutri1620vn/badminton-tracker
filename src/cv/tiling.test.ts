import { describe, expect, it } from 'vitest';
import { COURT } from '../core/court';
import { courtMapping, type Point } from '../core/homography';
import { DEFAULT_TILING, planTiles, type Tile } from './tiling';

/** Camera trên cao sau biên cuối (cách đặt iPhone khuyến nghị). */
const ELEVATED = {
  imageWidth: 1280,
  imageHeight: 720,
  imageCorners: [
    [170, 690],
    [1110, 690],
    [860, 150],
    [420, 150],
  ] as Point[],
};

/** Camera thấp, gần sân, hai góc gần nằm ngoài khung (video YouTube dùng để thử, đo từ vạch sân). */
const LOW_CLOSE = {
  imageWidth: 1280,
  imageHeight: 720,
  imageCorners: [
    [-109.9, 726.7],
    [1350.0, 760.5],
    [994.2, 430.9],
    [570.6, 436.8],
  ] as Point[],
};

/** Khung chữ nhật của một người đứng tại (x, y) mét, cắt theo ảnh. */
function personBox(calibration: typeof ELEVATED, x: number, y: number) {
  const mapping = courtMapping(calibration.imageCorners);
  const [fx, fy] = mapping.toImage([x, y]);
  const [ax] = mapping.toImage([x - 0.5, y]);
  const [bx] = mapping.toImage([x + 0.5, y]);
  const height = DEFAULT_TILING.personHeightM * Math.abs(bx - ax);
  return {
    left: Math.max(0, fx - 0.25 * height),
    right: Math.min(calibration.imageWidth, fx + 0.25 * height),
    top: Math.max(0, fy - height),
    bottom: Math.min(calibration.imageHeight, fy),
    height,
  };
}

const contains = (t: Tile, b: ReturnType<typeof personBox>) =>
  t.x <= b.left + 1 && t.y <= b.top + 1 && t.x + t.w >= b.right - 1 && t.y + t.h >= b.bottom - 1;

describe.each([
  ['camera trên cao', ELEVATED],
  ['camera thấp, hai góc gần ngoài khung', LOW_CLOSE],
])('chia ô nhận diện (%s)', (_, calibration) => {
  const tiles = planTiles(calibration);

  it('không vượt số ô tối đa và nằm trong ảnh', () => {
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles.length).toBeLessThanOrEqual(DEFAULT_TILING.maxTiles);
    for (const t of tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.w).toBeLessThanOrEqual(calibration.imageWidth);
      expect(t.y + t.h).toBeLessThanOrEqual(calibration.imageHeight);
    }
  });

  it('người đứng ở bất kỳ đâu trên sân đều nằm trọn trong ít nhất một ô', () => {
    for (let x = -0.5; x <= COURT.width + 0.5; x += 0.5) {
      for (let y = -0.5; y <= COURT.length + 0.5; y += 0.5) {
        const box = personBox(calibration, x, y);
        if (box.right <= box.left || box.bottom <= box.top) continue; // ngoài khung hình
        expect(tiles.some((t) => contains(t, box)), `người ở (${x}, ${y})`).toBe(true);
      }
    }
  });

  // Giới hạn số ô buộc phải đánh đổi: ô có thể lớn hơn mức lý tưởng (farZoom) một chút.
  const maxRatio = DEFAULT_TILING.farZoom * 1.35;
  it(`người ở nửa xa chiếm đủ lớn trong ô (ô không quá ${maxRatio} lần chiều cao người)`, () => {
    for (let x = 0; x <= COURT.width; x += 1) {
      for (let y = COURT.netY + 0.5; y <= COURT.length; y += 1) {
        const box = personBox(calibration, x, y);
        const best = Math.min(...tiles.filter((t) => contains(t, box)).map((t) => Math.max(t.w, t.h) / box.height));
        expect(best, `người ở (${x}, ${y})`).toBeLessThan(maxRatio);
      }
    }
  });
});
