(function () {
  const root = (typeof window !== "undefined") ? window
    : (typeof self !== "undefined") ? self
    : globalThis;
  root.Dumly = root.Dumly || {};

  const DEFAULT_SETTINGS = {
    apiKey: '',
    model: 'gpt-5.4-mini',
    memorySettings: {
      useProfile: true,
      learnFromUse: true,
      learnFromCopy: true,
      rememberNegatives: true,
    },
  };

  const DEFAULT_PROFILE = {
    id: 'default',
    bio: '',
    tone: '',
    preferredAngles: [],
    avoidPatterns: [],
    updatedAt: 0,
  };

  function mergePersonasToBio(persona, quotePersona) {
    return [persona, quotePersona].filter(Boolean).join('\n\n');
  }

  function getSync() {
    if (!chrome?.storage?.sync) return Promise.reject(new Error('storage unavailable'));
    return new Promise((resolve) => {
      chrome.storage.sync.get(null, resolve);
    });
  }

  function setSync(obj) {
    return new Promise((resolve) => chrome.storage.sync.set(obj, resolve));
  }

  function removeSync(keys) {
    return new Promise((resolve) => chrome.storage.sync.remove(keys, resolve));
  }

  function getLocal() {
    return new Promise((resolve) => chrome.storage.local.get(null, resolve));
  }

  function setLocal(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  async function loadSettings() {
    const raw = await getSync();
    return {
      apiKey: raw.apiKey ?? DEFAULT_SETTINGS.apiKey,
      model: raw.model ?? DEFAULT_SETTINGS.model,
      memorySettings: { ...DEFAULT_SETTINGS.memorySettings, ...(raw.memorySettings || {}) },
    };
  }

  async function loadProfile() {
    const raw = await getLocal();
    return { ...DEFAULT_PROFILE, ...(raw.userProfile || {}) };
  }

  async function saveProfile(profile) {
    const merged = { ...DEFAULT_PROFILE, ...profile, updatedAt: Date.now() };
    await setLocal({ userProfile: merged });
    return merged;
  }

  async function runMigrationV2() {
    const local = await getLocal();
    if (local.migrationV2Done) return;
    const sync = await getSync();
    const bio = mergePersonasToBio(sync.persona || '', sync.quotePersona || '');
    if (!local.userProfile) {
      await setLocal({
        userProfile: { ...DEFAULT_PROFILE, bio, updatedAt: Date.now() },
      });
    }
    await removeSync(['persona', 'quotePersona']);
    if (!sync.memorySettings) {
      await setSync({ memorySettings: DEFAULT_SETTINGS.memorySettings });
    }
    await setLocal({ migrationV2Done: true });
  }

  root.Dumly.settings = {
    DEFAULT_SETTINGS,
    DEFAULT_PROFILE,
    mergePersonasToBio,
    loadSettings,
    loadProfile,
    saveProfile,
    runMigrationV2,
  };
})();
