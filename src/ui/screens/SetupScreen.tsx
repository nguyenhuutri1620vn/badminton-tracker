import { useMemo, useState } from 'preact/hooks';
import { activePlayers, gamesPlayed, validateLineup } from '../../app/session';
import { PLAYER_COLORS, type Lineup, type PlayerColor } from '../../data/types';
import { useAppState, useModel } from '../context';

const COLOR_LABEL: Record<PlayerColor, string> = { blue: 'Xanh', red: 'Đỏ', purple: 'Tím', yellow: 'Vàng' };

export function SetupScreen() {
  const model = useModel();
  const { session, matches } = useAppState();
  const [lineup, setLineup] = useState<Partial<Lineup>>({});

  const counts = useMemo(() => (session ? gamesPlayed(session, matches) : new Map<string, number>()), [session, matches]);
  if (!session) return null;

  // Gợi ý thứ tự: ít ván nhất lên trước (host vẫn tự chọn).
  const players = [...activePlayers(session)].sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0));
  const colorOf = (id: string) => PLAYER_COLORS.find((c) => lineup[c] === id);

  /** Bấm một người: gán vào màu trống đầu tiên; bấm lại để bỏ. */
  const toggle = (id: string) =>
    setLineup((prev) => {
      const current = PLAYER_COLORS.find((c) => prev[c] === id);
      if (current) return { ...prev, [current]: undefined };
      const free = PLAYER_COLORS.find((c) => !prev[c]);
      return free ? { ...prev, [free]: id } : prev;
    });

  const errors = validateLineup(session, lineup);
  const swapTeams = () =>
    setLineup((prev) => ({ blue: prev.purple, red: prev.yellow, purple: prev.blue, yellow: prev.red }));

  return (
    <section class="screen">
      <header class="screen-header">
        <h1>Ván {matches.length + 1}</h1>
        <span class="muted">Bấm 4 người theo thứ tự xanh, đỏ (đội gần camera), tím, vàng (đội xa).</span>
      </header>

      <div class="lineup">
        {(['near', 'far'] as const).map((team) => (
          <div class="lineup-team" key={team}>
            <h3>{team === 'near' ? 'Đội gần camera' : 'Đội xa camera'}</h3>
            {PLAYER_COLORS.filter((c) => (team === 'near') === (c === 'blue' || c === 'red')).map((c) => (
              <div class={`slot ${c}`} key={c}>
                <span class="dot" />
                {COLOR_LABEL[c]}: <strong>{lineup[c] ? session.players.find((p) => p.id === lineup[c])?.name : '—'}</strong>
              </div>
            ))}
          </div>
        ))}
      </div>

      <ul class="chips">
        {players.map((p) => {
          const color = colorOf(p.id);
          return (
            <li key={p.id}>
              <button class={`chip ${color ?? ''}`} onClick={() => toggle(p.id)}>
                {color && <span class="dot" />}
                {p.name} <span class="muted">{counts.get(p.id) ?? 0} ván</span>
              </button>
            </li>
          );
        })}
      </ul>

      <footer class="row">
        <button
          class="primary big"
          disabled={errors.length > 0}
          title={errors.join('. ')}
          onClick={() => model.startMatch(lineup as Lineup)}
        >
          Start
        </button>
        <button onClick={swapTeams}>Đổi đội gần/xa</button>
        <button onClick={() => setLineup({})}>Chọn lại</button>
      </footer>
    </section>
  );
}
