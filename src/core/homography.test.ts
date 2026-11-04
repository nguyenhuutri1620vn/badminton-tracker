import { describe, expect, it } from 'vitest';
import {
  COURT_CORNERS_M,
  applyHomography,
  courtMapping,
  invertMatrix3,
  solveHomography,
  validateCorners,
  type Point,
} from './homography';

/** Camera giả lập: phép chiếu phối cảnh đã biết từ mét sang pixel (camera sau biên cuối, trên cao). */
const TRUE_H = [120, 18, 600, 3, -40, 980, 0.0004, 0.055, 1];

const project = (p: Point) => applyHomography(TRUE_H, p);

describe('homography', () => {
  it('tìm lại đúng phép chiếu từ 4 góc sân, sai số dưới 1 cm', () => {
    const imageCorners = COURT_CORNERS_M.map(project);
    const mapping = courtMapping(imageCorners);
    for (const p of [
      [3.05, 6.7],
      [0.5, 1.2],
      [5.9, 12.9],
      [2, 9.5],
    ] as Point[]) {
      const [x, y] = mapping.toCourt(project(p));
      expect(Math.hypot(x - p[0], y - p[1])).toBeLessThan(0.01);
    }
  });

  it('chiều ngược lại đưa mét về đúng pixel', () => {
    const mapping = courtMapping(COURT_CORNERS_M.map(project));
    const [u, v] = mapping.toImage([3.05, 6.7]);
    const [eu, ev] = project([3.05, 6.7]);
    expect(Math.hypot(u - eu, v - ev)).toBeLessThan(0.01);
  });

  it('ma trận nghịch đảo nhân lại ra đơn vị', () => {
    const h = solveHomography(COURT_CORNERS_M, COURT_CORNERS_M.map(project));
    const back = applyHomography(invertMatrix3(h), applyHomography(h, [1, 2]));
    expect(back[0]).toBeCloseTo(1, 6);
    expect(back[1]).toBeCloseTo(2, 6);
  });

  it('báo lỗi khi các điểm thẳng hàng', () => {
    const line: Point[] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    expect(() => solveHomography(line, COURT_CORNERS_M)).toThrow();
  });
});

describe('validateCorners', () => {
  const good = COURT_CORNERS_M.map(project);

  it('chấp nhận tứ giác lồi', () => {
    expect(validateCorners(good)).toBeNull();
  });

  it('báo lỗi khi bấm sai thứ tự (hình chéo nhau) hoặc thiếu điểm', () => {
    expect(validateCorners([good[0]!, good[2]!, good[1]!, good[3]!])).toContain('thứ tự');
    expect(validateCorners(good.slice(0, 3))).toBe('Cần bấm đủ 4 góc sân');
  });
});
