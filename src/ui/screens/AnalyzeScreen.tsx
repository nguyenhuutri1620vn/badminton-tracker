import { useEffect, useRef, useState } from 'preact/hooks';
import { getPoseLandmarker } from '../../cv/poseRunner';
import { TiledPoseDetector } from '../../cv/tiledPose';
import { VideoAnalysis, formatVideoTime, type AnalysisSummary } from '../../cv/videoAnalysis';
import type { PlayerSample } from '../../core/serveFormation';
import type { Score } from '../../core/types';
import { MiniMap } from '../components/MiniMap';
import { downloadText, useAppState, useModel } from '../context';

/** Phân tích 8 khung mỗi giây của video: mỗi khung chạy nhận diện trên nhiều ô nên khá chậm. */
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

  useEffect(() => () => void (videoUrl && URL.revokeObjectURL(videoUrl)), [videoUrl]);

  const open = (file: File) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setFileName(file.name);
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

  /** Tua từng bước 1/8 giây và chạy pose trên từng khung (chậm hơn thời gian thực nhưng không bỏ khung nào). */
  const run = async () => {
    const video = videoRef.current;
    if (!video || !calibration) return;
    setError(null);
    setStatus('loading');
    let landmarker;
    try {
      landmarker = await getPoseLandmarker();
    } catch (e) {
      setError(`Không tải được mô hình nhận diện người: ${(e as Error).message}`);
      setStatus('idle');
      return;
    }
    const analysis = new VideoAnalysis(calibration);
    const pose = new TiledPoseDetector(landmarker, calibration);
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
      analysis.processFrame(time * 1000, pose.detect(video));
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
      observations: summary.entries.map((e) => ({
        time: formatVideoTime(e.observation.t),
        t: e.observation.t,
        servingTeam: e.observation.servingTeam,
        court: e.observation.court,
        courtPlayers: e.observation.courtPlayers,
        scoreAfter: e.scoreAfter,
        scoreCertain: e.scoreCertain,
      })),
    };
    downloadText(`phan-tich-${(fileName ?? 'video').replace(/\.[^.]+$/, '')}.json`, JSON.stringify(data, null, 2), 'application/json');
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
                  {summary.entries.length} lần phát · thấy đủ 4 người {Math.round(summary.fullFrameRatio * 100)}% khung hình
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
