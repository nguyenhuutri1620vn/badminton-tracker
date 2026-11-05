import { describe, expect, it } from 'vitest';
import { isBoxCutByTile, personFromBox } from './personBoxes';

describe('khung người', () => {
  const inner = { x: 100, y: 100, w: 300, h: 300 };

  it('điểm chân là giữa đáy khung, đổi về tỉ lệ cả khung hình', () => {
    const person = personFromBox({ x: 50, y: 100, w: 40, h: 120, score: 0.8 }, inner, 1000, 1000);
    expect(person.foot[0]).toBeCloseTo(0.17);
    expect(person.foot[1]).toBeCloseTo(0.32);
    expect(person).toMatchObject({ handRaised: null, confidence: 0.8 });
  });

  it('khung chạm đáy ô (ô chỉ thấy nửa trên người) thì bỏ', () => {
    expect(isBoxCutByTile({ x: 100, y: 200, w: 40, h: 100, score: 0.9 }, inner, 1280, 720)).toBe(true);
  });

  it('khung nằm trọn trong ô thì giữ, kể cả khi đầu chạm mép trên', () => {
    expect(isBoxCutByTile({ x: 100, y: 0, w: 40, h: 200, score: 0.9 }, inner, 1280, 720)).toBe(false);
  });

  it('khung chạm mép trái hoặc phải của ô thì bỏ', () => {
    expect(isBoxCutByTile({ x: 0, y: 50, w: 40, h: 100, score: 0.9 }, inner, 1280, 720)).toBe(true);
    expect(isBoxCutByTile({ x: 260, y: 50, w: 40, h: 100, score: 0.9 }, inner, 1280, 720)).toBe(true);
  });

  it('mép ô trùng mép khung hình thì không bỏ (không còn ô nào thấy trọn người đó)', () => {
    const bottomLeft = { x: 0, y: 420, w: 640, h: 300 };
    expect(isBoxCutByTile({ x: 0, y: 200, w: 40, h: 100, score: 0.9 }, bottomLeft, 1280, 720)).toBe(false);
  });
});
