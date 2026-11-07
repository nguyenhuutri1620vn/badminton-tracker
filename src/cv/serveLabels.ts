import type { Team } from '../core/types';

/** Host đánh dấu khi xem lại video: lúc này có một lần phát cầu, do đội này phát. */
export interface ServeLabel {
  /** ms trong video. */
  t: number;
  team: Team;
}

export interface ServeLabelFile {
  video: string;
  labels: ServeLabel[];
}

/** Một lần phát app tự nhận ra (đội phát null khi chưa đoán được). */
export interface ServePrediction {
  t: number;
  team: Team | null;
}

/** Bấm hai lần trong khoảng này là sửa nhãn vừa bấm chứ không phải lần phát mới (các pha cách nhau ≥ 5 giây). */
const SAME_LABEL_MS = 1000;
/** Xóa nhãn: chỉ xóa nhãn cách chỗ đang xem không quá khoảng này. */
const REMOVE_WITHIN_MS = 3000;
/** Dự đoán lệch nhãn không quá khoảng này thì coi là cùng một lần phát. */
export const MATCH_TOLERANCE_MS = 3000;

export function addLabel(labels: readonly ServeLabel[], label: ServeLabel): ServeLabel[] {
  return [...labels.filter((l) => Math.abs(l.t - label.t) > SAME_LABEL_MS), label].sort((a, b) => a.t - b.t);
}

export function removeNearestLabel(labels: readonly ServeLabel[], t: number): ServeLabel[] {
  const nearest = labels.reduce<ServeLabel | null>(
    (best, l) => (Math.abs(l.t - t) <= REMOVE_WITHIN_MS && (!best || Math.abs(l.t - t) < Math.abs(best.t - t)) ? l : best),
    null,
  );
  return labels.filter((l) => l !== nearest);
}

export function serializeLabels(video: string, labels: readonly ServeLabel[]): string {
  return JSON.stringify({ video, labels }, null, 2);
}

export function parseLabelFile(text: string): ServeLabelFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('File nhãn không phải JSON');
  }
  const file = data as Partial<ServeLabelFile>;
  const valid =
    Array.isArray(file.labels) &&
    file.labels.every((l) => typeof l?.t === 'number' && (l.team === 'near' || l.team === 'far'));
  if (!valid) throw new Error('File nhãn sai định dạng: cần { video, labels: [{ t, team: "near" | "far" }] }');
  return {
    video: typeof file.video === 'string' ? file.video : '',
    labels: [...file.labels!].map(({ t, team }) => ({ t, team })).sort((a, b) => a.t - b.t),
  };
}

export interface ServeEvaluation {
  labels: number;
  /** Ghép được và đoán đúng đội phát. */
  correct: number;
  wrongTeam: number;
  /** Ghép được nhưng app chưa đoán đội phát. */
  unknownTeam: number;
  /** Nhãn không có dự đoán nào gần. */
  missed: number;
  /** Dự đoán không ứng với nhãn nào (lần phát giả). */
  extra: number;
  /** correct / (correct + wrongTeam); NaN khi chưa đoán lần nào. */
  accuracy: number;
}

/** Ghép theo thời gian (mỗi bên dùng tối đa một lần, cặp gần nhau ghép trước) rồi đếm. */
export function evaluateServeTeams(
  predictions: readonly ServePrediction[],
  labels: readonly ServeLabel[],
  toleranceMs = MATCH_TOLERANCE_MS,
): ServeEvaluation {
  const pairs: [number, number, number][] = [];
  predictions.forEach((p, i) =>
    labels.forEach((l, j) => {
      const gap = Math.abs(p.t - l.t);
      if (gap <= toleranceMs) pairs.push([gap, i, j]);
    }),
  );
  pairs.sort((a, b) => a[0] - b[0]);
  const usedPredictions = new Set<number>();
  const usedLabels = new Set<number>();
  let correct = 0;
  let wrongTeam = 0;
  let unknownTeam = 0;
  for (const [, i, j] of pairs) {
    if (usedPredictions.has(i) || usedLabels.has(j)) continue;
    usedPredictions.add(i);
    usedLabels.add(j);
    const team = predictions[i]!.team;
    if (team === null) unknownTeam += 1;
    else if (team === labels[j]!.team) correct += 1;
    else wrongTeam += 1;
  }
  return {
    labels: labels.length,
    correct,
    wrongTeam,
    unknownTeam,
    missed: labels.length - usedLabels.size,
    extra: predictions.length - usedPredictions.size,
    accuracy: correct / (correct + wrongTeam),
  };
}
