import { TEAMS, addPoint, courtForScore, isGameOver, teamsThatCanFinishWithOnePoint, winnerOf } from './rules';
import type {
  CourtPlayers,
  EngineNote,
  FinalRallyResolution,
  MatchEvent,
  MatchState,
  Rally,
  Score,
  ServeObservation,
  Team,
} from './types';

export interface EngineConfig {
  /** Quan sát có độ tin cậy thấp hơn ngưỡng này chỉ được dùng khi giúp giải thích quan sát chắc chắn kế tiếp. */
  minConfidence: number;
  /**
   * Mức phạt khi vị trí từng người không khớp (tracking có thể nhầm màu), so với mức 1 cho mỗi lần phát bị bỏ lỡ.
   * Lớn hơn 1 nghĩa là tin vị trí hơn tin rằng camera không bỏ lỡ lần phát nào.
   */
  courtPlayersMismatchPenalty: number;
}

export const DEFAULT_CONFIG: EngineConfig = { minConfidence: 0.6, courtPlayersMismatchPenalty: 1.5 };

/** Giới hạn số khả năng giữ song song để tránh bùng nổ khi thiếu tín hiệu lâu. */
const MAX_BRANCHES = 32;

/**
 * Khả năng kém hơn khả năng tốt nhất không quá mức này vẫn được giữ làm dự phòng,
 * vì các lần phát sau có thể cho thấy nó mới đúng (ví dụ khi lần phát vừa rồi là lần đầu sau một lần bỏ lỡ).
 */
const BACKUP_MARGIN = 2;

/** Thấy đội hình phát cầu sau khi ván đã kết thúc (người chơi vào vị trí khởi động, chờ host bấm End) không hiếm, nên phạt nhẹ. */
const AFTER_FINISH_PENALTY = 0.5;

/**
 * Một cách giải thích quan sát từ một khả năng: các đội thắng pha theo thứ tự kể từ lần phát trước.
 * - winners rỗng, replay = false: lần phát đầu tiên camera thấy, chưa có điểm.
 * - winners rỗng, replay = true: phát lại (cần host xác nhận).
 * - missedServes: số lần phát cầu phải giả định camera đã bỏ lỡ.
 */
interface Explanation {
  winners: Team[];
  missedServes: number;
  replay: boolean;
}

/**
 * Một khả năng về diễn biến ván. Engine giữ nhiều khả năng song song khi quan sát chưa đủ để phân biệt,
 * và loại dần khi có quan sát mới. penalty đếm mức phải suy đoán; lowApplied đếm số quan sát độ tin cậy thấp đã dùng.
 */
interface Branch {
  score: Score;
  servingTeam: Team | null;
  rallies: Rally[];
  notes: EngineNote[];
  lastChangeSourceId: string | null;
  /** Ai đứng ô nào của mỗi đội theo khả năng này; null khi chưa quan sát được. */
  courtPlayers: Record<Team, CourtPlayers | null>;
  penalty: number;
  lowApplied: number;
  skippedLow: string[];
  needsDecision: boolean;
}

function newBranch(): Branch {
  return {
    score: { near: 0, far: 0 },
    servingTeam: null,
    rallies: [],
    notes: [],
    lastChangeSourceId: null,
    courtPlayers: { near: null, far: null },
    penalty: 0,
    lowApplied: 0,
    skippedLow: [],
    needsDecision: false,
  };
}

function cloneBranch(branch: Branch): Branch {
  return {
    ...branch,
    score: { ...branch.score },
    rallies: [...branch.rallies],
    notes: [...branch.notes],
    courtPlayers: { near: branch.courtPlayers.near, far: branch.courtPlayers.far },
    skippedLow: [...branch.skippedLow],
  };
}

/** Số pha tối đa giữa hai lần phát mà engine xét, tức là bỏ lỡ tối đa (MAX_RALLIES_BETWEEN_SERVES - 1) lần phát liên tiếp. */
const MAX_RALLIES_BETWEEN_SERVES = 3;

/** Mọi dãy đội thắng có độ dài length, kết thúc bằng `last`. */
function sequencesEndingWith(last: Team, length: number): Team[][] {
  if (length === 1) return [[last]];
  return sequencesEndingWith(last, length - 1).flatMap((rest) => TEAMS.map((first) => [first, ...rest]));
}

/** Mọi diễn biến tối đa MAX_RALLIES_BETWEEN_SERVES pha kết thúc bằng việc `team` giành quyền phát cầu. */
function explanationsFor(branch: Branch, team: Team): Explanation[] {
  // Chưa biết ai phát thì có thể camera đã bỏ lỡ cả lần phát đầu tiên.
  const missedBefore = branch.servingTeam === null ? 1 : 0;
  const explanations: Explanation[] = [];
  if (branch.servingTeam === null) explanations.push({ winners: [], missedServes: 0, replay: false });
  if (branch.servingTeam === team) explanations.push({ winners: [], missedServes: 0, replay: true });
  for (let length = 1; length <= MAX_RALLIES_BETWEEN_SERVES; length += 1) {
    for (const winners of sequencesEndingWith(team, length)) {
      explanations.push({ winners, missedServes: length - 1 + missedBefore, replay: false });
    }
  }
  return explanations;
}

/** Cộng điểm theo thứ tự; đội phát thắng thì hai người đổi ô. Trả về số pha đã cộng (dừng khi ván kết thúc). */
function applyWinners(branch: Branch, winners: Team[], sourceId: string, t: number, inferred: boolean): number {
  let applied = 0;
  for (const winner of winners) {
    if (isGameOver(branch.score)) break;
    const players = branch.courtPlayers[winner];
    if (branch.servingTeam === winner && players) {
      branch.courtPlayers[winner] = { right: players.left, left: players.right };
    }
    branch.score = addPoint(branch.score, winner);
    branch.servingTeam = winner;
    branch.rallies.push({ winner, scoreAfter: { ...branch.score }, t, sourceId, inferred });
    branch.lastChangeSourceId = sourceId;
    applied += 1;
  }
  if (inferred && applied > 0) branch.notes.push({ kind: 'inferredMissedServe', sourceId });
  return applied;
}

/**
 * So vị trí từng người theo khả năng này với vị trí quan sát được, rồi nhận vị trí quan sát làm mốc mới
 * (để tracking nhầm màu chỉ ảnh hưởng một lần phát). Trả về true nếu không khớp.
 */
function syncCourtPlayers(branch: Branch, obs: ServeObservation): boolean {
  if (!obs.courtPlayers) return false;
  let mismatch = false;
  for (const team of TEAMS) {
    const expected = branch.courtPlayers[team];
    const observed = obs.courtPlayers[team];
    if (expected && (expected.right !== observed.right || expected.left !== observed.left)) mismatch = true;
    branch.courtPlayers[team] = { ...observed };
  }
  return mismatch;
}

function compareCost(a: Branch, b: Branch): number {
  return a.penalty - b.penalty || a.lowApplied - b.lowApplied;
}

const scoreKey = (score: Score) => `${score.near}-${score.far}`;
const playersKey = (players: CourtPlayers | null) => (players ? `${players.right},${players.left}` : '?');
const branchKey = (branch: Branch) =>
  `${scoreKey(branch.score)}/${branch.servingTeam ?? '?'}/${playersKey(branch.courtPlayers.near)}/${playersKey(branch.courtPlayers.far)}`;

/** Gộp các khả năng có cùng tỉ số, đội phát và vị trí (tương lai của chúng giống hệt nhau), giữ khả năng rẻ hơn. */
function dedupe(branches: Branch[]): Branch[] {
  const byKey = new Map<string, Branch>();
  for (const branch of branches) {
    const key = branchKey(branch);
    const existing = byKey.get(key);
    if (!existing || compareCost(branch, existing) < 0) byKey.set(key, branch);
  }
  return [...byKey.values()].sort(compareCost).slice(0, MAX_BRANCHES);
}

/** Mọi cách giải thích quan sát từ mỗi khả năng hiện có. */
function expand(
  branches: Branch[],
  obs: ServeObservation,
  low: boolean,
  decision: boolean | undefined,
  config: EngineConfig,
): Branch[] {
  const children: Branch[] = [];
  const teams = obs.servingTeam ? [obs.servingTeam] : TEAMS;

  for (const branch of branches) {
    if (isGameOver(branch.score)) {
      const child = cloneBranch(branch);
      child.notes.push({ kind: 'afterFinish', sourceId: obs.id });
      if (!low) child.penalty += AFTER_FINISH_PENALTY;
      children.push(child);
      continue;
    }

    if (low) {
      // Quan sát thấp có thể bị bỏ qua; chỉ được áp dụng khi khớp hoàn toàn mà không cần suy đoán.
      const skipped = cloneBranch(branch);
      skipped.skippedLow.push(obs.id);
      children.push(skipped);
    }

    for (const team of teams) {
      for (const explanation of explanationsFor(branch, team)) {
        if (explanation.replay && decision === false) continue;
        if (low && (explanation.missedServes > 0 || explanation.replay)) continue;

        const child = cloneBranch(branch);
        const inferred = explanation.missedServes > 0;
        const applied = applyWinners(child, explanation.winners, obs.id, obs.t, inferred);
        // Ván kết thúc giữa chừng: phần còn lại không thể xảy ra, lần phát này là thừa.
        const cutShort = applied < explanation.winners.length;
        if (explanation.winners.length === 0 && !explanation.replay) child.servingTeam = team;
        // Người phát phải đứng đúng ô theo chẵn lẻ điểm của đội mình.
        if (!cutShort && courtForScore(child.score[team]) !== obs.court) continue;
        if (cutShort) {
          if (low) continue;
          child.penalty += AFTER_FINISH_PENALTY;
          child.notes.push({ kind: 'afterFinish', sourceId: obs.id });
        }

        const mismatch = syncCourtPlayers(child, obs);
        if (low) {
          if (mismatch) continue;
          child.lowApplied += 1;
        } else {
          child.penalty += explanation.missedServes;
          // Phát lại hiếm ngang với bỏ lỡ một lần phát, nên chỉ hiện popup khi không có cách giải thích nào tốt hơn.
          if (explanation.replay) {
            child.penalty += 1;
            child.needsDecision = true;
          }
          if (mismatch) {
            child.penalty += config.courtPlayersMismatchPenalty;
            child.notes.push({ kind: 'courtPlayersMismatch', sourceId: obs.id });
          }
        }
        children.push(child);
      }
    }
  }
  return children;
}

function commonRallyPrefix(branches: Branch[]): number {
  const [first, ...rest] = branches;
  if (!first) return 0;
  let length = 0;
  while (
    length < first.rallies.length &&
    rest.every((b) => {
      const a = first.rallies[length];
      const r = b.rallies[length];
      return r !== undefined && a !== undefined && r.winner === a.winner && r.sourceId === a.sourceId;
    })
  ) {
    length += 1;
  }
  return length;
}

/**
 * Tính trạng thái ván từ toàn bộ lịch sử sự kiện. Hàm thuần: luôn tính lại từ đầu,
 * nên khi có quyết định mới, undo hay sửa tay thì tỉ số tự nhất quán với lịch sử.
 */
export function computeMatchState(events: readonly MatchEvent[], config: EngineConfig = DEFAULT_CONFIG): MatchState {
  const voided = new Set<string>();
  const decisions = new Map<string, boolean>();
  for (const event of events) {
    if (event.type === 'void') voided.add(event.targetId);
    if (event.type === 'replayDecision') decisions.set(event.observationId, event.isReplay);
  }

  const active = events.filter(
    (e): e is Exclude<MatchEvent, { type: 'void' | 'replayDecision' }> =>
      e.type !== 'void' && e.type !== 'replayDecision' && !voided.has(e.id),
  );

  let branches: Branch[] = [newBranch()];
  // Tỉ số và số pha tại lần sửa tay gần nhất, dùng khi các khả năng không còn thống nhất pha nào sau đó.
  let baseScore: Score = { near: 0, far: 0 };
  let baseRallyCount = 0;
  let ended = false;
  let pendingReplay: MatchState['pendingReplay'] = null;
  let blockedEventCount = 0;
  let unresolvedLowConfidence = 0;

  for (const [index, event] of active.entries()) {
    if (event.type === 'manualScore') {
      const agreedServer = branches.every((b) => b.servingTeam === branches[0]?.servingTeam)
        ? (branches[0]?.servingTeam ?? null)
        : null;
      const branch = { ...cloneBranch(branches[0] ?? newBranch()), penalty: 0, lowApplied: 0, skippedLow: [] };
      branch.score = { ...event.score };
      branch.servingTeam = event.servingTeam ?? agreedServer;
      branch.lastChangeSourceId = event.id;
      branch.notes.push({ kind: 'manualCorrection', sourceId: event.id });
      branches = [branch];
      baseScore = { ...event.score };
      baseRallyCount = branch.rallies.length;
      unresolvedLowConfidence = 0;
      continue;
    }

    if (event.type === 'finalRally') {
      branches = branches.map((b) => {
        const child = cloneBranch(b);
        if (event.team && !isGameOver(child.score)) applyWinners(child, [event.team], event.id, event.t, true);
        return child;
      });
      ended = true;
      unresolvedLowConfidence = 0;
      continue;
    }

    if (ended) {
      branches[0]?.notes.push({ kind: 'afterFinish', sourceId: event.id });
      continue;
    }

    const decision = decisions.get(event.id);
    // Host xác nhận phát lại: lần phát này không có pha nào xảy ra trước nó.
    if (decision === true) continue;

    const low = event.confidence < config.minConfidence;
    const children = expand(branches, event, low, decision, config);

    if (low) {
      branches = dedupe(children);
      unresolvedLowConfidence += 1;
      continue;
    }

    if (children.length === 0) {
      branches[0]?.notes.push({ kind: 'unexplained', sourceId: event.id });
      continue;
    }
    const best = children.reduce((a, b) => (compareCost(b, a) < 0 ? b : a));
    if (children.some((c) => c.needsDecision && compareCost(c, best) === 0)) {
      pendingReplay = { observationId: event.id };
      blockedEventCount = active.length - index - 1;
      break;
    }

    // Giữ cả khả năng dự phòng; trừ chi phí của khả năng tốt nhất để các con số luôn nhỏ.
    const survivors = children.filter((c) => !c.needsDecision && c.penalty <= best.penalty + BACKUP_MARGIN);
    branches = dedupe(survivors).map((b) => {
      const settled = cloneBranch(b);
      for (const id of settled.skippedLow) settled.notes.push({ kind: 'lowConfidenceDropped', sourceId: id });
      return {
        ...settled,
        penalty: settled.penalty - best.penalty,
        lowApplied: settled.lowApplied - best.lowApplied,
        skippedLow: [],
      };
    });
    unresolvedLowConfidence = 0;
  }

  return summarize(branches, { baseScore, baseRallyCount, ended, pendingReplay, blockedEventCount, unresolvedLowConfidence });
}

function summarize(
  branches: Branch[],
  extra: Pick<MatchState, 'ended' | 'pendingReplay' | 'blockedEventCount' | 'unresolvedLowConfidence'> & {
    baseScore: Score;
    baseRallyCount: number;
  },
): MatchState {
  // Chỉ những khả năng tốt nhất quyết định tỉ số hiển thị; khả năng dự phòng chỉ dùng cho các lần phát sau.
  const sorted = [...branches].sort(compareCost);
  const leader = sorted[0];
  branches = leader ? sorted.filter((b) => compareCost(b, leader) === 0) : sorted;
  const first = branches[0] ?? newBranch();
  const distinctScores = [...new Map(branches.map((b) => [scoreKey(b.score), b.score])).values()];
  const scoreCertain = distinctScores.length === 1;
  const prefix = commonRallyPrefix(branches);

  let score = first.score;
  if (!scoreCertain) {
    score = prefix > extra.baseRallyCount ? first.rallies[prefix - 1]!.scoreAfter : extra.baseScore;
  }
  const servingTeam = branches.every((b) => b.servingTeam === first.servingTeam) ? first.servingTeam : null;
  const finished = scoreCertain && isGameOver(score);

  return {
    score: { ...score },
    scoreCertain,
    alternatives: scoreCertain ? [] : distinctScores.map((s) => ({ ...s })),
    servingTeam,
    rallies: first.rallies.slice(0, prefix),
    finished,
    winner: finished ? winnerOf(score) : null,
    ended: extra.ended,
    pendingReplay: extra.pendingReplay,
    blockedEventCount: extra.blockedEventCount,
    unresolvedLowConfidence: extra.unresolvedLowConfidence,
    notes: first.notes,
    lastChangeSourceId: first.lastChangeSourceId,
  };
}

export function resolveFinalRally(state: MatchState): FinalRallyResolution {
  if (!state.scoreCertain) return { kind: 'ambiguous', alternatives: state.alternatives };
  if (state.finished) return { kind: 'none' };
  const candidates = teamsThatCanFinishWithOnePoint(state.score);
  if (candidates.length === 1 && candidates[0]) return { kind: 'auto', team: candidates[0] };
  return { kind: 'ask', candidates };
}

/** Giữ lịch sử sự kiện của một ván và cung cấp các thao tác cho giao diện. */
export class MatchEngine {
  private readonly events: MatchEvent[] = [];
  private nextId = 1;

  constructor(
    private readonly config: EngineConfig = DEFAULT_CONFIG,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Khôi phục ván đang dở từ các sự kiện đã lưu. */
  static fromEvents(events: readonly MatchEvent[], config: EngineConfig = DEFAULT_CONFIG, now?: () => number): MatchEngine {
    const engine = new MatchEngine(config, now);
    engine.events.push(...events);
    engine.nextId = events.length + 1;
    return engine;
  }

  get state(): MatchState {
    return computeMatchState(this.events, this.config);
  }

  getEvents(): readonly MatchEvent[] {
    return this.events;
  }

  observeServe(observation: ServeObservation): void {
    this.events.push(observation);
  }

  decideReplay(observationId: string, isReplay: boolean): void {
    this.events.push({ type: 'replayDecision', observationId, isReplay });
  }

  /** Hoàn tác sự kiện gần nhất đã làm thay đổi tỉ số. Trả về false nếu không có gì để hoàn tác. */
  undo(): boolean {
    const target = this.state.lastChangeSourceId;
    if (!target) return false;
    this.events.push({ type: 'void', targetId: target });
    return true;
  }

  setScore(score: Score, servingTeam: Team | null): void {
    this.events.push({ type: 'manualScore', id: this.generateId('m'), t: this.now(), score: { ...score }, servingTeam });
  }

  finalRallyResolution(): FinalRallyResolution {
    return resolveFinalRally(this.state);
  }

  /** Kết thúc ván khi app tự xác định được pha cuối; nếu cần hỏi host thì ném lỗi, dùng assignFinalRally hoặc setScore. */
  end(): void {
    const resolution = this.finalRallyResolution();
    if (resolution.kind === 'ask' || resolution.kind === 'ambiguous') {
      throw new Error('Cần host xác định pha cuối hoặc tỉ số trước khi kết thúc ván');
    }
    this.assignFinalRally(resolution.kind === 'auto' ? resolution.team : null);
  }

  assignFinalRally(team: Team | null): void {
    this.events.push({ type: 'finalRally', id: this.generateId('f'), t: this.now(), team });
  }

  private generateId(prefix: string): string {
    const id = `${prefix}${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}
