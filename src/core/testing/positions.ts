import type { PlayerSample } from '../serveFormation';
import type { CourtPlayers, ServiceCourt, Team } from '../types';

/** Mặc định: blue và purple là người đứng trước (người phát hoặc người nhận). */
function defaultCourtPlayers(court: ServiceCourt): Record<Team, CourtPlayers> {
  const place = (front: string, back: string): CourtPlayers =>
    court === 'right' ? { right: front, left: back } : { right: back, left: front };
  return { near: place('blue', 'red'), far: place('purple', 'yellow') };
}

/**
 * Vị trí 4 người ở đội hình phát cầu đúng luật. Người nhận giơ vợt nếu withHands = true.
 * courtPlayers cho biết ai đứng ô phải, ai đứng ô trái của mỗi đội.
 */
export function formation(
  servingTeam: Team,
  court: ServiceCourt,
  withHands = true,
  courtPlayers: Record<Team, CourtPlayers> = defaultCourtPlayers(court),
): PlayerSample[] {
  // Ô phải của đội gần là x lớn, ô phải của đội xa là x nhỏ (nhìn từ camera).
  const nearX = (side: ServiceCourt) => (side === 'right' ? 4.5 : 1.6);
  const farX = (side: ServiceCourt) => (side === 'right' ? 1.6 : 4.5);
  const other: ServiceCourt = court === 'right' ? 'left' : 'right';
  const nearIsServer = servingTeam === 'near';
  const hand = (isServer: boolean) => (withHands ? !isServer : undefined);
  return [
    { id: courtPlayers.near[court], x: nearX(court), y: nearIsServer ? 4.5 : 4.3, handRaised: hand(nearIsServer) },
    // Đồng đội đứng phía sau, lệch về ô còn lại.
    { id: courtPlayers.near[other], x: (nearX(other) + 3.05) / 2, y: 2.0 },
    { id: courtPlayers.far[court], x: farX(court), y: nearIsServer ? 9.1 : 8.9, handRaised: hand(!nearIsServer) },
    { id: courtPlayers.far[other], x: (farX(other) + 3.05) / 2, y: 11.4 },
  ];
}

/** 4 người đang chạy trong pha đánh. */
export function moving(t: number): PlayerSample[] {
  const offset = Math.sin(t / 200) * 1.5;
  return [
    { id: 'blue', x: 3 + offset, y: 3 },
    { id: 'red', x: 2 - offset, y: 1.5 },
    { id: 'purple', x: 3 - offset, y: 10 },
    { id: 'yellow', x: 4 + offset, y: 11 },
  ];
}
