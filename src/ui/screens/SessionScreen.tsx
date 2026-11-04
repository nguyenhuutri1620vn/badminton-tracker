import { useState } from 'preact/hooks';
import { activePlayers, gamesPlayed } from '../../app/session';
import { useAppState, useModel, formatTime } from '../context';

export function SessionScreen() {
  const model = useModel();
  const { session, matches } = useAppState();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  if (!session) {
    return (
      <section class="screen center">
        <h1>Buổi chơi mới</h1>
        <p class="muted">Bắt đầu buổi, thêm người chơi, rồi chọn 4 người cho từng ván.</p>
        <button class="primary big" onClick={() => model.newSession()}>
          Bắt đầu buổi chơi
        </button>
      </section>
    );
  }

  const counts = gamesPlayed(session, matches);
  const add = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    await model.addPlayer(name);
    if (!model.getState().error) setName('');
  };

  return (
    <section class="screen">
      <header class="screen-header">
        <h1>Người chơi</h1>
        <span class="muted">
          Bắt đầu {formatTime(session.startedAt)} · {activePlayers(session).length} người có mặt · {matches.length} ván
        </span>
      </header>

      <form class="row" onSubmit={add}>
        <input
          placeholder="Tên người chơi (kể cả người đến muộn)"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
          autoFocus
        />
        <button class="primary" type="submit">
          Thêm
        </button>
      </form>

      <ul class="player-list">
        {session.players.map((p) => (
          <li key={p.id} class={p.leftAt ? 'left' : ''}>
            {editing?.id === p.id ? (
              <form
                class="row grow"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await model.renamePlayer(p.id, editing.name);
                  if (!model.getState().error) setEditing(null);
                }}
              >
                <input value={editing.name} onInput={(e) => setEditing({ id: p.id, name: e.currentTarget.value })} />
                <button type="submit">Lưu</button>
              </form>
            ) : (
              <>
                <span class="grow">
                  <strong>{p.name}</strong>
                  <span class="muted">
                    {' '}
                    · {counts.get(p.id) ?? 0} ván{p.joinedAt > session.startedAt + 60_000 ? ` · đến lúc ${formatTime(p.joinedAt)}` : ''}
                    {p.leftAt ? ` · đã về lúc ${formatTime(p.leftAt)}` : ''}
                  </span>
                </span>
                <button onClick={() => setEditing({ id: p.id, name: p.name })}>Đổi tên</button>
                {p.leftAt ? (
                  <button onClick={() => model.markReturned(p.id)}>Quay lại</button>
                ) : (
                  <button onClick={() => model.markLeft(p.id)}>Về sớm</button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      <footer class="row">
        <button class="primary big" disabled={activePlayers(session).length < 4} onClick={() => model.navigate('setup')}>
          Chuẩn bị ván
        </button>
        <button
          class="danger"
          onClick={() => {
            if (confirm('Kết thúc buổi chơi? Dữ liệu vẫn được giữ trong Lịch sử.')) void model.finishSession();
          }}
        >
          Kết thúc buổi
        </button>
      </footer>
    </section>
  );
}
