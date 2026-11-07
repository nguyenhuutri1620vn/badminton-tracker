import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { courtLineSegments } from '../../core/court';
import {
  CORNER_LABELS,
  cornersFromReference,
  courtMapping,
  referenceFromCorners,
  validateCorners,
  type NearReferenceLine,
  type Point,
} from '../../core/homography';
import type { CalibrationProfile } from '../../data/types';
import { formatTime, useAppState, useModel } from '../context';
import { renderSampleCourt, SAMPLE_SIZE } from '../sampleCourt';
import { useCameraState, useServices } from '../services';

interface Background {
  src: string;
  width: number;
  height: number;
}

/** Vạch sân chiếu lên ảnh theo 4 góc; null nếu 4 góc chưa hợp lệ. */
function projectedLines(corners: Point[]): [Point, Point][] | null {
  if (validateCorners(corners)) return null;
  try {
    const mapping = courtMapping(corners);
    return courtLineSegments().map(([a, b]) => [mapping.toImage(a), mapping.toImage(b)]);
  } catch {
    return null;
  }
}

const NEAR_LINE_NAMES: Record<NearReferenceLine, string> = {
  baseline: 'biên cuối',
  doublesLongService: 'vạch giao cầu dài đánh đôi',
  shortService: 'vạch giao cầu ngắn',
};

/** Tên 4 điểm cần bấm theo vạch phía gần đã chọn. */
function pointLabels(line: NearReferenceLine): string[] {
  if (line === 'baseline') return CORNER_LABELS;
  const name = NEAR_LINE_NAMES[line];
  return [`Đầu trái ${name} (phía gần)`, `Đầu phải ${name} (phía gần)`, CORNER_LABELS[2]!, CORNER_LABELS[3]!];
}

/** 4 góc sân từ các điểm đã bấm; null nếu chưa đủ hoặc chưa hợp lệ. */
function courtCornersOf(points: Point[], line: NearReferenceLine): Point[] | null {
  if (points.length !== 4 || validateCorners(points)) return null;
  try {
    return cornersFromReference(points, line);
  } catch {
    return null;
  }
}

const insideImage = (points: Point[], width: number, height: number) =>
  points.every(([x, y]) => x >= 0 && x <= width && y >= 0 && y <= height);

export function CalibrateScreen() {
  const model = useModel();
  const { calibration, calibrations } = useAppState();
  const { camera } = useServices();
  const cam = useCameraState();
  const [background, setBackground] = useState<Background | null>(null);
  /** Các điểm host đã bấm/kéo, theo vạch phía gần nearLine. */
  const [corners, setCorners] = useState<Point[]>([]);
  const [nearLine, setNearLine] = useState<NearReferenceLine>('baseline');
  const [name, setName] = useState('Sân của tôi');
  const [dragging, setDragging] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Khung hình gửi từ màn hình Phân tích video.
  useEffect(() => {
    const image = model.consumeCalibrationImage();
    if (image) startEditing(image);
  }, [model]);

  const liveStream = cam.status === 'on' ? camera.current : null;
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = liveStream;
  }, [liveStream, background]);

  // Đang căn camera: dùng kích thước camera; đang chấm góc: dùng kích thước ảnh.
  const size = background ?? (cam.width && cam.height ? { width: cam.width, height: cam.height } : SAMPLE_SIZE);
  const editing = background !== null;
  const courtCorners = useMemo(() => courtCornersOf(corners, nearLine), [corners, nearLine]);
  const guideCorners = editing ? (courtCorners ?? []) : (calibration?.imageCorners ?? []);
  const lines = useMemo(() => projectedLines(guideCorners), [guideCorners]);
  const labels = pointLabels(nearLine);
  const error = editing && corners.length === 4 ? validateCorners(corners) : null;

  const toImagePoint = (event: PointerEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [
      ((event.clientX - rect.left) / rect.width) * size.width,
      ((event.clientY - rect.top) / rect.height) * size.height,
    ];
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    startEditing({ src: canvas.toDataURL('image/jpeg', 0.9), width: canvas.width, height: canvas.height });
  };

  const loadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => startEditing({ src: url, width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
  };

  const startEditing = (bg: Background, initial: Point[] = [], line: NearReferenceLine = 'baseline') => {
    setBackground(bg);
    setCorners(initial);
    setNearLine(line);
    setSaved(false);
  };

  /** Đổi vạch phía gần: nếu đã đủ 4 điểm thì đổi các điểm sang vạch mới, giữ nguyên sân. */
  const changeNearLine = (line: NearReferenceLine) => {
    if (courtCorners) setCorners(referenceFromCorners(courtCorners, line));
    else if (corners.length > 2) setCorners(corners.slice(0, 2));
    setNearLine(line);
  };

  const editExisting = (profile: CalibrationProfile) => {
    // Góc gần nằm ngoài ảnh thì không kéo được: chuyển sang vạch phía gần đầu tiên nhìn thấy được.
    const candidates: NearReferenceLine[] = ['baseline', 'doublesLongService', 'shortService'];
    const line =
      candidates.find((l) => insideImage(referenceFromCorners(profile.imageCorners, l), profile.imageWidth, profile.imageHeight)) ??
      'baseline';
    const points = referenceFromCorners(profile.imageCorners, line);
    if (liveStream) {
      capture();
      setCorners(points);
      setNearLine(line);
    } else {
      startEditing({ src: renderSampleCourt(), width: profile.imageWidth, height: profile.imageHeight }, points, line);
    }
    setName(profile.name);
  };

  const save = async () => {
    if (!background || error || !courtCorners) return;
    await model.saveCalibration({
      name: name.trim() || 'Sân',
      imageWidth: background.width,
      imageHeight: background.height,
      imageCorners: courtCorners,
    });
    setBackground(null);
    setCorners([]);
    setSaved(true);
  };

  return (
    <section class="screen">
      <header class="screen-header">
        <h1>Calibrate sân</h1>
        <span class="muted">
          {editing
            ? corners.length < 4
              ? `Bấm ${labels[corners.length]!.toLowerCase()} (sân đánh đôi, ${corners.length + 1}/4).`
              : 'Kéo các điểm để khớp góc sân. Lưới vàng phải trùng các vạch trên sân.'
            : 'Căn camera sao cho lưới vàng trùng vạch sân, hoặc chụp khung hình để calibrate mới.'}
        </span>
      </header>

      <div class="calibrate-layout">
        <div class="calibrate-stage" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
          {editing ? (
            <img src={background.src} alt="Khung hình sân" />
          ) : liveStream ? (
            <video ref={videoRef} autoPlay muted playsInline />
          ) : (
            <div class="stage-empty muted">Chưa có hình. Kết nối camera ở màn hình Thiết bị, hoặc dùng ảnh.</div>
          )}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${size.width} ${size.height}`}
            preserveAspectRatio="none"
            onPointerDown={(e) => {
              if (editing && corners.length < 4) setCorners([...corners, toImagePoint(e)]);
            }}
            onPointerMove={(e) => {
              if (dragging === null) return;
              const p = toImagePoint(e);
              setCorners((prev) => prev.map((c, i) => (i === dragging ? p : c)));
            }}
            onPointerUp={() => setDragging(null)}
            onPointerLeave={() => setDragging(null)}
          >
            {lines?.map(([[x1, y1], [x2, y2]], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} class="guide-line" />
            ))}
            {editing &&
              corners.map(([x, y], i) => (
                <g key={i}>
                  <circle
                    cx={x}
                    cy={y}
                    r={size.width / 90}
                    class="corner-handle"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                      setDragging(i);
                    }}
                  />
                  <text x={x} y={y - size.width / 55} class="corner-label" style={{ fontSize: `${size.width / 50}px` }}>
                    {i + 1}
                  </text>
                </g>
              ))}
          </svg>
        </div>

        <aside class="card">
          {editing ? (
            <>
              <h3>Calibrate mới</h3>
              <label>
                Vạch phía gần để bấm
                <select value={nearLine} onChange={(e) => changeNearLine(e.currentTarget.value as NearReferenceLine)}>
                  <option value="baseline">Biên cuối (góc sân)</option>
                  <option value="doublesLongService">Vạch giao cầu dài đánh đôi (cách biên cuối 0,76 m)</option>
                  <option value="shortService">Vạch giao cầu ngắn (cách lưới 1,98 m)</option>
                </select>
              </label>
              <p class="muted">Không thấy biên cuối gần trong khung hình thì chọn vạch khác; app tự suy ra góc sân.</p>
              <ol class="corner-list">
                {labels.map((label, i) => (
                  <li key={label} class={i < corners.length ? 'done' : ''}>
                    {label}
                  </li>
                ))}
              </ol>
              {error && <div class="notice warn">{error}</div>}
              <label>
                Tên
                <input value={name} onInput={(e) => setName(e.currentTarget.value)} />
              </label>
              <div class="row">
                <button class="primary" disabled={!courtCorners || Boolean(error)} onClick={save}>
                  Lưu
                </button>
                <button onClick={() => setCorners(corners.slice(0, -1))} disabled={corners.length === 0}>
                  Bỏ điểm cuối
                </button>
                <button onClick={() => setBackground(null)}>Hủy</button>
              </div>
            </>
          ) : (
            <>
              <h3>Calibrate mới</h3>
              {saved && <div class="notice success">Đã lưu và đặt làm calibrate đang dùng.</div>}
              <div class="row">
                <button class="primary" disabled={!liveStream} onClick={capture}>
                  Chụp khung hình camera
                </button>
                <label class="file-button">
                  Dùng ảnh/khung hình
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      if (file) loadFile(file);
                    }}
                  />
                </label>
                <button onClick={() => startEditing({ src: renderSampleCourt(), ...SAMPLE_SIZE })}>Ảnh sân mẫu</button>
              </div>

              <h3>Đã lưu</h3>
              {calibrations.length === 0 ? (
                <p class="muted">Chưa có. Mỗi lần đặt camera ở vị trí mới thì calibrate một lần.</p>
              ) : (
                <ul class="profile-list">
                  {calibrations.map((p) => (
                    <li key={p.id} class={p.id === calibration?.id ? 'active' : ''}>
                      <span class="grow">
                        <strong>{p.name}</strong>
                        <span class="muted">
                          {' '}
                          · {p.imageWidth}×{p.imageHeight} · {formatTime(p.createdAt)}
                        </span>
                      </span>
                      {p.id === calibration?.id ? (
                        <span class="badge">đang dùng</span>
                      ) : (
                        <button onClick={() => model.useCalibration(p.id)}>Dùng</button>
                      )}
                      <button onClick={() => editExisting(p)}>Chỉnh</button>
                    </li>
                  ))}
                </ul>
              )}
              {calibration && cam.width && (cam.width !== calibration.imageWidth || cam.height !== calibration.imageHeight) && (
                <div class="notice warn">
                  Độ phân giải camera ({cam.width}×{cam.height}) khác lúc calibrate ({calibration.imageWidth}×
                  {calibration.imageHeight}); nên calibrate lại.
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
