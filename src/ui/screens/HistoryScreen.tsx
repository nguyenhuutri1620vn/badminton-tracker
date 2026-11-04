import { useState } from 'preact/hooks';
import { matchesToCsv, sessionToJson } from '../../data/export';
import { useServices } from '../services';
import { downloadText, formatTime, teamLabel, useAppState } from '../context';

export function HistoryScreen() {
  const { session, matches } = useAppState();
  const { storage } = useServices();
  const [playing, setPlaying] = useState<{ name: string; url: string } | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const play = async (name: string) => {
    setVideoError(null);
    const file = await storage.openFile(name);
    if (!file) {
      setVideoError(`Không mở được ${name}. Kiểm tra thư mục lưu video trong màn hình Thiết bị (file tải về Downloads thì mở trực tiếp trong Finder).`);
      return;
    }
    setPlaying({ name, url: URL.createObjectURL(file) });
  };
  const closeVideo = () => {
    if (playing) URL.revokeObjectURL(playing.url);
    setPlaying(null);
  };

  if (!session) return <section class="screen center muted">Chưa có buổi chơi.</section>;
  const done = matches.filter((m) => m.endedAt !== null);
  const stamp = new Date(session.startedAt).toISOString().slice(0, 10);

  return (
    <section class="screen">
      <header class="screen-header">
        <h1>Lịch sử ván</h1>
        <div class="row">
          <button onClick={() => downloadText(`buoi-${stamp}.json`, sessionToJson(session, matches), 'application/json')}>
            Xuất JSON
          </button>
          <button onClick={() => downloadText(`ket-qua-${stamp}.csv`, matchesToCsv(session, done), 'text/csv')}>
            Xuất CSV
          </button>
        </div>
      </header>
      {videoError && <div class="notice warn">{videoError}</div>}
      {playing && (
        <div class="overlay" onClick={closeVideo}>
          <div class="dialog video-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{playing.name}</h3>
            <video src={playing.url} controls autoPlay class="playback" />
            <div class="actions">
              <button onClick={closeVideo}>Đóng</button>
            </div>
          </div>
        </div>
      )}
      {done.length === 0 ? (
        <p class="muted">Chưa có ván nào kết thúc.</p>
      ) : (
        <table class="history">
          <thead>
            <tr>
              <th>Ván</th>
              <th>Giờ</th>
              <th>Đội gần</th>
              <th>Tỉ số</th>
              <th>Đội xa</th>
              <th>Video</th>
            </tr>
          </thead>
          <tbody>
            {[...done].reverse().map((m) => (
              <tr key={m.id}>
                <td>{m.index}</td>
                <td>
                  {formatTime(m.startedAt)}–{formatTime(m.endedAt!)}
                </td>
                <td class={m.winner === 'near' ? 'win' : ''}>{teamLabel(session, m.lineup, 'near')}</td>
                <td class="score-cell">
                  {m.finalScore?.near ?? '-'} – {m.finalScore?.far ?? '-'}
                </td>
                <td class={m.winner === 'far' ? 'win' : ''}>{teamLabel(session, m.lineup, 'far')}</td>
                <td>
                  {m.videoFileName ? (
                    <div class="row">
                      {m.videoFileName.split(', ').map((name) => (
                        <button key={name} onClick={() => play(name)} title={name}>
                          Xem{m.videoFileName!.includes(', ') ? ` ${name.match(/phan(\d+)/)?.[1] ?? '1'}` : ''}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span class="muted">không có</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
