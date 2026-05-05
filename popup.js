(function () {
  const qs = (s) => document.querySelector(s);
  const showStatus = (id, msg) => {
    const el = qs('#' + id);
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 2000);
  };

  // Tabs
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('is-active'));
      btn.classList.add('is-active');
      const target = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-panel').forEach((p) => {
        p.hidden = p.getAttribute('data-panel') !== target;
      });
    });
  });

  window.Dumly.settings.runMigrationV2().catch(() => {});

  // --- Settings tab ---
  const apiInput = qs('#api-key');
  const toggleKey = qs('#toggle-key');
  const modelSel = qs('#model');

  qs('#save-settings').addEventListener('click', async () => {
    const payload = { apiKey: apiInput.value.trim(), model: modelSel.value };
    await new Promise((r) => chrome.storage.sync.set(payload, r));
    showStatus('settings-status', 'Saved!');
  });
  qs('#reset-settings').addEventListener('click', async () => {
    apiInput.value = '';
    modelSel.value = 'gpt-5.4-mini';
    showStatus('settings-status', 'Reset — click Save to apply.');
  });
  toggleKey.addEventListener('click', () => {
    const isPw = apiInput.type === 'password';
    apiInput.type = isPw ? 'text' : 'password';
    toggleKey.textContent = isPw ? 'Hide' : 'Show';
  });

  window.Dumly.settings.loadSettings().then((s) => {
    apiInput.value = s.apiKey;
    modelSel.value = s.model;
    qs('#toggle-useProfile').checked = s.memorySettings.useProfile !== false;
    qs('#toggle-learnFromUse').checked = s.memorySettings.learnFromUse !== false;
    qs('#toggle-learnFromCopy').checked = s.memorySettings.learnFromCopy !== false;
    qs('#toggle-rememberNegatives').checked = s.memorySettings.rememberNegatives !== false;
  });

  // --- Profile tab ---
  const bio = qs('#bio');
  const bioCount = qs('#bio-count');
  const tone = qs('#tone');
  const anglesChips = qs('#angles-chips');
  const anglesInput = qs('#angles-input');
  const avoidChips = qs('#avoid-chips');
  const avoidInput = qs('#avoid-input');

  function updateBioCount() {
    bioCount.textContent = bio.value.length;
  }
  bio.addEventListener('input', updateBioCount);

  function renderChips(container, items, variant, onRemove) {
    container.replaceChildren();
    items.forEach((text, idx) => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (variant ? ' chip--' + variant : '');
      chip.append(document.createTextNode(text));
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'chip-remove';
      rm.setAttribute('aria-label', 'Remove');
      rm.textContent = '✕';
      rm.addEventListener('click', () => onRemove(idx));
      chip.append(rm);
      container.append(chip);
    });
  }

  function wireChipInput({ inputEl, container, variant, getList, setList }) {
    function render() {
      renderChips(container, getList(), variant, (idx) => {
        const next = getList().slice();
        next.splice(idx, 1);
        setList(next);
        render();
      });
    }
    inputEl.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const value = inputEl.value.trim();
      if (!value) return;
      const next = getList().slice();
      if (!next.includes(value)) next.push(value);
      setList(next);
      inputEl.value = '';
      render();
    });
    return render;
  }

  let profileState = { bio: '', tone: '', preferredAngles: [], avoidPatterns: [] };

  const renderAngles = wireChipInput({
    inputEl: anglesInput,
    container: anglesChips,
    variant: null,
    getList: () => profileState.preferredAngles,
    setList: (v) => { profileState.preferredAngles = v; },
  });
  const renderAvoid = wireChipInput({
    inputEl: avoidInput,
    container: avoidChips,
    variant: 'violet',
    getList: () => profileState.avoidPatterns,
    setList: (v) => { profileState.avoidPatterns = v; },
  });

  window.Dumly.settings.loadProfile().then((p) => {
    profileState = {
      bio: p.bio || '',
      tone: p.tone || '',
      preferredAngles: (p.preferredAngles || []).slice(),
      avoidPatterns: (p.avoidPatterns || []).slice(),
    };
    bio.value = profileState.bio;
    tone.value = profileState.tone;
    updateBioCount();
    renderAngles();
    renderAvoid();
  });

  qs('#save-profile').addEventListener('click', async () => {
    const profile = {
      bio: bio.value.trim(),
      tone: tone.value.trim(),
      preferredAngles: profileState.preferredAngles,
      avoidPatterns: profileState.avoidPatterns,
    };
    await window.Dumly.settings.saveProfile(profile);
    profileState.bio = profile.bio;
    profileState.tone = profile.tone;
    showStatus('profile-status', 'Saved!');
  });
  qs('#reset-profile').addEventListener('click', () => {
    profileState = { bio: '', tone: '', preferredAngles: [], avoidPatterns: [] };
    bio.value = '';
    tone.value = '';
    updateBioCount();
    renderAngles();
    renderAvoid();
    showStatus('profile-status', 'Reset — click Save to apply.');
  });

  // --- Memory tab ---
  qs('#save-toggles').addEventListener('click', async () => {
    const memorySettings = {
      useProfile: qs('#toggle-useProfile').checked,
      learnFromUse: qs('#toggle-learnFromUse').checked,
      learnFromCopy: qs('#toggle-learnFromCopy').checked,
      rememberNegatives: qs('#toggle-rememberNegatives').checked,
    };
    await new Promise((r) => chrome.storage.sync.set({ memorySettings }, r));
    showStatus('memory-status', 'Saved!');
  });

  async function refreshCounts() {
    try {
      qs('#accepted-count').textContent = await window.Dumly.db.count('acceptedMemories');
      qs('#negative-count').textContent = await window.Dumly.db.count('negativeMemories');
    } catch {
      qs('#accepted-count').textContent = '?';
      qs('#negative-count').textContent = '?';
    }
  }
  refreshCounts();

  qs('#review-memory').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('memory.html') });
  });
  qs('#clear-memory').addEventListener('click', async () => {
    const choice = prompt('Type "all", "accepted", or "negative" to clear:');
    if (!choice) return;
    const stores = choice === 'all' ? ['acceptedMemories', 'negativeMemories']
                 : choice === 'accepted' ? ['acceptedMemories']
                 : choice === 'negative' ? ['negativeMemories']
                 : null;
    if (!stores) return showStatus('memory-status', 'Cancelled.');
    for (const name of stores) {
      await window.Dumly.db.clearStore(name);
    }
    showStatus('memory-status', 'Cleared.');
    refreshCounts();
  });
})();
