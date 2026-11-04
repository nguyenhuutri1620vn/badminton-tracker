import { useEffect, useState } from 'preact/hooks';
import { CameraPreview } from '../components/CameraPreview';
import { useCameraState, useServices } from '../services';

const STATUS_LABEL = {
  off: 'Chưa kết nối',
  connecting: 'Đang kết nối…',
  on: 'Đang hoạt động',
  lost: 'Mất kết nối, đang thử lại',
  error: 'Lỗi',
} as const;

export function DevicesScreen() {
  const { camera, storage, wakeLock } = useServices();
  const cam = useCameraState();
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

  return (
    <section class="screen">
      <header class="screen-header">
        <h1>Thiết bị</h1>
        <span class="muted">Kết nối iPhone qua Continuity Camera và chọn nơi lưu video trước buổi chơi.</span>
      </header>

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
              <button class="primary" onClick={() => void camera.connect()}>
                Kết nối camera
              </button>
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
