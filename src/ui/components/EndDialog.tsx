import type { FinalRallyResolution, Score, Team } from '../../core/types';

/** Host bấm End nhưng app không tự xác định được pha cuối hoặc tỉ số. */
export function EndDialog({
  question,
  labels,
  onFinish,
  onChooseScore,
  onCancel,
}: {
  question: FinalRallyResolution;
  labels: Record<Team, string>;
  onFinish: (team: Team | null) => void;
  onChooseScore: (score: Score) => void;
  onCancel: () => void;
}) {
  return (
    <div class="overlay">
      <div class="dialog">
        {question.kind === 'ambiguous' ? (
          <>
            <h2>Tỉ số chưa chắc chắn</h2>
            <p>Camera chưa đủ dữ liệu để phân biệt. Chọn tỉ số đúng trước khi kết thúc:</p>
            <div class="actions column">
              {question.alternatives.map((s) => (
                <button key={`${s.near}-${s.far}`} class="big" onClick={() => onChooseScore(s)}>
                  {labels.near} {s.near} – {s.far} {labels.far}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h2>Ai thắng pha cuối?</h2>
            <p>Pha cuối không có lần phát cầu tiếp theo nên app không tự biết.</p>
            <div class="actions column">
              {(question.kind === 'ask' ? question.candidates : []).map((team) => (
                <button key={team} class="big primary" onClick={() => onFinish(team)}>
                  {labels[team]}
                </button>
              ))}
              <button class="big" onClick={() => onFinish(null)}>
                Không cộng điểm, lưu tỉ số hiện tại
              </button>
            </div>
          </>
        )}
        <div class="actions">
          <button onClick={onCancel}>Quay lại ván</button>
        </div>
      </div>
    </div>
  );
}
