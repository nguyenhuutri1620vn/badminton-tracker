import { useEffect, useRef, useState } from 'preact/hooks';
import { getPersonDetector, TiledPersonDetector } from '../../cv/personDetector';
import { VideoAnalysis, formatVideoTime, type AnalysisSummary } from '../../cv/videoAnalysis';
import {
  addLabel,
  evaluateServeTeams,
  parseLabelFile,
  removeNearestLabel,
  serializeLabels,
  type ServeEvaluation,
  type ServeLabel,
} from '../../cv/serveLabels';
import type { PlayerSample } from '../../core/serveFormation';
import type { Score, Team } from '../../core/types';
import { MiniMap } from '../components/MiniMap';
import { downloadText, useAppState, useModel } from '../context';

/** Phân tích 8 khung mỗi giây của video: đủ cho cửa sổ đứng yên 1 giây, nhanh hơn chạy mọi khung. */
const ANALYSIS_FPS = 8;

/** File webm do MediaRecorder ghi thường không có thời lượng: tua tới cuối để trình duyệt tính ra. */
async function ensureDuration(video: HTMLVideoElement): Promise<void> {
  if (Number.isFinite(video.duration)) return;
  await new Promise<void>((resolve) => {
    video.addEventListener('durationchange', () => Number.isFinite(video.duration) && resolve());
    video.currentTime = 1e9;
  });
  video.currentTime = 0;
}

const labelKey = (fileName: string) => `serveLabels:${fileName}`;

/** Nhãn lưu theo tên file video trong trình duyệt, để mở lại video là có nhãn cũ. */
function loadLabels(fileName: string): ServeLabel[] {
  try {
    const text = localStorage.getItem(labelKey(fileName));
    return text ? parseLabelFile(text).labels : [];
  } catch {
    return [];
  }
}

function saveLabels(fileName: string, labels: ServeLabel[]): void {
  try {
    localStorage.setItem(labelKey(fileName), serializeLabels(fileName, labels));
  } catch {
    // Không lưu được (chế độ ẩn danh...): vẫn xuất file nhãn được.
  }
}

const teamName = (team: Team | null) => (team === 'near' ? 'Gần' : team === 'far' ? 'Xa' : 'chưa rõ');

function EvaluationRow({ name, result }: { name: string; result: ServeEvaluation }) {
  return (
    <tr>
      <td>{name}</td>
      <td>{Number.isNaN(result.accuracy) ? '–' : `${Math.round(result.accuracy * 100)}%`}</td>
      <td>{result.correct}</td>
      <td>{result.wrongTeam}</td>
      <td>{result.unknownTeam}</td>
      <td>{result.missed}</td>
      <td>{result.extra}</td>
    </tr>
  );
}

export function AnalyzeScreen() {
  const model = useModel();
  const { calibration } = useAppState();
  const videoRef = useRef<HTMLVideoElement>(null);
  const analysisRef = useRef<VideoAnalysis | null>(null);
  const stopRef = useRef(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'running' | 'done'>('idle');
  const [progress, setProgress] = useState(0);
  const [players, setPlayers] = useState<PlayerSample[]>([]);
  const [summary, setSummary] = useState<AnalysisSummary | null>(null);
  const [finalScore, setFinalScore] = useState<Score | null>(null);
  const [truth, setTruth] = useState({ near: '', far: '' });
  const [error, setError] = useState<string | null>(null);
  const [labels, setLabels] = useState<ServeLabel[]>([]);

  const updateLabels = (next: ServeLabel[]) => {
    setLabels(next);
    if (fileName) saveLabels(fileName, next);
  };

  // Gán nhãn bằng phím khi xem lại video: G = đội gần phát, X = đội xa phát, Z = xóa nhãn gần nhất.
  useEffect(() => {
    if (!videoUrl || status === 'running') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      const video = videoRef.current;
      if (!video) return;
      const t = Math.round(video.currentTime * 1000);
      const key = e.key.toLowerCase();
      if (key === 'g' || key === 'x') updateLabels(addLabel(labels, { t, team: key === 'g' ? 'near' : 'far' }));
      else if (key === 'z') updateLabels(removeNearestLabel(labels, t));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [videoUrl, status, labels, fileName]);

  useEffect(() => () => void (videoUrl && URL.revokeObjectURL(videoUrl)), [videoUrl]);

  const open = (file: File) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setLabels(loadLabels(file.name));
    setSummary(null);
    setFinalScore(null);
    setStatus('idle');
    setProgress(0);
  };

  const grabFrame = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    model.calibrateFromImage({ src: canvas.toDataURL('image/jpeg', 0.9), width: canvas.width, height: canvas.height });
  };

  /** Tua từng bước 1/8 giây và chạy nhận diện người trên từng khung (chậm hơn thời gian thực nhưng không bỏ khung nào). */
  const run = async () => {
    const video = videoRef.current;
    if (!video || !calibration) return;
    setError(null);
    setStatus('loading');
    let detector;
    try {
      detector = await getPersonDetector();
    } catch (e) {
      setError(`Không tải được mô hình nhận diện người: ${(e as Error).message}`);
      setStatus('idle');
      return;
    }
    const analysis = new VideoAnalysis(calibration);
    const people = new TiledPersonDetector(detector, calibration);
    analysisRef.current = analysis;
    stopRef.current = false;
    setStatus('running');
    video.pause();
    await ensureDuration(video);

    const step = 1 / ANALYSIS_FPS;
    let lastUi = 0;
    for (let time = 0; time < video.duration && !stopRef.current; time += step) {
      video.currentTime = time;
      await new Promise<void>((resolve) => video.addEventListener('seeked', () => resolve(), { once: true }));
      analysis.processFrame(time * 1000, people.detect(video));
      if (performance.now() - lastUi > 250) {
        lastUi = performance.now();
        setProgress(time / video.duration);
        setPlayers(analysis.lastPlayers);
        setSummary(analysis.summary());
      }
    }
    setProgress(stopRef.current ? progress : 1);
    setSummary(analysis.summary());
    setFinalScore(analysis.finalScore());
    setStatus('done');
  };

  const exportJson = () => {
    if (!summary) return;
    const data = {
      video: fileName,
      calibration: calibration?.name,
      frames: summary.frames,
      fullFrameRatio: summary.fullFrameRatio,
      truth: truth.near && truth.far ? { near: +truth.near, far: +truth.far } : null,
      finalScore,
      labels,
      serveGuesses: summary.serveGuesses,
      pauses: summary.pauses.map((t) => formatVideoTime(t)),
      observations: summary.entries.map((e) => ({
        time: formatVideoTime(e.observation.t),
        t: e.observation.t,
        servingTeam: e.observation.servingTeam,
        court: e.observation.court,
        courtPlayers: e.observation.courtPlayers,
        ralliesSincePrevious: e.observation.ralliesSincePrevious,
        scoreAfter: e.scoreAfter,
        scoreCertain: e.scoreCertain,
      })),
    };
    downloadText(`phan-tich-${(fileName ?? 'video').replace(/\.[^.]+$/, '')}.json`, JSON.stringify(data, null, 2), 'application/json');
  };

  const exportLabels = () =>
    downloadText(`nhan-${(fileName ?? 'video').replace(/\.[^.]+$/, '')}.json`, serializeLabels(fileName ?? '', labels), 'application/json');

  const importLabels = async (file: File) => {
    try {
      updateLabels(parseLabelFile(await file.text()).labels);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const seek = (t: number) => {
    if (videoRef.current && status !== 'running') videoRef.current.currentTime = t / 1000;
  };

  const truthScore = truth.near !== '' && truth.far !== '' ? { near: +truth.near, far: +truth.far } : null;
  const matches = truthScore && finalScore && truthScore.near === finalScore.near && truthScore.far === finalScore.far;

  return (
    <section class="screen">
      <header class="screen-header">
        <h1>Phân tích video</h1>
        <span class="muted">Chạy lại nhận diện và chấm điểm trên video đã quay để kiểm tra và tinh chỉnh.</span>
      </header>

      <div class="row">
        <label class="file-button">
          {fileName ? 'Đổi video' : 'Mở video'}
          <input type="file" accept="video/*" onChange={(e) => e.currentTarget.files?.[0] && open(e.currentTarget.files[0])} />
        </label>
        {fileName && <span class="muted">{fileName}</span>}
      </div>
      {!calibration && <div class="notice warn">Chưa có calibrate. Mở video, dừng ở khung có sân rõ, bấm "Calibrate từ khung này".</div>}
      {error && <div class="notice warn">{error}</div>}

      {videoUrl && (
        <div class="analyze-layout">
          <div class="column">
            <video ref={videoRef} src={videoUrl} controls={status !== 'running'} muted class="playback" />
            <div class="row">
              {status === 'running' ? (
                <button onClick={() => (stopRef.current = true)}>Dừng</button>
              ) : (
                <button class="primary" disabled={!calibration || status === 'loading'} onClick={run}>
                  {status === 'loading' ? 'Đang tải mô hình…' : status === 'done' ? 'Phân tích lại' : 'Phân tích'}
                </button>
              )}
              <button onClick={grabFrame} disabled={status === 'running'}>
                Calibrate từ khung này
              </button>
              {calibration && <span class="muted">Calibrate: {calibration.name}</span>}
            </div>
            {status !== 'idle' && (
              <div class="progress">
                <div class="bar" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
            <div class="card">
              <div>
                <strong>Nhãn phát cầu</strong> · {labels.length} nhãn
              </div>
              <div class="muted">
                Xem lại video, mỗi lần có người phát cầu thì bấm <kbd>G</kbd> (đội gần phát) hoặc <kbd>X</kbd> (đội xa phát);{' '}
                <kbd>Z</kbd> xóa nhãn gần chỗ đang xem. Nhãn tự lưu theo tên file video.
              </div>
              <div class="row">
                <button onClick={exportLabels} disabled={labels.length === 0}>
                  Xuất nhãn
                </button>
                <label class="file-button">
                  Mở file nhãn
                  <input type="file" accept="application/json,.json" onChange={(e) => e.currentTarget.files?.[0] && importLabels(e.currentTarget.files[0])} />
                </label>
              </div>
              {labels.length > 0 && (
                <div class="label-list">
                  {labels.map((l) => (
                    <span key={l.t} class={`label-chip ${l.team}`}>
                      <button class="link" onClick={() => seek(l.t)}>
                        {formatVideoTime(l.t)} {teamName(l.team)}
                      </button>
                      <button class="link" aria-label="Xóa nhãn" onClick={() => updateLabels(labels.filter((x) => x !== l))}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div class="side">
            <MiniMap players={players} />
            {summary && (
              <div class="card">
                <div>
                  Tỉ số app chấm: <strong>{summary.state.score.near}-{summary.state.score.far}</strong> (gần–xa)
                  {finalScore && status === 'done' && (
                    <>
                      {' '}
                      · sau pha cuối: <strong>{finalScore.near}-{finalScore.far}</strong>
                    </>
                  )}
                </div>
                <div class="muted">
                  {summary.entries.length} lần phát nhận ra · {summary.pauses.length} lần dừng chuẩn bị phát · thấy đủ 4 người {Math.round(summary.fullFrameRatio * 100)}% khung hình
                </div>
                <div class="row">
                  Tỉ số thật:
                  <input class="score-input" type="number" placeholder="gần" value={truth.near} onInput={(e) => setTruth({ ...truth, near: e.currentTarget.value })} />
                  <input class="score-input" type="number" placeholder="xa" value={truth.far} onInput={(e) => setTruth({ ...truth, far: e.currentTarget.value })} />
                </div>
                {truthScore && finalScore && (
                  <div class={`notice ${matches ? 'success' : 'warn'}`}>{matches ? 'Khớp tỉ số thật' : 'Lệch tỉ số thật'}</div>
                )}
                <button onClick={exportJson}>Xuất JSON</button>
              </div>
            )}
          </div>
        </div>
      )}

      {summary && labels.length > 0 && (
        <section>
          <h2>So với nhãn</h2>
          <table class="history">
            <thead>
              <tr>
                <th>Cách nhận lần phát</th>
                <th>Đúng đội phát</th>
                <th>Đúng</th>
                <th>Sai</th>
                <th>Chưa rõ đội</th>
                <th>Bỏ lỡ</th>
                <th>Thừa</th>
              </tr>
            </thead>
            <tbody>
              <EvaluationRow name="Đội rời chỗ sau là đội phát" result={evaluateServeTeams(summary.serveGuesses, labels)} />
              <EvaluationRow
                name="Đội hình phát cầu"
                result={evaluateServeTeams(
                  summary.entries.map((e) => ({ t: e.observation.t, team: e.observation.servingTeam })),
                  labels,
                )}
              />
            </tbody>
          </table>
          <div class="muted">
            Ghép mỗi nhãn với lần phát app nhận ra cách không quá 3 giây. "Đúng đội phát" chỉ tính những lần app đã đoán đội.
          </div>
        </section>
      )}

      {summary && summary.serveGuesses.length > 0 && (
        <details>
          <summary>Đội phát đoán từ chuyển động ({summary.serveGuesses.length} pha)</summary>
          <div class="label-list">
            {summary.serveGuesses.map((g) => (
              <span key={g.t} class={`label-chip ${g.team ?? ''}`}>
                <button class="link" onClick={() => seek(g.t)}>
                  {formatVideoTime(g.t)} {teamName(g.team)}
                </button>
              </span>
            ))}
          </div>
        </details>
      )}

      {summary && summary.entries.length > 0 && (
        <table class="history">
          <thead>
            <tr>
              <th>Thời điểm</th>
              <th>Đội phát</th>
              <th>Ô</th>
              <th>Tỉ số sau</th>
            </tr>
          </thead>
          <tbody>
            {summary.entries.map((e) => (
              <tr
                key={e.observation.id}
                class="clickable"
                onClick={() => {
                  if (videoRef.current && status !== 'running') videoRef.current.currentTime = e.observation.t / 1000;
                }}
              >
                <td>{formatVideoTime(e.observation.t)}</td>
                <td>{e.observation.servingTeam === 'near' ? 'Gần' : e.observation.servingTeam === 'far' ? 'Xa' : 'chưa rõ'}</td>
                <td>{e.observation.court === 'right' ? 'Phải' : 'Trái'}</td>
                <td class="score-cell">
                  {e.scoreAfter.near}-{e.scoreAfter.far}
                  {e.scoreCertain ? '' : ' ?'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
