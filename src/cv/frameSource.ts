import type { PositionFrame } from '../core/serveFormation';
import type { Team } from '../core/types';

/**
 * Nguồn khung hình vị trí (đã quy về mét). id của mỗi người là màu chấm (blue, red, purple, yellow).
 * t tính bằng ms kể từ khi nguồn bắt đầu.
 */
export interface FrameSource {
  start(onFrame: (frame: PositionFrame) => void): void;
  stop(): void;
  /** Đổi màu hai người cùng đội khi tracker gán ngược (chỉ nguồn camera). */
  swapColors?(team: Team): void;
}
