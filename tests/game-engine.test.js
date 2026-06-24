import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase avant l'import
vi.mock('../src/lib/supabase.js', () => ({
  default: {
    from: () => ({ insert: vi.fn().mockResolvedValue({ data: [{ id: 'game-uuid' }] }), select: () => ({ single: vi.fn().mockResolvedValue({ data: { id: 'game-uuid' } }) }) }),
    rpc: vi.fn().mockResolvedValue({ data: null }),
  }
}));

import { createGame, addPlayer, submitAnswer, nextRound, activeGames } from '../src/lib/game-engine.js';

const TRACKS = [
  { id: '1', artist: 'Queen', title: 'Bohemian Rhapsody', preview_url: 'http://x.mp3' },
  { id: '2', artist: 'AC/DC', title: 'Highway to Hell', preview_url: 'http://y.mp3' },
];

beforeEach(() => activeGames.clear());

describe('createGame', () => {
  it('crée un GameState avec la bonne structure', () => {
    const state = createGame('guild1', 'host1', 'thread1', 'voice1', TRACKS, 2);
    expect(state.currentRound).toBe(0);
    expect(state.totalRounds).toBe(2);
    expect(state.players.size).toBe(0);
    expect(activeGames.has('guild1')).toBe(true);
  });
});

describe('addPlayer', () => {
  it('ajoute un joueur avec score initial 0', () => {
    const state = createGame('guild2', 'host1', 't1', 'v1', TRACKS, 2);
    const fakeDM = {};
    addPlayer(state, 'user1', 'Theo', 'zik-uuid-1', fakeDM);
    expect(state.players.get('user1').score).toBe(0);
    expect(state.players.get('user1').hasAnswered).toBe(false);
  });
});

describe('submitAnswer', () => {
  it('valide une réponse correcte et calcule les points', () => {
    const state = createGame('guild3', 'host1', 't1', 'v1', TRACKS, 2);
    addPlayer(state, 'user1', 'Theo', null, {});
    state.currentRound = 1;
    // Simuler 5 secondes écoulées
    state.roundStartedAt = new Date(Date.now() - 5000);
    const result = submitAnswer(state, 'user1', 'Bohemian Rhapsody');
    expect(result.correct).toBe(true);
    expect(result.points).toBe(9); // 10 - floor(5/3) = 10 - 1 = 9
    expect(state.players.get('user1').score).toBe(9);
    expect(state.players.get('user1').hasAnswered).toBe(true);
  });

  it('rejette une réponse incorrecte', () => {
    const state = createGame('guild4', 'host1', 't1', 'v1', TRACKS, 2);
    addPlayer(state, 'user1', 'Theo', null, {});
    state.currentRound = 1;
    state.roundStartedAt = new Date();
    const result = submitAnswer(state, 'user1', 'blablabla faux');
    expect(result.correct).toBe(false);
    expect(result.points).toBe(0);
  });

  it('ignore une seconde réponse d\'un joueur qui a déjà trouvé', () => {
    const state = createGame('guild5', 'host1', 't1', 'v1', TRACKS, 2);
    addPlayer(state, 'user1', 'Theo', null, {});
    state.currentRound = 1;
    state.roundStartedAt = new Date();
    submitAnswer(state, 'user1', 'Bohemian Rhapsody');
    const result2 = submitAnswer(state, 'user1', 'Bohemian Rhapsody');
    expect(result2).toBeNull();
  });
});

describe('nextRound', () => {
  it('passe au round suivant et reset hasAnswered', () => {
    const state = createGame('guild6', 'host1', 't1', 'v1', TRACKS, 2);
    addPlayer(state, 'user1', 'Theo', null, {});
    state.players.get('user1').hasAnswered = true;
    const result = nextRound(state);
    expect(result.roundIndex).toBe(0);
    expect(state.players.get('user1').hasAnswered).toBe(false);
  });

  it('retourne null quand tous les rounds sont joués', () => {
    const state = createGame('guild7', 'host1', 't1', 'v1', TRACKS, 2);
    state.currentRound = 2;
    expect(nextRound(state)).toBeNull();
  });
});
