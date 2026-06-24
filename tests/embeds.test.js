import { describe, it, expect } from 'vitest';
import { eloColor } from '../src/lib/embeds.js';

describe('eloColor', () => {
  it('retourne gris pour elo < 1100', () => expect(eloColor(900)).toBe(0x95a5a6));
  it('retourne bleu pour elo 1100', () => expect(eloColor(1100)).toBe(0x3498db));
  it('retourne bleu pour elo 1250', () => expect(eloColor(1250)).toBe(0x3498db));
  it('retourne violet pour elo 1300', () => expect(eloColor(1300)).toBe(0x7c3aed));
  it('retourne violet pour elo 1400', () => expect(eloColor(1400)).toBe(0x7c3aed));
  it('retourne or pour elo 1500', () => expect(eloColor(1500)).toBe(0xf1c40f));
  it('retourne or pour elo 2000', () => expect(eloColor(2000)).toBe(0xf1c40f));
});
