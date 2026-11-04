import type { ServiceCourt, Team } from './types';

/**
 * Hệ tọa độ sân (mét), nhìn từ camera đặt sau biên cuối phía gần:
 * - x: từ biên dọc bên trái camera (0) sang bên phải camera (6.1).
 * - y: từ biên cuối gần camera (0) đến biên cuối xa (13.4). Lưới ở y = 6.7.
 */
export const COURT = {
  width: 6.1,
  length: 13.4,
  netY: 6.7,
  centerX: 3.05,
  /** Vạch giao cầu ngắn cách lưới 1.98 m. */
  shortServiceDistance: 1.98,
  /** Vạch giao cầu dài đánh đôi cách biên cuối 0.76 m. */
  doublesLongServiceDistance: 0.76,
} as const;

export function teamOfPosition(y: number): Team {
  return y < COURT.netY ? 'near' : 'far';
}

export function shortServiceLineY(team: Team): number {
  return team === 'near' ? COURT.netY - COURT.shortServiceDistance : COURT.netY + COURT.shortServiceDistance;
}

export function distanceToNet(y: number): number {
  return Math.abs(y - COURT.netY);
}

/**
 * Ô giao cầu theo góc nhìn người chơi. Đội gần quay mặt cùng hướng camera nên bên phải của họ là x lớn;
 * đội xa quay mặt về camera nên bên phải của họ là x nhỏ.
 */
export function serviceCourtSide(team: Team, x: number): ServiceCourt {
  const onCameraRight = x > COURT.centerX;
  if (team === 'near') return onCameraRight ? 'right' : 'left';
  return onCameraRight ? 'left' : 'right';
}

/** Có đứng trong ô giao cầu đánh đôi (giữa vạch ngắn và vạch dài) của nửa sân mình không, kèm dung sai. */
export function isInServiceBox(team: Team, x: number, y: number, tolerance = 0.3): boolean {
  if (x < -tolerance || x > COURT.width + tolerance) return false;
  const front = shortServiceLineY(team);
  const back = team === 'near' ? COURT.doublesLongServiceDistance : COURT.length - COURT.doublesLongServiceDistance;
  const low = Math.min(front, back) - tolerance;
  const high = Math.max(front, back) + tolerance;
  return y >= low && y <= high;
}

export type Segment = [[number, number], [number, number]];

/** Các vạch sân đánh đôi (mét): biên ngoài, biên dọc đơn, vạch giao cầu ngắn/dài, đường giữa, lưới. */
export function courtLineSegments(): Segment[] {
  const { width: w, length: l, netY, shortServiceDistance: s, doublesLongServiceDistance: d, centerX: c } = COURT;
  const singles = 0.46;
  return [
    [[0, 0], [w, 0]],
    [[w, 0], [w, l]],
    [[w, l], [0, l]],
    [[0, l], [0, 0]],
    [[singles, 0], [singles, l]],
    [[w - singles, 0], [w - singles, l]],
    [[0, netY - s], [w, netY - s]],
    [[0, netY + s], [w, netY + s]],
    [[0, d], [w, d]],
    [[0, l - d], [w, l - d]],
    [[c, 0], [c, netY - s]],
    [[c, netY + s], [c, l]],
    [[0, netY], [w, netY]],
  ];
}
