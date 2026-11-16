export type DrawPreference = { mode: 'free' | 'supporter'; clubId: number | null };
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

const DRAW_KEY = 'hindsight.drawPreference';

export function readDrawPreference(storage: PreferenceStorage): DrawPreference {
  try {
    const saved = JSON.parse(storage.getItem(DRAW_KEY) || 'null');
    if (saved?.mode === 'supporter' || saved?.mode === 'free') {
      return { mode: saved.mode, clubId: Number.isSafeInteger(saved.clubId) && saved.clubId > 0 ? saved.clubId : null };
    }
  } catch {
    // An invalid saved preference must not prevent the game from loading.
  }
  return { mode: 'free', clubId: null };
}

export function saveDrawPreference(storage: PreferenceStorage, preference: DrawPreference): void {
  storage.setItem(DRAW_KEY, JSON.stringify(preference));
}
