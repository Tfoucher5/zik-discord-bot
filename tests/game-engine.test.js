import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/supabase.js', () => ({
  default: {
    from: () => ({
      insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'g1' } }) }) }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null }),
  },
}));

import supabase from '../src/lib/supabase.js';
import { createGame, addPlayer, submitGuess, submitChoice, isRoundComplete, allPlayersDone, nextRound, endGame, activeGames } from '../src/lib/game-engine.js';
import { buildTrack } from '../src/lib/track.js';

const mkState = (mode = 'classic') => {
  const tracks = [buildTrack({ artist: 'Drake (feat. Rihanna)', title: 'Too Good' })];
  const state = createGame('g', 'h', 'v', tracks, 1, mode, 30);
  state.currentRound = 1;
  state.roundStartedAt = new Date();
  return state;
};

beforeEach(() => { activeGames.clear(); vi.clearAllMocks(); });

describe('submitGuess (classic)', () => {
  it('artiste seul ne complète pas le round', () => {
    const s = mkState();
    addPlayer(s, 'u', 'Theo', null);
    const r = submitGuess(s, 'u', 'Drake');
    expect(r.hits.map((h) => h.type)).toEqual(['artist']);
    expect(r.full).toBe(false);
    expect(s.players.get('u').score).toBeGreaterThan(0);
  });
  it('il faut artiste + titre + feat pour compléter', () => {
    const s = mkState();
    addPlayer(s, 'u', 'Theo', null);
    submitGuess(s, 'u', 'Drake');
    submitGuess(s, 'u', 'Too Good');
    const r = submitGuess(s, 'u', 'Rihanna');
    expect(r.full).toBe(true);
    expect(s.players.get('u').roundsFullFound).toBe(1);
  });
  it('mot isolé du titre rejeté (anti-triche)', () => {
    const s = mkState();
    addPlayer(s, 'u', 'Theo', null);
    const r = submitGuess(s, 'u', 'Too');
    expect(r.hits).toEqual([]);
  });
});

describe('submitChoice (qcm)', () => {
  it('bonne réponse → points dégressifs', () => {
    const s = mkState('qcm');
    s.correctChoiceIndex = 2;
    addPlayer(s, 'u', 'Theo', null);
    const r = submitChoice(s, 'u', 2);
    expect(r.correct).toBe(true);
    expect(r.points).toBeGreaterThan(0);
    expect(submitChoice(s, 'u', 2)).toBeNull();
  });
});

describe('allPlayersDone', () => {
  it('classic : true seulement quand tous ont tout trouvé', () => {
    const s = mkState();
    addPlayer(s, 'u', 'Theo', null);
    expect(allPlayersDone(s)).toBe(false);
    submitGuess(s, 'u', 'Drake'); submitGuess(s, 'u', 'Too Good'); submitGuess(s, 'u', 'Rihanna');
    expect(allPlayersDone(s)).toBe(true);
  });
});

describe('endGame', () => {
  it('classic : appelle update_player_stats_discord pour les joueurs liés', async () => {
    const s = mkState('classic');
    addPlayer(s, 'u', 'Theo', 'zik-uuid');
    s.players.get('u').score = 30;
    await endGame(s, 'g');
    expect(supabase.rpc).toHaveBeenCalledWith('update_player_stats_discord', { p_user_id: 'zik-uuid', p_score: 30 });
  });
  it('qcm : aucune écriture de stats', async () => {
    const s = mkState('qcm');
    addPlayer(s, 'u', 'Theo', 'zik-uuid');
    await endGame(s, 'g');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
