import { cleanString, parseFeaturing } from './normalize.js';

export function buildTrack({ artist, title, preview_url, cover, custom_artist, custom_title, custom_feats, extraAnswers }) {
  const effectiveArtist = custom_artist || artist || '';
  const { main, feats: parsedFeats } = parseFeaturing(effectiveArtist);
  const effectiveFeats = Array.isArray(custom_feats) && custom_feats.length ? custom_feats : parsedFeats;
  const effectiveTitle = custom_title || title || '';
  const extras = (extraAnswers || [])
    .filter((e) => e && e.value)
    .map((e) => ({ label: e.label, value: e.value, clean: cleanString(e.value) }));
  return {
    mainArtist: main,
    featArtists: effectiveFeats,
    title: effectiveTitle,
    cleanArtist: cleanString(main),
    cleanFeatArtists: effectiveFeats.map(cleanString),
    cleanTitle: cleanString(effectiveTitle),
    preview_url: preview_url || null,
    cover: cover || '',
    extraAnswers: extras,
  };
}
