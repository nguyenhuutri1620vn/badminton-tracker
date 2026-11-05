import { useEffect, useState } from 'preact/hooks';
import { MANUAL_CHECKS, buildChecklist, isReady } from '../../app/checklist';
import { activePlayers } from '../../app/session';
import { hasLocalModel } from '../../cv/personDetector';
import { CameraPreview } from '../components/CameraPreview';
import { useAppState } from '../context';
import { useCameraState, useServices } from '../services';

const MANUAL_KEY = 'checklist-manual';

/** Đánh dấu các mục kiểm tra bằng mắt; nhớ theo buổi chơi trong trình duyệt. */
function loadManual(sessionId: string | null): Record<string, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(MANUAL_KEY) ?? '{}');
    return saved.sessionId === sessionId ? saved.checks : {};
  } catch {
    return {};
  }
}

function saveManual(sessionId: string | null, checks: Record<string, boolean>): void {
  try {
    localStorage.setItem(MANUAL_KEY, JSON.stringify({ sessionId, checks }));
  } catch {
    // Không lưu được thì chỉ mất dấu tích khi tải lại trang.
  }
}

const STATUS_LABEL = {
  off: 'Chưa kết nối',
  connecting: 'Đang kết nối…',
  on: 'Đang hoạt động',
  lost: 'Mất kết nối, đang thử lại',
  error: 'Lỗi',
} as const;

export function DevicesScreen() {
  const { camera, storage, wakeLock } = useServices();
  const { session, calibration } = useAppState();
  const cam = useCameraState();
  const [localModel, setLocalModel] = useState(false);
  const [manual, setManual] = useState(() => loadManual(session?.id ?? null));

  useEffect(() => {
    void hasLocalModel().then(setLocalModel);
  }, []);
  const [folder, setFolder] = useState(storage.directoryName);
  const [folderOk, setFolderOk] = useState<boolean | null>(null);

  useEffect(() => {
    void storage.ensurePermission().then(setFolderOk);
  }, [storage, folder]);

  const chooseFolder = async () => {
    try {
      setFolder(await storage.chooseDirectory());
      setFolderOk(true);
    } catch {
      // Host bấm Hủy trong hộp chọn thư mục.
    }
  };

  const checklist = buildChecklist({
    cameraStatus: cam.status,
    cameraLabel: cam.label,
    cameraSize: cam.width && cam.height ? { width: cam.width, height: cam.height } : null,
    calibration,
    videoFolder: folder,
    videoFolderWritable: folderOk !== false,
    wakeLockSupported: wakeLock.supported,
    localModel,
    activePlayers: session ? activePlayers(session).length : 0,
    manual,
  });
  const manualIds = new Set(MANUAL_CHECKS.map((c) => c.id));
  const toggleManual = (id: string) => {
    const next = { ...manual, [id]: !manual[id] };
    setManual(next);
    saveManual(session?.id ?? null, next);
  };

  return (
    <section class="screen">
      <header class="screen-header">
        <h1>Thiết bị và kiểm tra</h1>
        <span class="muted">Làm lần lượt trước mỗi buổi chơi.</span>
      </header>

      <div class="card">
        <h3>
          Kiểm tra trước buổi{' '}
          <span class={isReady(checklist) ? 'badge' : 'muted small'}>
            {isReady(checklist) ? '· sẵn sàng' : `· còn ${checklist.filter((i) => i.status === 'todo').length} việc`}
          </span>
        </h3>
        <ul class="checklist">
          {checklist.map((item) => (
            <li key={item.id} class={item.status}>
              {manualIds.has(item.id) ? (
                <label class="check-row">
                  <input type="checkbox" checked={item.status === 'ok'} onChange={() => toggleManual(item.id)} />
                  <span>{item.label}</span>
                </label>
              ) : (
                <span class="check-row">
                  <span class="check-icon">{item.status === 'ok' ? '✓' : item.status === 'warn' ? '!' : '○'}</span>
                  <span>{item.label}</span>
                </span>
              )}
              {item.hint && item.status !== 'ok' && <span class="muted small">{item.hint}</span>}
            </li>
          ))}
        </ul>
      </div>

      <div class="device-grid">
        <div class="card">
          <h3>Camera</h3>
          <div class={`status ${cam.status}`}>{STATUS_LABEL[cam.status]}</div>
          {cam.label && (
            <div class="muted">
              {cam.label}
              {cam.width ? ` · ${cam.width}×${cam.height}` : ''}
            </div>
          )}
          {cam.error && <div class="notice warn">{cam.error}</div>}
          <div class="row">
            <select
              value={cam.deviceId ?? ''}
              onChange={(e) => void camera.connect(e.currentTarget.value || undefined)}
              disabled={cam.devices.length === 0}
            >
              {cam.devices.length === 0 && <option value="">Chưa đọc được danh sách camera</option>}
              {cam.devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
            {cam.status === 'on' ? (
              <button onClick={() => camera.disconnect()}>Ngắt</button>
            ) : (
              <>
                <button class="primary" onClick={() => void camera.connect()}>
                  Kết nối camera
                </button>
                <button onClick={() => void camera.connectScreen()} title="Thử app bằng video trận đấu đang mở ở tab khác (ví dụ YouTube)">
                  Dùng tab/màn hình
                </button>
              </>
            )}
          </div>
          <CameraPreview stream={cam.status === 'on' ? camera.current : null} />
          <p class="muted small">
            iPhone cần mở khóa, cùng Apple ID, bật Wi‑Fi và Bluetooth, đặt gần Mac. Nên cắm cáp để sạc trong lúc quay.
          </p>
        </div>

        <div class="card">
          <h3>Thư mục lưu video</h3>
          {storage.supported ? (
            <>
              <div>
                {folder ? (
                  <>
                    <strong>{folder}</strong>{' '}
                    {folderOk === false && <span class="muted">(cần cấp lại quyền ghi)</span>}
                  </>
                ) : (
                  <span class="muted">Chưa chọn: video sẽ được tải về thư mục Downloads khi kết thúc ván.</span>
                )}
              </div>
              <div class="row">
                <button class="primary" onClick={chooseFolder}>
                  {folder ? 'Đổi thư mục' : 'Chọn thư mục'}
                </button>
                {folder && folderOk === false && (
                  <button onClick={async () => setFolderOk(await storage.ensurePermission(true))}>Cấp quyền ghi</button>
                )}
              </div>
            </>
          ) : (
            <p class="muted">Trình duyệt này không chọn được thư mục; hãy dùng Chrome. Video sẽ được tải về khi kết thúc ván.</p>
          )}

          <h3>Giữ màn hình sáng</h3>
          <p class="muted">
            {wakeLock.supported
              ? 'Tự bật khi bắt đầu ván, tắt khi kết thúc ván.'
              : 'Trình duyệt không hỗ trợ; hãy tắt chế độ ngủ của Mac trong lúc chơi.'}
          </p>
        </div>
      </div>
    </section>
  );
}
