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

  const DEFAULT_STYLE_PROFILE = {
    globalStyle: {
      case: 'normal',
      length: 'short',
      tone: [],
      avoid: [],
      preferredMoves: [],
    },
    commentStyle: { goal: '', preferredLength: 'short' },
    quoteStyle: { goal: '', preferredLength: 'short' },
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

  async function loadStyleProfile() {
    const raw = await getLocal();
    return {
      ...DEFAULT_STYLE_PROFILE,
      ...(raw.compactStyleProfile || {}),
      globalStyle: {
        ...DEFAULT_STYLE_PROFILE.globalStyle,
        ...(raw.compactStyleProfile?.globalStyle || {}),
      },
    };
  }

  async function updateStyleProfileFromAccepted(memory) {
    const current = await loadStyleProfile();
    const text = memory.acceptedText || memory.finalUserText || '';
    const styleTags = memory.styleTags || memory.toneTags || [];
    const lower = text && text === text.toLowerCase();
    const nextTone = Array.from(new Set([...(current.globalStyle.tone || []), ...styleTags])).slice(0, 8);
    const next = {
      ...current,
      globalStyle: {
        ...current.globalStyle,
        case: lower ? 'mostly_lowercase' : current.globalStyle.case || 'normal',
        length: text.length <= 160 ? 'short' : 'medium',
        tone: nextTone,
      },
      updatedAt: Date.now(),
    };
    await setLocal({ compactStyleProfile: next });
    return next;
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
    DEFAULT_STYLE_PROFILE,
    mergePersonasToBio,
    loadSettings,
    loadProfile,
    loadStyleProfile,
    updateStyleProfileFromAccepted,
    saveProfile,
    runMigrationV2,
  };
})();
