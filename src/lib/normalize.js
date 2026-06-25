export function cleanString(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ *\([^)]*\) */g, '')
    .replace(/ *\[[^\]]*\] */g, '')
    .replace(/['‘’`]/g, "'")
    .replace(/[-–—]/g, ' ')
    .trim()
    .toLowerCase();
}

export function displayString(str) {
  if (!str) return '';
  return str
    .replace(/ *\([^)]*\) */g, ' ')
    .replace(/ *\[[^\]]*\] */g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseFeaturing(artistStr) {
  if (!artistStr) return { main: '', feats: [] };
  const mParen = artistStr.match(/^(.+?)\s*\((?:feat\.?|ft\.?|featuring|with|avec)\s+([^)]+)\)\s*$/i);
  if (mParen) {
    const feats = mParen[2].split(/\s*[,&]\s*/).map((s) => s.trim()).filter(Boolean);
    return { main: mParen[1].trim(), feats };
  }
  const mFeat = artistStr.match(/^(.+?)\s+(?:feat\.?|ft\.?|featuring|with|avec)\s+(.+)$/i);
  if (mFeat) {
    const feats = mFeat[2].split(/\s*[,&]\s*/).map((s) => s.trim()).filter(Boolean);
    return { main: mFeat[1].trim(), feats };
  }
  const commaParts = artistStr.split(', ').map((s) => s.trim()).filter(Boolean);
  if (commaParts.length >= 3) return { main: commaParts[0], feats: commaParts.slice(1) };
  if (commaParts.length === 2 && !commaParts[0].includes('&') && !commaParts[1].includes('&'))
    return { main: commaParts[0], feats: [commaParts[1]] };
  return { main: artistStr, feats: [] };
}
