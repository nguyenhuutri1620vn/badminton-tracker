import { TEAM_OF_COLOR, type MatchRecord, type PositionSample, type Session } from './types';

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

function playerName(session: Session, id: string): string {
  return session.players.find((p) => p.id === id)?.name ?? id;
}

/** Tên hai người của một đội, theo thứ tự màu. */
export function teamNames(session: Session, match: MatchRecord, team: 'near' | 'far'): string[] {
  return (Object.keys(match.lineup) as (keyof MatchRecord['lineup'])[])
    .filter((color) => TEAM_OF_COLOR[color] === team)
    .map((color) => playerName(session, match.lineup[color]));
}

export function matchesToCsv(session: Session, matches: MatchRecord[]): string {
  const rows = matches.map((m) => [
    m.index,
    new Date(m.startedAt).toISOString(),
    m.endedAt === null ? null : new Date(m.endedAt).toISOString(),
    teamNames(session, m, 'near').join(' + '),
    teamNames(session, m, 'far').join(' + '),
    m.finalScore?.near ?? null,
    m.finalScore?.far ?? null,
    m.winner === null ? null : teamNames(session, m, m.winner).join(' + '),
    m.videoFileName,
  ]);
  return toCsv(
    ['van', 'bat_dau', 'ket_thuc', 'doi_gan', 'doi_xa', 'diem_doi_gan', 'diem_doi_xa', 'doi_thang', 'video'],
    rows,
  );
}

export function positionsToCsv(session: Session, match: MatchRecord, samples: PositionSample[]): string {
  const rows = samples.map((s) => [
    (s.t / 1000).toFixed(2),
    playerName(session, match.lineup[s.color]),
    s.color,
    s.x.toFixed(3),
    s.y.toFixed(3),
  ]);
  return toCsv(['time_s', 'player', 'color', 'x_m', 'y_m'], rows);
}

export interface SessionExport {
  exportedAt: string;
  session: Session;
  matches: MatchRecord[];
}

export function sessionToJson(session: Session, matches: MatchRecord[], now = Date.now()): string {
  const data: SessionExport = { exportedAt: new Date(now).toISOString(), session, matches };
  return JSON.stringify(data, null, 2);
}
