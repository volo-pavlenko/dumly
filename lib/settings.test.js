import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// Mock chrome.storage.{sync,local} as in-memory KV stores.
function makeStorageArea() {
  let store = {};
  return {
    _store: () => store,
    _reset: () => { store = {}; },
    get: (keys, cb) => {
      if (keys === null) { cb({ ...store }); return; }
      if (typeof keys === 'string') { cb({ [keys]: store[keys] }); return; }
      const out = {};
      for (const k of Object.keys(keys)) {
        out[k] = Object.prototype.hasOwnProperty.call(store, k) ? store[k] : keys[k];
      }
      cb(out);
    },
    set: (items, cb) => { Object.assign(store, items); cb && cb(); },
    remove: (keys, cb) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) delete store[k];
      cb && cb();
    },
  };
}

beforeAll(async () => {
  globalThis.window = globalThis;
  globalThis.chrome = {
    storage: { sync: makeStorageArea(), local: makeStorageArea() },
  };
  await import('./settings.js');
});

beforeEach(() => {
  chrome.storage.sync._reset();
  chrome.storage.local._reset();
});

describe('mergePersonasToBio', () => {
  it('joins non-empty personas with blank line', () => {
    const { mergePersonasToBio } = window.Dumly.settings;
    expect(mergePersonasToBio('A', 'B')).toBe('A\n\nB');
    expect(mergePersonasToBio('A', '')).toBe('A');
    expect(mergePersonasToBio('', 'B')).toBe('B');
    expect(mergePersonasToBio('', '')).toBe('');
  });
});

describe('runMigrationV2', () => {
  it('seeds userProfile.bio from persona + quotePersona then removes them', async () => {
    chrome.storage.sync._store().persona = 'witty concise replies';
    chrome.storage.sync._store().quotePersona = 'quote in my voice';

    await window.Dumly.settings.runMigrationV2();

    expect(chrome.storage.local._store().userProfile.bio)
      .toBe('witty concise replies\n\nquote in my voice');
    expect(chrome.storage.sync._store().persona).toBeUndefined();
    expect(chrome.storage.sync._store().quotePersona).toBeUndefined();
    expect(chrome.storage.local._store().migrationV2Done).toBe(true);
  });

  it('is idempotent: second run does not overwrite an existing userProfile', async () => {
    chrome.storage.sync._store().persona = 'legacy';
    await window.Dumly.settings.runMigrationV2();

    // User customizes their profile after migration.
    chrome.storage.local._store().userProfile.bio = 'user-edited bio';

    await window.Dumly.settings.runMigrationV2();

    expect(chrome.storage.local._store().userProfile.bio).toBe('user-edited bio');
  });

  it('preserves an existing userProfile if one already exists before migration', async () => {
    chrome.storage.sync._store().persona = 'legacy';
    chrome.storage.local._store().userProfile = {
      id: 'default', bio: 'pre-existing', tone: '', preferredAngles: [], avoidPatterns: [], updatedAt: 0,
    };

    await window.Dumly.settings.runMigrationV2();

    expect(chrome.storage.local._store().userProfile.bio).toBe('pre-existing');
    expect(chrome.storage.sync._store().persona).toBeUndefined();
  });

  it('seeds default memorySettings when absent, preserves existing', async () => {
    await window.Dumly.settings.runMigrationV2();
    expect(chrome.storage.sync._store().memorySettings).toEqual({
      useProfile: true, learnFromUse: true, learnFromCopy: true, rememberNegatives: true,
    });

    // Reset, pre-set a custom memorySettings, rerun with a fresh migration flag.
    chrome.storage.sync._reset();
    chrome.storage.local._reset();
    chrome.storage.sync._store().memorySettings = { useProfile: false, learnFromUse: true, learnFromCopy: true, rememberNegatives: true };
    await window.Dumly.settings.runMigrationV2();
    expect(chrome.storage.sync._store().memorySettings.useProfile).toBe(false);
  });
});
