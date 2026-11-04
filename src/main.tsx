import { render } from 'preact';
import { AppModel } from './app/appModel';
import { Repository } from './data/repository';
import { CameraManager } from './media/cameraManager';
import { MatchVideoRecorder } from './media/matchVideoRecorder';
import { VideoStorage } from './media/videoStorage';
import { WakeLockGuard } from './media/wakeLock';
import { App } from './ui/App';
import { ModelContext } from './ui/context';
import { ServicesContext, type Services } from './ui/services';
import './ui/styles.css';

async function boot() {
  const repo = await Repository.open();
  const storage = new VideoStorage(repo);
  await storage.load();
  const camera = new CameraManager(repo);
  const wakeLock = new WakeLockGuard();
  const recorder = new MatchVideoRecorder(() => camera.current, storage);
  const services: Services = { camera, storage, wakeLock };

  const model = new AppModel({ repo, createRecorder: () => recorder });
  await model.init();

  // Giữ màn hình sáng khi có ván đang chơi.
  model.subscribe((state) => void (state.live.match ? wakeLock.acquire() : wakeLock.release()));
  if (model.getState().live.match) void wakeLock.acquire();

  // Camera kết nối lại giữa ván: ghi tiếp sang file video mới.
  camera.subscribe((cam) => {
    if (cam.status === 'on' && model.getState().live.match) void recorder.resumeAfterReconnect();
  });

  // Dùng khi gỡ lỗi trong DevTools.
  Object.assign(window, { app: model, services });

  render(
    <ServicesContext.Provider value={services}>
      <ModelContext.Provider value={model}>
        <App />
      </ModelContext.Provider>
    </ServicesContext.Provider>,
    document.getElementById('app')!,
  );
}

void boot();
