import supabase from './supabase.js';
import { isCorrect } from './normalize.js';

export const activeGames = new Map();

export function createGame(guildId, hostId, threadId, voiceChannelId, tracks, totalRounds) {
  const state = {
    hostId,
    threadId,
    voiceChannelId,
    voiceConnection: null,
    audioPlayer: null,
    players: new Map(),
    tracks,
    currentRound: 0,
    totalRounds,
    skipVotes: new Set(),
    roundTimeout: null,
    roundStartedAt: null,
    startedAt: new Date(),
    globalTimeout: setTimeout(() => endGame(state), 90 * 60 * 1000),
  };
  activeGames.set(guildId, state);
  return state;
}

export function addPlayer(state, discordUserId, discordUsername, zikUserId, dmChannel) {
  state.players.set(discordUserId, {
    discordUsername,
    zikUserId,
    score: 0,
    dmChannel,
    hasAnswered: false,
  });
}

export function submitAnswer(state, discordUserId, answer) {
  const player = state.players.get(discordUserId);
  if (!player || player.hasAnswered) return null;

  const track = state.tracks[state.currentRound];
  if (!isCorrect(answer, track)) return { correct: false, points: 0 };

  const secondsElapsed = state.roundStartedAt
    ? (Date.now() - state.roundStartedAt.getTime()) / 1000
    : 0;
  const points = Math.max(1, 10 - Math.floor(secondsElapsed / 3));

  player.score += points;
  player.hasAnswered = true;

  const allFound = [...state.players.values()].every(p => p.hasAnswered);
  return { correct: true, points, allFound };
}

export function nextRound(state) {
  if (state.currentRound >= state.totalRounds) return null;
  const track = state.tracks[state.currentRound];
  for (const player of state.players.values()) {
    player.hasAnswered = false;
  }
  state.skipVotes.clear();
  state.roundStartedAt = new Date();
  state.currentRound++;
  return { track, roundIndex: state.currentRound - 1 };
}

export async function endGame(state, guildId) {
  clearTimeout(state.globalTimeout);
  clearTimeout(state.roundTimeout);

  const players = [...state.players.entries()]
    .map(([, p]) => p)
    .sort((a, b) => b.score - a.score);

  try {
    const { data: game } = await supabase
      .from('games')
      .insert({
        room_id: `discord:${guildId ?? 'unknown'}`,
        source: 'discord',
        mode: 'classic',
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

      for (const p of players.filter(p => p.zikUserId)) {
        await supabase.rpc('update_player_stats_discord', {
          p_user_id: p.zikUserId,
          p_score: p.score,
        });
      }
    }
  } catch (err) {
    console.error('[endGame] Erreur BDD :', err);
  }

  if (guildId) activeGames.delete(guildId);
  return players;
}
