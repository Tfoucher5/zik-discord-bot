import { describe, it, expect } from 'vitest';
import { calcSpeedBonus, calcQcmPoints, makeChoices } from '../src/lib/scoring.js';

describe('calcSpeedBonus', () => {
  it('< 10s → 2', () => expect(calcSpeedBonus(5)).toBe(2));
  it('< 20s → 1', () => expect(calcSpeedBonus(15)).toBe(1));
  it('>= 20s → 0', () => expect(calcSpeedBonus(25)).toBe(0));
});

describe('calcQcmPoints', () => {
  it('réponse instantanée → ~1000', () => expect(calcQcmPoints(0, 30)).toBe(1000));
  it('à la fin → 200', () => expect(calcQcmPoints(30, 30)).toBe(200));
  it('à mi-temps → ~600', () => expect(calcQcmPoints(15, 30)).toBe(600));
});

describe('makeChoices', () => {
  const mk = (a, t) => ({ mainArtist: a, artist: a, title: t });
  it('4 choix, index correct cohérent', () => {
    const correct = mk('Queen', 'Bohemian Rhapsody');
    const all = [correct, mk('ABBA', 'SOS'), mk('Eagles', 'Hotel California'), mk('Toto', 'Africa'), mk('Dio', 'Holy Diver')];
    const { choices, correctChoiceIndex } = makeChoices(correct, all);
    expect(choices.length).toBe(4);
    expect(choices[correctChoiceIndex]).toContain('Bohemian Rhapsody');
    expect(new Set(choices).size).toBe(4);
  });
});
