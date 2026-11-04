import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { courtLineSegments } from '../../core/court';
import { CORNER_LABELS, courtMapping, validateCorners, type Point } from '../../core/homography';
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

export function CalibrateScreen() {
  const model = useModel();
  const { calibration, calibrations } = useAppState();
  const { camera } = useServices();
  const cam = useCameraState();
  const [background, setBackground] = useState<Background | null>(null);
  const [corners, setCorners] = useState<Point[]>([]);
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
  const guideCorners = editing ? corners : (calibration?.imageCorners ?? []);
  const lines = useMemo(() => projectedLines(guideCorners), [guideCorners]);
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

  const startEditing = (bg: Background, initial: Point[] = []) => {
    setBackground(bg);
    setCorners(initial);
    setSaved(false);
  };

  const editExisting = (profile: CalibrationProfile) => {
    if (liveStream) {
      capture();
      setCorners(profile.imageCorners);
    } else {
      startEditing(
        { src: renderSampleCourt(), width: profile.imageWidth, height: profile.imageHeight },
        profile.imageCorners,
      );
    }
    setName(profile.name);
  };

  const save = async () => {
    if (!background || error || corners.length !== 4) return;
    await model.saveCalibration({
      name: name.trim() || 'Sân',
      imageWidth: background.width,
      imageHeight: background.height,
      imageCorners: corners,
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
              ? `Bấm ${CORNER_LABELS[corners.length]!.toLowerCase()} của sân đánh đôi (${corners.length + 1}/4).`
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
              <ol class="corner-list">
                {CORNER_LABELS.map((label, i) => (
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
                <button class="primary" disabled={corners.length !== 4 || Boolean(error)} onClick={save}>
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
