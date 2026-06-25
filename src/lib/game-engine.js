import supabase from './supabase.js';
import { cleanString } from './normalize.js';
import { checkMatch, checkClose } from './matching.js';
import { calcSpeedBonus, calcQcmPoints } from './scoring.js';

export const activeGames = new Map();

export function createGame(guildId, hostId, voiceChannelId, tracks, totalRounds, mode = 'classic', roundDuration = 30) {
  const state = {
    hostId,
    voiceChannelId,
    voiceConnection: null,
    audioPlayer: null,
    players: new Map(),
    tracks,
    currentRound: 0,
    totalRounds,
    mode,
    roundDuration,
    skipVotes: new Set(),
    roundTimeout: null,
    roundStartedAt: null,
    firstFullFinder: null,
    correctChoiceIndex: null,
    startedAt: new Date(),
    globalTimeout: null,
  };
  const timer = setTimeout(() => endGame(state, guildId), 90 * 60 * 1000);
  if (timer.unref) timer.unref();
  state.globalTimeout = timer;
  activeGames.set(guildId, state);
  return state;
}

export function addPlayer(state, discordUserId, discordUsername, zikUserId, threadChannel = null) {
  state.players.set(discordUserId, {
    discordUsername,
    zikUserId,
    score: 0,
    threadChannel,
    foundArtist: false,
    foundTitle: false,
    foundFeats: [],
    foundExtras: [],
    roundsFullFound: 0,
    _fullFoundCounted: false,
    _qcmAnswered: false,
  });
}

export function isRoundComplete(player, track) {
  return (
    player.foundArtist &&
    player.foundTitle &&
    (track.cleanFeatArtists || []).every((_, i) => player.foundFeats[i]) &&
    (track.extraAnswers || []).every((_, i) => player.foundExtras[i])
  );
}

export function submitGuess(state, discordUserId, rawInput) {
  const player = state.players.get(discordUserId);
  if (!player) return null;
  const track = state.tracks[state.currentRound - 1];
  const input = cleanString(rawInput);
  if (!input) return { hits: [], close: [], full: false };

  const secs = state.roundStartedAt ? (Date.now() - state.roundStartedAt.getTime()) / 1000 : 0;
  const pts = 1 + calcSpeedBonus(secs);
  const hits = [];
  const close = [];

  if (!player.foundArtist) {
    if (checkMatch(input, track.cleanArtist)) {
      player.foundArtist = true; player.score += pts;
      hits.push({ type: 'artist', value: track.mainArtist, points: pts });
    } else if (checkClose(input, track.cleanArtist)) close.push('artiste');
  }
  for (let i = 0; i < track.cleanFeatArtists.length; i++) {
    if (player.foundFeats[i]) continue;
    if (checkMatch(input, track.cleanFeatArtists[i])) {
      player.foundFeats[i] = true; player.score += pts;
      hits.push({ type: 'feat', value: track.featArtists[i], points: pts });
      break;
    } else if (checkClose(input, track.cleanFeatArtists[i])) close.push('feat');
  }
  if (!player.foundTitle) {
    if (checkMatch(input, track.cleanTitle)) {
      player.foundTitle = true; player.score += pts;
      hits.push({ type: 'title', value: track.title, points: pts });
    } else if (checkClose(input, track.cleanTitle)) close.push('titre');
  }
  if (hits.length === 0) {
    for (let i = 0; i < (track.extraAnswers || []).length; i++) {
      if (player.foundExtras[i]) continue;
      const extra = track.extraAnswers[i];
      if (checkMatch(input, extra.clean)) {
        player.foundExtras[i] = true; player.score += pts;
        hits.push({ type: 'extra', label: extra.label, value: extra.value, points: pts });
        break;
      } else if (checkClose(input, extra.clean)) close.push(extra.label);
    }
  }

  const full = isRoundComplete(player, track);
  if (full && !player._fullFoundCounted) {
    player._fullFoundCounted = true;
    player.roundsFullFound += 1;
    if (!state.firstFullFinder) state.firstFullFinder = player.discordUsername;
  }
  return { hits, close, full };
}

export function submitChoice(state, discordUserId, choiceIndex) {
  const player = state.players.get(discordUserId);
  if (!player || player._qcmAnswered) return null;
  player._qcmAnswered = true;
  if (choiceIndex !== state.correctChoiceIndex) return { correct: false, points: 0 };
  const secs = state.roundStartedAt ? (Date.now() - state.roundStartedAt.getTime()) / 1000 : 0;
  const pts = calcQcmPoints(secs, state.roundDuration);
  player.score += pts;
  player.foundArtist = true;
  player.foundTitle = true;
  player._fullFoundCounted = true;
  if (!state.firstFullFinder) state.firstFullFinder = player.discordUsername;
  return { correct: true, points: pts };
}

export function allPlayersDone(state) {
  const players = [...state.players.values()];
  if (players.length === 0) return false;
  if (state.mode === 'qcm') return players.every((p) => p._qcmAnswered);
  const track = state.tracks[state.currentRound - 1];
  return players.every((p) => isRoundComplete(p, track));
}

export function nextRound(state) {
  if (state.currentRound >= state.totalRounds) return null;
  const track = state.tracks[state.currentRound];
  for (const player of state.players.values()) {
    player.foundArtist = false;
    player.foundTitle = false;
    player.foundFeats = [];
    player.foundExtras = [];
    player._fullFoundCounted = false;
    player._qcmAnswered = false;
  }
  state.skipVotes.clear();
  state.firstFullFinder = null;
  state.correctChoiceIndex = null;
  state.roundStartedAt = new Date();
  state.currentRound++;
  return { track, roundIndex: state.currentRound - 1 };
}

export async function endGame(state, guildId) {
  clearTimeout(state.globalTimeout);
  clearTimeout(state.roundTimeout);

  const players = [...state.players.values()].sort((a, b) => b.score - a.score);

  try {
    const { data: game } = await supabase
      .from('games')
      .insert({
        room_id: `discord:${guildId ?? 'unknown'}`,
        source: 'discord',
        mode: state.mode === 'qcm' ? 'qcm' : 'classic',
        rounds: state.currentRound,
        started_at: state.startedAt.toISOString(),
        ended_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (game) {
      await supabase.from('game_players').insert(
        players.map((p, i) => ({
          game_id: game.id,
          user_id: p.zikUserId ?? null,
          username: p.discordUsername,
          score: p.score,
          rank: i + 1,
          is_guest: !p.zikUserId,
        }))
      );

      if (state.mode !== 'qcm') {
        await Promise.all(
          players
            .filter((p) => p.zikUserId)
            .map((p) => supabase.rpc('update_player_stats_discord', { p_user_id: p.zikUserId, p_score: p.score }))
        );
      }
    }
  } catch (err) {
    console.error('[endGame] Erreur BDD :', err);
  }

  if (guildId) activeGames.delete(guildId);
  return players;
}
