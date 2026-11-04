import { PLAYER_COLORS, TEAM_OF_COLOR, type Lineup, type MatchRecord, type Player, type Session } from '../data/types';
import type { Team } from '../core/types';

/** Lỗi nghiệp vụ hiển thị trực tiếp cho host. */
export class SessionError extends Error {}

export function createSession(id: string, now: number): Session {
  return { id, startedAt: now, endedAt: null, players: [] };
}

export function endSession(session: Session, now: number): Session {
  return { ...session, endedAt: now };
}

export function activePlayers(session: Session): Player[] {
  return session.players.filter((p) => p.leftAt === null);
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function assertUniqueName(session: Session, name: string, exceptId?: string): void {
  const key = name.toLocaleLowerCase('vi');
  const clash = activePlayers(session).some((p) => p.id !== exceptId && p.name.toLocaleLowerCase('vi') === key);
  if (clash) throw new SessionError(`Đã có người tên "${name}" trong buổi`);
}

/** Thêm người, kể cả người đến muộn giữa buổi. */
export function addPlayer(session: Session, id: string, rawName: string, now: number): Session {
  const name = normalizeName(rawName);
  if (!name) throw new SessionError('Tên không được để trống');
  assertUniqueName(session, name);
  const player: Player = { id, name, skill: null, joinedAt: now, leftAt: null };
  return { ...session, players: [...session.players, player] };
}

function updatePlayer(session: Session, playerId: string, change: (p: Player) => Player): Session {
  if (!session.players.some((p) => p.id === playerId)) throw new SessionError('Không tìm thấy người chơi');
  return { ...session, players: session.players.map((p) => (p.id === playerId ? change(p) : p)) };
}

export function renamePlayer(session: Session, playerId: string, rawName: string): Session {
  const name = normalizeName(rawName);
  if (!name) throw new SessionError('Tên không được để trống');
  assertUniqueName(session, name, playerId);
  return updatePlayer(session, playerId, (p) => ({ ...p, name }));
}

/** Người về sớm: không được chọn vào sân nữa, nhưng vẫn giữ trong lịch sử. */
export function markLeft(session: Session, playerId: string, now: number): Session {
  return updatePlayer(session, playerId, (p) => ({ ...p, leftAt: now }));
}

/** Bấm nhầm "về sớm" thì cho quay lại. */
export function markReturned(session: Session, playerId: string): Session {
  const player = session.players.find((p) => p.id === playerId);
  if (player) assertUniqueName(session, player.name, playerId);
  return updatePlayer(session, playerId, (p) => ({ ...p, leftAt: null }));
}

/** Kiểm tra đội hình trước khi Start. Trả về danh sách lỗi; rỗng là hợp lệ. */
export function validateLineup(session: Session, lineup: Partial<Lineup>): string[] {
  const errors: string[] = [];
  const ids = PLAYER_COLORS.map((color) => lineup[color]);
  if (ids.some((id) => !id)) errors.push('Cần chọn đủ 4 người cho 4 màu');
  const chosen = ids.filter((id): id is string => Boolean(id));
  if (new Set(chosen).size !== chosen.length) errors.push('Mỗi người chỉ được mang một màu');
  for (const id of chosen) {
    const player = session.players.find((p) => p.id === id);
    if (!player) errors.push('Có người không thuộc buổi chơi');
    else if (player.leftAt !== null) errors.push(`${player.name} đã về`);
  }
  return errors;
}

export function playersOfTeam(lineup: Lineup, team: Team): string[] {
  return PLAYER_COLORS.filter((color) => TEAM_OF_COLOR[color] === team).map((color) => lineup[color]);
}

/** Số ván đã chơi của từng người (chỉ ván đã kết thúc), để host tham khảo khi chọn người vào sân. */
export function gamesPlayed(session: Session, matches: MatchRecord[]): Map<string, number> {
  const counts = new Map(session.players.map((p) => [p.id, 0]));
  for (const match of matches) {
    if (match.endedAt === null) continue;
    for (const id of Object.values(match.lineup)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
