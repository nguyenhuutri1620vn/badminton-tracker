import { useState } from 'preact/hooks';
import { CameraFrameSource } from '../../cv/cameraFrameSource';
import { getPersonDetector } from '../../cv/personDetector';
import { SimulatedFrameSource } from '../../cv/simulator';
import type { Team } from '../../core/types';
import { EndDialog } from '../components/EndDialog';
import { MiniMap } from '../components/MiniMap';
import { ReplayPopup } from '../components/ReplayPopup';
import { ScoreEditor } from '../components/ScoreEditor';
import { playerName, teamLabel, useAppState, useModel } from '../context';
import { useCameraState, useServices } from '../services';

export function LiveScreen() {
  const model = useModel();
  const { session, live, positions, source, simulatorTruth, sourceFps, calibration } = useAppState();
  const { camera } = useServices();
  const cam = useCameraState();
  const [editing, setEditing] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [loadingCv, setLoadingCv] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const { match, state, replayPrompt, endQuestion, warnings } = live;

  if (!match || !state) {
    return (
      <section class="screen center">
        <p class="muted">Chưa có ván nào đang chơi.</p>
        <button class="primary" onClick={() => model.navigate('setup')}>
          Chuẩn bị ván
        </button>
      </section>
    );
  }

  const labels: Record<Team, string> = {
    near: teamLabel(session, match.lineup, 'near'),
    far: teamLabel(session, match.lineup, 'far'),
  };
  const names = Object.fromEntries(
    Object.entries(match.lineup).map(([color, id]) => [color, playerName(session, id)]),
  );

  const teamCard = (team: Team) => (
    <div class={`team-score ${team} ${state.winner === team ? 'winner' : ''}`}>
      <div class="team-name">
        {labels[team]}
        {state.servingTeam === team && <span class="serve-badge">phát cầu</span>}
      </div>
      <div class="points">{state.score[team]}</div>
      <div class="muted">{team === 'near' ? 'Đội gần camera' : 'Đội xa camera'}</div>
    </div>
  );

  const end = async () => {
    await model.requestEnd();
  };

  const startCamera = async () => {
    if (!calibration) return;
    setLoadingCv(true);
    setCvError(null);
    try {
      const detector = await getPersonDetector();
      model.attachSource(new CameraFrameSource(() => camera.current, calibration, detector), 'camera');
    } catch (error) {
      setCvError(`Không tải được mô hình nhận diện người: ${(error as Error).message}`);
    } finally {
      setLoadingCv(false);
    }
  };
  const cameraBlocker =
    cam.status !== 'on' ? 'Chưa kết nối camera (màn hình Thiết bị)' : !calibration ? 'Chưa calibrate sân' : null;

  return (
    <section class="screen live">
      <div class="live-main">
        <div class="scoreboard">
          <div class="match-title">Ván {match.index}</div>
          <div class="teams">
            {teamCard('far')}
            <div class="vs">–</div>
            {teamCard('near')}
          </div>
          {!state.scoreCertain && (
            <div class="notice">
              Đang chờ xác định: có thể là{' '}
              {state.alternatives.map((s) => `${s.near}-${s.far}`).join(' hoặc ')} (gần–xa)
            </div>
          )}
          {state.finished && <div class="notice success">Ván đã kết thúc. Bấm "Kết thúc ván" để lưu.</div>}
          {warnings.map((w) => (
            <div class="notice warn" key={w}>
              {w}
            </div>
          ))}
          <div class="row">
            <button onClick={() => model.undo()} disabled={state.rallies.length === 0}>
              Hoàn tác pha gần nhất
            </button>
            <button onClick={() => setEditing(true)}>Sửa tỉ số</button>
            <button class="primary" onClick={end}>
              Kết thúc ván
            </button>
          </div>
          <RallyLog rallies={state.rallies.slice(-8)} labels={labels} />
        </div>
        <div class="side">
          <MiniMap players={positions} names={names} />
          <div class="source-panel">
            <div class="muted">
              Nguồn: {source === 'simulator' ? 'giả lập' : source === 'camera' ? 'camera' : 'chưa kết nối'}
            </div>
            {source !== 'none' && (
              <div class="muted">
                {positions.length}/4 người · {sourceFps.toFixed(0)} khung/giây
              </div>
            )}
            {source === 'camera' && (
              <div class="row">
                <button onClick={() => model.swapColors('near')}>Đổi xanh ↔ đỏ</button>
                <button onClick={() => model.swapColors('far')}>Đổi tím ↔ vàng</button>
              </div>
            )}
            {cvError && <div class="notice warn">{cvError}</div>}
            {simulatorTruth && (
              <div class="muted">
                Tỉ số thật của giả lập: {simulatorTruth.near}-{simulatorTruth.far} (gần–xa)
              </div>
            )}
            {source === 'none' ? (
              <>
              <button class="primary" disabled={Boolean(cameraBlocker) || loadingCv} title={cameraBlocker ?? ''} onClick={startCamera}>
                {loadingCv ? 'Đang tải mô hình…' : 'Chấm bằng camera'}
              </button>
              {cameraBlocker && <div class="muted small">{cameraBlocker}</div>}
              <div class="row">
                <button
                  onClick={() => model.attachSource(new SimulatedFrameSource({ handSignalRate: 0.3 }, speed), 'simulator')}
                >
                  Chạy giả lập
                </button>
                <select value={speed} onChange={(e) => setSpeed(+e.currentTarget.value)}>
                  {[1, 4, 10].map((s) => (
                    <option value={s} key={s}>
                      x{s}
                    </option>
                  ))}
                </select>
              </div>
              </>
            ) : (
              <button onClick={() => model.stopSource()}>Dừng nguồn</button>
            )}
          </div>
        </div>
      </div>

      {replayPrompt && <ReplayPopup prompt={replayPrompt} onAnswer={(r) => model.answerReplay(r)} />}
      {editing && (
        <ScoreEditor
          initial={state.score}
          labels={labels}
          onCancel={() => setEditing(false)}
          onSave={(score, server) => {
            model.setScore(score, server);
            setEditing(false);
          }}
        />
      )}
      {endQuestion && (
        <EndDialog
          question={endQuestion}
          labels={labels}
          onCancel={() => model.cancelEnd()}
          onFinish={(team) => model.finishWith(team)}
          onChooseScore={async (score) => {
            model.setScore(score, null);
            await model.requestEnd();
          }}
        />
      )}
    </section>
  );
}

function RallyLog({ rallies, labels }: { rallies: { winner: Team; scoreAfter: { near: number; far: number }; inferred: boolean }[]; labels: Record<Team, string> }) {
  if (rallies.length === 0) return <p class="muted">Chưa có pha nào. Điểm tự cộng khi camera thấy lần phát cầu tiếp theo.</p>;
  return (
    <ol class="rally-log">
      {[...rallies].reverse().map((r, i) => (
        <li key={i}>
          <strong>
            {r.scoreAfter.near}-{r.scoreAfter.far}
          </strong>{' '}
          {labels[r.winner]} thắng pha{r.inferred ? <span class="muted"> (suy ra)</span> : null}
        </li>
      ))}
    </ol>
  );
}
