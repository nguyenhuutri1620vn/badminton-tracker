import { COURT, courtLineSegments } from '../../core/court';
import type { PlayerSample } from '../../core/serveFormation';

const COLORS: Record<string, string> = {
  blue: 'var(--blue)',
  red: 'var(--red)',
  purple: 'var(--purple)',
  yellow: 'var(--yellow)',
};

/** Sân thu nhỏ nhìn từ trên xuống: đội gần camera ở dưới, đội xa ở trên. */
export function MiniMap({ players, names }: { players: PlayerSample[]; names?: Record<string, string> }) {
  const { width, length, netY } = COURT;
  const y = (meters: number) => length - meters;
  const pad = 0.6;
  // Bỏ biên ngoài và lưới (vẽ riêng) khỏi danh sách vạch.
  const lines = courtLineSegments().slice(4, -1);
  return (
    <svg class="minimap" viewBox={`${-pad} ${-pad} ${width + pad * 2} ${length + pad * 2}`} role="img" aria-label="Mini map">
      <rect x={0} y={0} width={width} height={length} class="court-floor" />
      {lines.map(([[x1, y1], [x2, y2]], i) => (
        <line key={i} x1={x1} y1={y(y1)} x2={x2} y2={y(y2)} class="court-line" />
      ))}
      <rect x={0} y={0} width={width} height={length} class="court-line" fill="none" />
      <line x1={-0.3} y1={y(netY)} x2={width + 0.3} y2={y(netY)} class="court-net" />
      {players.map((p) => (
        <g key={p.id} transform={`translate(${p.x} ${y(p.y)})`}>
          <circle r={0.32} fill={COLORS[p.id] ?? 'var(--muted)'} class="player-dot" />
          {names?.[p.id] && (
            <text y={-0.5} class="player-label">
              {names[p.id]}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
