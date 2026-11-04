import { describe, expect, it } from 'vitest';
import { detectHandRaised, extractPerson, type Landmark } from './poseFeatures';

/** Dựng 33 landmark của một người đứng thẳng, chân tại (x, y). */
function person(x: number, y: number, options: { handUp?: boolean; anklesHidden?: boolean } = {}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x, y: y - 0.1, visibility: 0.1 }));
  const set = (i: number, dx: number, dy: number, visibility = 0.95) => (lm[i] = { x: x + dx, y: y + dy, visibility });
  set(11, -0.01, -0.12); // vai
  set(12, 0.01, -0.12);
  set(23, -0.008, -0.06); // hông
  set(24, 0.008, -0.06);
  set(15, -0.015, options.handUp ? -0.17 : -0.07); // cổ tay
  set(16, 0.015, -0.07);
  const ankleVis = options.anklesHidden ? 0.1 : 0.95;
  set(27, -0.005, 0, ankleVis);
  set(28, 0.005, 0, ankleVis);
  set(29, -0.005, 0.003, ankleVis);
  set(30, 0.005, 0.003, ankleVis);
  return lm;
}

describe('extractPerson', () => {
  it('điểm chạm sân là giữa hai chân', () => {
    const p = extractPerson(person(0.4, 0.8))!;
    expect(p.foot[0]).toBeCloseTo(0.4, 3);
    expect(p.foot[1]).toBeCloseTo(0.8015, 3);
    expect(p.confidence).toBeGreaterThan(0.8);
  });

  it('chân bị che: ước lượng từ hông và vai, độ tin cậy thấp', () => {
    const p = extractPerson(person(0.4, 0.8, { anklesHidden: true }))!;
    expect(Math.abs(p.foot[1] - 0.8)).toBeLessThan(0.01);
    expect(p.confidence).toBeLessThan(0.5);
  });

  it('không thấy chân, hông, vai thì bỏ qua', () => {
    const lm = person(0.4, 0.8).map((p) => ({ ...p, visibility: 0.1 }));
    expect(extractPerson(lm)).toBeNull();
  });
});

describe('detectHandRaised', () => {
  it('cổ tay cao hơn vai là giơ vợt', () => {
    expect(detectHandRaised(person(0.5, 0.5, { handUp: true }))).toBe(true);
    expect(detectHandRaised(person(0.5, 0.5))).toBe(false);
  });

  it('không thấy tay thì null', () => {
    const lm = person(0.5, 0.5).map((p, i) => (i === 15 || i === 16 ? { ...p, visibility: 0.1 } : p));
    expect(detectHandRaised(lm)).toBeNull();
  });
});
