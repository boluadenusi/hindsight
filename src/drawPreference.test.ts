import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readDrawPreference, saveDrawPreference, type PreferenceStorage } from './drawPreference.ts';

function storage(initial: string | null = null): PreferenceStorage {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
  };
}

describe('draw preference', () => {
  it('defaults to free for all for missing or invalid saved preferences', () => {
    assert.deepEqual(readDrawPreference(storage()), { mode: 'free', clubId: null });
    assert.deepEqual(readDrawPreference(storage('{')), { mode: 'free', clubId: null });
  });

  it('persists supporter selection and remembers a club in free for all', () => {
    const saved = storage();
    saveDrawPreference(saved, { mode: 'supporter', clubId: 7 });
    assert.deepEqual(readDrawPreference(saved), { mode: 'supporter', clubId: 7 });
    saveDrawPreference(saved, { mode: 'free', clubId: 7 });
    assert.deepEqual(readDrawPreference(saved), { mode: 'free', clubId: 7 });
  });

  it('rejects invalid club ids instead of sending them to the archive', () => {
    assert.deepEqual(readDrawPreference(storage('{"mode":"supporter","clubId":-1}')), { mode: 'supporter', clubId: null });
  });
});
