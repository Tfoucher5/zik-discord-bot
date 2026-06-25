import { describe, it, expect } from 'vitest';
import { cleanString, displayString, parseFeaturing } from '../src/lib/normalize.js';

describe('cleanString', () => {
  it('minuscule + sans accents', () => expect(cleanString('Été')).toBe('ete'));
  it('retire le contenu entre parenthèses', () => expect(cleanString('Around the World (Radio Edit)')).toBe('around the world'));
  it('retire le contenu entre crochets', () => expect(cleanString('Title [Remastered]')).toBe('title'));
  it('remplace les tirets par des espaces', () => expect(cleanString('AC-DC')).toBe('ac dc'));
  it('garde les espaces internes', () => expect(cleanString('Bohemian Rhapsody')).toBe('bohemian rhapsody'));
});

describe('displayString', () => {
  it('retire les parenthèses pour affichage', () => expect(displayString('Around the World (Edit)')).toBe('Around the World'));
});

describe('parseFeaturing', () => {
  it('feat. entre parenthèses', () => expect(parseFeaturing('Drake (feat. Rihanna)')).toEqual({ main: 'Drake', feats: ['Rihanna'] }));
  it('ft sans parenthèses, plusieurs feats', () => expect(parseFeaturing('Calvin Harris ft. Dua Lipa & Young Thug')).toEqual({ main: 'Calvin Harris', feats: ['Dua Lipa', 'Young Thug'] }));
  it('duo avec & non splitté', () => expect(parseFeaturing('Bigflo & Oli')).toEqual({ main: 'Bigflo & Oli', feats: [] }));
  it('3+ artistes séparés par virgule', () => expect(parseFeaturing('A, B, C')).toEqual({ main: 'A', feats: ['B', 'C'] }));
  it('artiste seul', () => expect(parseFeaturing('Queen')).toEqual({ main: 'Queen', feats: [] }));
});
