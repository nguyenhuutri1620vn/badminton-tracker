import type { Score, ServiceCourt, Team } from './types';

export const TEAMS: readonly Team[] = ['near', 'far'];
export const WINNING_SCORE = 21;
export const MAX_SCORE = 30;

export function otherTeam(team: Team): Team {
  return team === 'near' ? 'far' : 'near';
}

export function isGameOver(score: Score): boolean {
  const high = Math.max(score.near, score.far);
  const diff = Math.abs(score.near - score.far);
  return high >= MAX_SCORE || (high >= WINNING_SCORE && diff >= 2);
}

export function winnerOf(score: Score): Team | null {
  if (!isGameOver(score)) return null;
  return score.near > score.far ? 'near' : 'far';
}

/** Điểm đội phát cầu chẵn thì phát ô phải, lẻ thì ô trái. */
export function courtForScore(points: number): ServiceCourt {
  return points % 2 === 0 ? 'right' : 'left';
}

export function addPoint(score: Score, team: Team): Score {
  return { ...score, [team]: score[team] + 1 };
}

export function teamsThatCanFinishWithOnePoint(score: Score): Team[] {
  if (isGameOver(score)) return [];
  return TEAMS.filter((team) => isGameOver(addPoint(score, team)));
}
