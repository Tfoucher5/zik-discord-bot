import { describe, it, expect } from 'vitest';
import { normalize, levenshtein, isCorrect } from '../src/lib/normalize.js';

describe('normalize', () => {
  it('met en minuscules', () => expect(normalize('ROCK')).toBe('rock'));
  it('supprime les accents', () => expect(normalize('été')).toBe('ete'));
  it('supprime la ponctuation', () => expect(normalize("c'est l'été!")).toBe('cest lete'));
  it('garde les espaces', () => expect(normalize('bohemian rhapsody')).toBe('bohemian rhapsody'));
  it('supprime les tirets', () => expect(normalize('ac-dc')).toBe('acdc'));
});

describe('levenshtein', () => {
  it('strings identiques → 0', () => expect(levenshtein('hello', 'hello')).toBe(0));
  it('une substitution → 1', () => expect(levenshtein('hello', 'hxllo')).toBe(1));
  it('une insertion → 1', () => expect(levenshtein('hello', 'helloo')).toBe(1));
  it('une suppression → 1', () => expect(levenshtein('hello', 'hell')).toBe(1));
  it('faute de frappe typ. → 2', () => expect(levenshtein('queen', 'quenn')).toBe(1));
});

describe('isCorrect', () => {
  const track = { artist: 'Queen', title: 'Bohemian Rhapsody' };

  it('titre exact → true', () => expect(isCorrect('Bohemian Rhapsody', track)).toBe(true));
  it('artiste exact → true', () => expect(isCorrect('Queen', track)).toBe(true));
  it('format artiste - titre → true', () => expect(isCorrect('Queen - Bohemian Rhapsody', track)).toBe(true));
  it('faute de frappe ≤ 2 → true', () => expect(isCorrect('Bohemian Rapsody', track)).toBe(true));
  it('faute de frappe > 2 → false', () => expect(isCorrect('Bohem Rapsdi', track)).toBe(false));
  it('réponse vide → false', () => expect(isCorrect('', track)).toBe(false));
  it('custom_title prioritaire', () => {
    const t = { artist: 'Daft Punk', title: 'Around the World (Edit)', custom_title: 'Around the World' };
    expect(isCorrect('Around the World', t)).toBe(true);
  });
});
