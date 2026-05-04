(function () {
  window.Dumly = window.Dumly || {};

  const STOPWORDS = new Set([
    'the','and','for','are','but','not','you','all','any','can','had','her','was',
    'one','our','out','day','get','has','him','his','how','man','new','now','old',
    'see','two','way','who','boy','did','its','let','put','say','she','too','use',
    'this','that','with','from','your','will','have','what','when','they','them',
    'been','were','into','then','than','some','only','also','more','very','just',
    'here','there','about','which','their','would','could','should','because',
    'these','those','where','while','after','before','upon','being','having','such',
  ]);

  function normalizeText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tokenize(text) {
    return normalizeText(text)
      .split(' ')
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  }

  function jaccardSimilarity(a, b) {
    const setA = new Set(tokenize(a));
    const setB = new Set(tokenize(b));
    if (setA.size === 0 && setB.size === 0) return 0;
    let inter = 0;
    for (const t of setA) if (setB.has(t)) inter++;
    const union = setA.size + setB.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  window.Dumly.similarity = { normalizeText, tokenize, jaccardSimilarity, STOPWORDS };
})();
