// Coefficient de Sørensen-Dice sur bigrammes — équivalent à string-similarity.compareTwoStrings
// (espaces retirés, comme la lib de référence du site).
export function diceCoefficient(a, b) {
  a = (a || '').replace(/\s+/g, '');
  b = (b || '').replace(/\s+/g, '');
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.substr(i, 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.substr(i, 2);
    const count = bigrams.get(bg) || 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      intersection++;
    }
  }
  return (2 * intersection) / (a.length + b.length - 2);
}

// Matching GLOBAL uniquement (pas de décomposition par mot) — anti-triche.
export function checkMatch(input, target) {
  if (!input || !target) return false;
  const len = input.length;
  const tLen = target.length;
  if (input === target) return true;

  // Anti-triche : rejeter les mots isolés (input est un mot complet dans target)
  if (target.includes(' ' + input + ' ') || target.includes(input + ' ') && target.indexOf(input) === 0 || target.endsWith(' ' + input)) {
    return false;
  }

  if (len >= 3 && target.includes(input) && len / tLen >= 0.4) return true;
  if (tLen >= 3 && input.includes(target) && tLen / len >= 0.6) return true;
  const sim = diceCoefficient(input, target);
  if (len <= 2) return sim >= 0.95;
  if (sim >= 0.72) return true;
  if (len >= 6 && sim >= 0.65) return true;
  return false;
}

export function checkClose(input, target) {
  if (!input || !target || input.length < 2) return false;
  const sim = diceCoefficient(input, target);
  if (sim >= 0.42) return true;
  if (input.length >= 3 && target.length >= 3) {
    for (let i = 0; i <= target.length - input.length; i++) {
      const chunk = target.slice(i, i + input.length);
      if (diceCoefficient(input, chunk) >= 0.8) return true;
    }
  }
  return false;
}
