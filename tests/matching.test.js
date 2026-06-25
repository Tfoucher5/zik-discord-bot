import { describe, it, expect } from 'vitest';
import { diceCoefficient, checkMatch, checkClose } from '../src/lib/matching.js';

describe('diceCoefficient', () => {
  it('chaînes identiques → 1', () => expect(diceCoefficient('queen', 'queen')).toBe(1));
  it('totalement différent → 0', () => expect(diceCoefficient('abc', 'xyz')).toBe(0));
  it('proche → entre 0 et 1', () => {
    const s = diceCoefficient('bohemian', 'bohemain');
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(1);
  });
});

describe('checkMatch', () => {
  const t = 'bohemian rhapsody';
  it('exact → true', () => expect(checkMatch('bohemian rhapsody', t)).toBe(true));
  it('faute de frappe → true', () => expect(checkMatch('bohemian rapsody', t)).toBe(true));
  it('mot isolé → false (anti-triche)', () => expect(checkMatch('bohemian', t)).toBe(false));
  it('totalement faux → false', () => expect(checkMatch('hello world', t)).toBe(false));
  it('vide → false', () => expect(checkMatch('', t)).toBe(false));
});

describe('checkClose', () => {
  it('proche mais pas exact → true', () => expect(checkClose('bohemian rapsod', 'bohemian rhapsody')).toBe(true));
  it('rien à voir → false', () => expect(checkClose('xyz', 'bohemian rhapsody')).toBe(false));
});
