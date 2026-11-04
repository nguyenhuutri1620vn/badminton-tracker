import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { AppModel, AppState } from '../app/appModel';
import type { Lineup, Session } from '../data/types';

export const ModelContext = createContext<AppModel | null>(null);

export function useModel(): AppModel {
  const model = useContext(ModelContext);
  if (!model) throw new Error('Thiếu AppModel');
  return model;
}

export function useAppState(): AppState {
  const model = useModel();
  const [state, setState] = useState(model.getState());
  useEffect(() => model.subscribe(setState), [model]);
  return state;
}

export function playerName(session: Session | null, id: string | undefined): string {
  return session?.players.find((p) => p.id === id)?.name ?? '?';
}

export function teamLabel(session: Session | null, lineup: Lineup, team: 'near' | 'far'): string {
  const ids = team === 'near' ? [lineup.blue, lineup.red] : [lineup.purple, lineup.yellow];
  return ids.map((id) => playerName(session, id)).join(' + ');
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
