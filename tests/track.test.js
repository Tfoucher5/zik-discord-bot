import { describe, it, expect } from 'vitest';
import { buildTrack } from '../src/lib/track.js';

describe('buildTrack', () => {
  it('parse les feats depuis le champ artiste', () => {
    const t = buildTrack({ artist: 'Drake (feat. Rihanna)', title: 'Too Good', preview_url: 'u' });
    expect(t.mainArtist).toBe('Drake');
    expect(t.featArtists).toEqual(['Rihanna']);
    expect(t.cleanArtist).toBe('drake');
    expect(t.cleanFeatArtists).toEqual(['rihanna']);
    expect(t.cleanTitle).toBe('too good');
  });
  it('custom_artist/custom_title prioritaires', () => {
    const t = buildTrack({ artist: 'X', title: 'Y (Edit)', custom_artist: 'Queen', custom_title: 'Bohemian Rhapsody' });
    expect(t.cleanArtist).toBe('queen');
    expect(t.cleanTitle).toBe('bohemian rhapsody');
  });
  it('custom_feats remplace les feats parsés', () => {
    const t = buildTrack({ artist: 'A', title: 'T', custom_feats: ['Feat One'] });
    expect(t.featArtists).toEqual(['Feat One']);
  });
  it('extras avec clean', () => {
    const t = buildTrack({ artist: 'A', title: 'T', extraAnswers: [{ label: 'Album', value: 'Greatest Hits' }] });
    expect(t.extraAnswers[0]).toEqual({ label: 'Album', value: 'Greatest Hits', clean: 'greatest hits' });
  });
  it('sans feat ni extra → listes vides', () => {
    const t = buildTrack({ artist: 'Queen', title: 'X' });
    expect(t.featArtists).toEqual([]);
    expect(t.extraAnswers).toEqual([]);
  });
});
