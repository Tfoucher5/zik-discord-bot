import { displayString } from './normalize.js';

export function calcSpeedBonus(timeTaken) {
  if (timeTaken < 10) return 2;
  if (timeTaken < 20) return 1;
  return 0;
}

export function calcQcmPoints(timeTaken, roundDuration) {
  const MAX_PTS = 1000;
  const MIN_PTS = 200;
  const ratio = Math.min(1, Math.max(0, timeTaken / Math.max(1, roundDuration)));
  return Math.round(MAX_PTS - (MAX_PTS - MIN_PTS) * ratio);
}

export function makeChoices(correct, allTracks) {
  const label = (t) => `${displayString(t.mainArtist || t.artist)} — ${displayString(t.title)}`;
  const correctLabel = label(correct);
  const correctArtistKey = (correct.mainArtist || correct.artist || '').toLowerCase().trim();
  const pool = allTracks.filter((t) => label(t) !== correctLabel);
  const sameArtistPool = pool.filter((t) => (t.mainArtist || t.artist || '').toLowerCase().trim() === correctArtistKey);
  const diffArtistPool = pool.filter((t) => (t.mainArtist || t.artist || '').toLowerCase().trim() !== correctArtistKey);
  let wrongTracks;
  if (sameArtistPool.length >= 1 && Math.random() < 0.4) {
    const decoy = sameArtistPool[Math.floor(Math.random() * sameArtistPool.length)];
    const remaining = diffArtistPool.sort(() => Math.random() - 0.5).slice(0, 2);
    wrongTracks = [decoy, ...remaining].sort(() => Math.random() - 0.5);
  } else {
    wrongTracks = pool.sort(() => Math.random() - 0.5).slice(0, 3);
  }
  const choices = [correctLabel, ...wrongTracks.map(label)].sort(() => Math.random() - 0.5);
  return { choices, correctChoiceIndex: choices.indexOf(correctLabel) };
}
