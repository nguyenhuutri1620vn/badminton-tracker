// Đội được xác định theo nửa sân: gần camera (near) hoặc xa camera (far). Không đổi sân trong ván.
export type Team = 'near' | 'far';

// Ô giao cầu theo góc nhìn của chính người phát cầu.
export type ServiceCourt = 'right' | 'left';

export interface Score {
  near: number;
  far: number;
}

/** Bộ phát hiện đội hình phát cầu gửi sự kiện này mỗi lần thấy một đội hình phát cầu hợp lệ. */
export interface ServeObservation {
  type: 'serve';
  id: string;
  /** Thời điểm tính bằng ms kể từ khi bắt đầu ván. */
  t: number;
  /** null khi không phân biệt được người phát và người nhận; engine tự suy ra từ ô giao cầu và các lần phát sau. */
  servingTeam: Team | null;
  court: ServiceCourt;
  /** Ai đứng ô phải, ai đứng ô trái của mỗi đội (id chấm màu), nếu tracking xác định được. */
  courtPlayers?: Record<Team, CourtPlayers>;
  /** 0..1 */
  confidence: number;
  /**
   * Số pha kể từ lần phát nhìn thấy trước (gồm cả pha của lần phát này), đếm từ số lần người chơi dừng lại chuẩn bị
   * phát (RallyCounter). null hoặc không có khi không đếm được (lần phát đầu tiên). Chỉ là bằng chứng mềm.
   */
  ralliesSincePrevious?: number | null;
}

/** Hai người trong một đội chỉ đổi ô khi đội đó thắng pha lúc đang phát cầu. */
export interface CourtPlayers {
  right: string;
  left: string;
}

/** Host trả lời popup "Phát lại?". Hết 5 giây không trả lời thì giao diện gửi isReplay = false. */
export interface ReplayDecision {
  type: 'replayDecision';
  observationId: string;
  isReplay: boolean;
}

/** Undo: vô hiệu hóa sự kiện đã tạo ra thay đổi tỉ số gần nhất. */
export interface VoidEvent {
  type: 'void';
  targetId: string;
}

/** Sửa tỉ số dự phòng khi app không tự giải quyết được. */
export interface ManualScore {
  type: 'manualScore';
  id: string;
  t: number;
  score: Score;
  servingTeam: Team | null;
}

/** Host bấm End: gán điểm pha cuối (null nếu không gán) và đóng ván. */
export interface FinalRallyAssigned {
  type: 'finalRally';
  id: string;
  t: number;
  team: Team | null;
}

export type MatchEvent = ServeObservation | ReplayDecision | VoidEvent | ManualScore | FinalRallyAssigned;

export interface Rally {
  winner: Team;
  scoreAfter: Score;
  t: number;
  /** Id của sự kiện sinh ra pha này. */
  sourceId: string;
  /** true khi pha được suy ra mà không thấy trực tiếp lần phát cầu tương ứng. */
  inferred: boolean;
}

export type NoteKind =
  | 'afterFinish'
  | 'lowConfidenceDropped'
  | 'inferredMissedServe'
  | 'manualCorrection'
  /** Vị trí từng người không khớp với diễn biến đã chọn (có thể do tracking nhầm màu). */
  | 'courtPlayersMismatch'
  /** Không có diễn biến tối đa 2 pha nào giải thích được lần phát này; bỏ qua nó. */
  | 'unexplained';

export interface EngineNote {
  kind: NoteKind;
  sourceId: string;
}

export interface MatchState {
  /** Tỉ số chắc chắn: tỉ số chung của mọi khả năng, hoặc tỉ số gần nhất mà mọi khả năng còn thống nhất. */
  score: Score;
  /** false khi còn nhiều khả năng tỉ số chưa loại được. */
  scoreCertain: boolean;
  /** Các tỉ số có thể khi scoreCertain = false. */
  alternatives: Score[];
  /** null khi chưa biết hoặc các khả năng chưa thống nhất đội phát. */
  servingTeam: Team | null;
  /** Các pha mà mọi khả năng đều thống nhất. */
  rallies: Rally[];
  finished: boolean;
  winner: Team | null;
  /** Host đã bấm End. */
  ended: boolean;
  /** Đang chờ host trả lời popup phát lại; các sự kiện sau đó chưa được tính. */
  pendingReplay: { observationId: string } | null;
  blockedEventCount: number;
  /** Số quan sát độ tin cậy thấp đang chờ quan sát chắc chắn kế tiếp để giải quyết. */
  unresolvedLowConfidence: number;
  notes: EngineNote[];
  /** Id sự kiện gần nhất làm thay đổi tỉ số; undo sẽ vô hiệu hóa sự kiện này. */
  lastChangeSourceId: string | null;
}

export type FinalRallyResolution =
  | { kind: 'none' }
  | { kind: 'auto'; team: Team }
  | { kind: 'ask'; candidates: Team[] }
  /** Tỉ số chưa chắc chắn: host chọn tỉ số đúng (sửa tay) trước khi kết thúc ván. */
  | { kind: 'ambiguous'; alternatives: Score[] };
