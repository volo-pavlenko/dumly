(function () {
  const root = (typeof window !== 'undefined') ? window
    : (typeof self !== 'undefined') ? self
    : globalThis;
  root.Dumly = root.Dumly || {};

  const DAY = 24 * 60 * 60 * 1000;

  function recency(createdAt) {
    const ageDays = (Date.now() - createdAt) / DAY;
    return Math.pow(0.5, ageDays / 30);
  }

  function usageBoost(m) {
    return 1 + Math.min(Math.log1p(m.useCount || 1) * 0.12, 0.4);
  }

  function editBoost(m) { return m.wasEdited ? 1.15 : 1.0; }

  root.Dumly.scoring = { recency, usageBoost, editBoost };
})();
