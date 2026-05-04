(function () {
  const qs = (s) => document.querySelector(s);
  const status = (id, msg) => {
    const el = qs('#' + id);
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 2000);
  };

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

  const apiInput = qs('#api-key');
  const toggleKey = qs('#toggle-key');
  const modelSel = qs('#model');
  qs('#save-settings').addEventListener('click', async () => {
    const payload = { apiKey: apiInput.value.trim(), model: modelSel.value };
    await new Promise((r) => chrome.storage.sync.set(payload, r));
    status('settings-status', 'Saved!');
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

  const bio = qs('#bio'), tone = qs('#tone'), angles = qs('#angles'), avoid = qs('#avoid');
  window.Dumly.settings.loadProfile().then((p) => {
    bio.value = p.bio;
    tone.value = p.tone;
    angles.value = (p.preferredAngles || []).join('\n');
    avoid.value = (p.avoidPatterns || []).join('\n');
  });
  qs('#save-profile').addEventListener('click', async () => {
    const profile = {
      bio: bio.value.trim(),
      tone: tone.value.trim(),
      preferredAngles: angles.value.split('\n').map((l) => l.trim()).filter(Boolean),
      avoidPatterns: avoid.value.split('\n').map((l) => l.trim()).filter(Boolean),
    };
    await window.Dumly.settings.saveProfile(profile);
    status('profile-status', 'Saved!');
  });

  qs('#save-toggles').addEventListener('click', async () => {
    const memorySettings = {
      useProfile: qs('#toggle-useProfile').checked,
      learnFromUse: qs('#toggle-learnFromUse').checked,
      learnFromCopy: qs('#toggle-learnFromCopy').checked,
      rememberNegatives: qs('#toggle-rememberNegatives').checked,
    };
    await new Promise((r) => chrome.storage.sync.set({ memorySettings }, r));
    status('memory-status', 'Saved!');
  });

  (async () => {
    try {
      const a = await window.Dumly.db.count('acceptedMemories');
      const n = await window.Dumly.db.count('negativeMemories');
      qs('#accepted-count').textContent = a;
      qs('#negative-count').textContent = n;
    } catch (e) {
      qs('#accepted-count').textContent = '?';
      qs('#negative-count').textContent = '?';
    }
  })();

  qs('#review-memory').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('memory.html') });
  });
  qs('#clear-memory').addEventListener('click', async () => {
    const choice = prompt('Type "all", "accepted", or "negative" to clear:');
    if (!choice) return;
    const db = await window.Dumly.db.open();
    const stores = choice === 'all' ? ['acceptedMemories', 'negativeMemories']
                 : choice === 'accepted' ? ['acceptedMemories']
                 : choice === 'negative' ? ['negativeMemories']
                 : null;
    if (!stores) return status('memory-status', 'Cancelled.');
    for (const name of stores) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        const req = tx.objectStore(name).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
    status('memory-status', 'Cleared.');
    qs('#accepted-count').textContent = await window.Dumly.db.count('acceptedMemories');
    qs('#negative-count').textContent = await window.Dumly.db.count('negativeMemories');
  });
})();
