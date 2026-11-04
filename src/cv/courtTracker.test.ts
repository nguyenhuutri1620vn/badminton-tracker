import { describe, expect, it } from 'vitest';
import { CourtTracker, type CourtDetection } from './courtTracker';

const det = (x: number, y: number, handRaised: boolean | null = null): CourtDetection => ({ x, y, handRaised, confidence: 0.9 });

const byColor = (samples: { id: string; x: number; y: number }[]) =>
  Object.fromEntries(samples.map((s) => [s.id, [Number(s.x.toFixed(2)), Number(s.y.toFixed(2))]]));

describe('CourtTracker', () => {
  it('khởi tạo: xanh/đỏ ở nửa gần, tím/vàng ở nửa xa, người bên trái nhận màu đầu', () => {
    const tracker = new CourtTracker();
    const out = tracker.update(0, [det(4.5, 4.5), det(1.5, 2), det(1.6, 9), det(3, 11.5)]);
    expect(byColor(out)).toEqual({ blue: [1.5, 2], red: [4.5, 4.5], purple: [1.6, 9], yellow: [3, 11.5] });
  });

  it('giữ đúng màu khi người chơi di chuyển, kể cả thứ tự phát hiện bị đảo', () => {
    const tracker = new CourtTracker();
    tracker.update(0, [det(1.5, 2), det(4.5, 4.5), det(1.6, 9), det(3, 11.5)]);
    let t = 0;
    for (let i = 1; i <= 15; i += 1) {
      t += 66;
      tracker.update(t, [det(3, 11.5 - i * 0.05), det(4.5 - i * 0.1, 4.5), det(1.6, 9 + i * 0.05), det(1.5 + i * 0.1, 2)]);
    }
    const out = byColor(tracker.update(t + 66, [det(3.1, 10.7), det(3.0, 4.5), det(1.6, 9.8), det(3.1, 2)]));
    expect(out.blue).toEqual([3.1, 2]);
    expect(out.red).toEqual([3, 4.5]);
    expect(out.purple).toEqual([1.6, 9.8]);
    expect(out.yellow).toEqual([3.1, 10.7]);
  });

  it('người bị che ngắn vẫn giữ vị trí cũ, che lâu thì biến mất', () => {
    const tracker = new CourtTracker();
    tracker.update(0, [det(1.5, 2), det(4.5, 4.5), det(1.6, 9), det(3, 11.5)]);
    const short = tracker.update(1000, [det(1.5, 2), det(4.5, 4.5), det(1.6, 9)]);
    expect(short.map((s) => s.id)).toContain('yellow');
    const long = tracker.update(2000, [det(1.5, 2), det(4.5, 4.5), det(1.6, 9)]);
    expect(long.map((s) => s.id)).not.toContain('yellow');
  });

  it('bỏ qua người đứng ngoài sân (người chờ, khán giả)', () => {
    const tracker = new CourtTracker();
    const out = tracker.update(0, [det(-3, 3), det(1.5, 2), det(4.5, 4.5), det(9, 10), det(1.6, 9), det(3, 11.5)]);
    expect(out).toHaveLength(4);
    expect(out.every((s) => s.x >= 0 && s.x <= 6.1)).toBe(true);
  });

  it('người lạ chạy ngang qua nửa sân không cướp màu của người đang theo dõi', () => {
    const tracker = new CourtTracker();
    tracker.update(0, [det(1.5, 2), det(4.5, 4.5), det(1.6, 9), det(3, 11.5)]);
    const out = byColor(tracker.update(66, [det(1.5, 2), det(4.5, 4.5), det(3, 1), det(1.6, 9), det(3, 11.5)]));
    expect(out.blue).toEqual([1.5, 2]);
    expect(out.red).toEqual([4.5, 4.5]);
  });

  it('host đổi màu hai người cùng đội', () => {
    const tracker = new CourtTracker();
    tracker.update(0, [det(1.5, 2), det(4.5, 4.5), det(1.6, 9), det(3, 11.5)]);
    tracker.swap('near');
    const out = byColor(tracker.update(66, [det(1.5, 2), det(4.5, 4.5), det(1.6, 9), det(3, 11.5)]));
    expect(out.blue).toEqual([4.5, 4.5]);
    expect(out.red).toEqual([1.5, 2]);
  });

  it('truyền tín hiệu tay sang mẫu vị trí', () => {
    const tracker = new CourtTracker();
    const out = tracker.update(0, [det(1.5, 2, true), det(4.5, 4.5, false), det(1.6, 9), det(3, 11.5)]);
    expect(out.find((s) => s.id === 'blue')?.handRaised).toBe(true);
    expect(out.find((s) => s.id === 'purple')?.handRaised).toBeUndefined();
  });
});
