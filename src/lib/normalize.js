export function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/_/g, '')
    .trim();
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function isCorrect(answer, track) {
  if (!answer?.trim()) return false;

  const normAnswer = normalize(answer);
  const title = normalize(track.custom_title ?? track.title);
  const artist = normalize(track.custom_artist ?? track.artist);

  const candidates = [title, artist, `${artist} ${title}`, `${title} ${artist}`];
  return candidates.some(c => levenshtein(normAnswer, c) <= 2);
}
