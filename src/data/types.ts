import type { MatchEvent, Score, Team } from '../core/types';

/** Màu chấm trên mini map. Xanh + đỏ là đội gần camera, tím + vàng là đội xa. */
export type PlayerColor = 'blue' | 'red' | 'purple' | 'yellow';

export const PLAYER_COLORS: readonly PlayerColor[] = ['blue', 'red', 'purple', 'yellow'];

export const TEAM_OF_COLOR: Record<PlayerColor, Team> = {
  blue: 'near',
  red: 'near',
  purple: 'far',
  yellow: 'far',
};

export interface Player {
  id: string;
  name: string;
  /** Để dành cho cân bằng trình độ (ngoài MVP). */
  skill: number | null;
  joinedAt: number;
  /** Thời điểm về sớm; null khi vẫn còn ở buổi chơi. */
  leftAt: number | null;
}

export interface Session {
  id: string;
  startedAt: number;
  endedAt: number | null;
  players: Player[];
}

/** Ai mang màu nào trong một ván (id người chơi). */
export type Lineup = Record<PlayerColor, string>;

export interface MatchRecord {
  id: string;
  sessionId: string;
  /** Số thứ tự ván trong buổi, bắt đầu từ 1. */
  index: number;
  startedAt: number;
  endedAt: number | null;
  lineup: Lineup;
  /** Toàn bộ sự kiện của engine; tỉ số luôn được tính lại từ đây. */
  events: MatchEvent[];
  finalScore: Score | null;
  winner: Team | null;
  videoFileName: string | null;
  calibrationId: string | null;
}

/** Vị trí một người tại một thời điểm, t tính bằng ms kể từ khi bắt đầu ván. */
export interface PositionSample {
  t: number;
  color: PlayerColor;
  x: number;
  y: number;
}

export interface CalibrationProfile {
  id: string;
  name: string;
  createdAt: number;
  imageWidth: number;
  imageHeight: number;
  /** 4 góc sân đánh đôi trên ảnh (pixel), theo thứ tự: gần-trái, gần-phải, xa-phải, xa-trái (nhìn từ camera). */
  imageCorners: [number, number][];
}
