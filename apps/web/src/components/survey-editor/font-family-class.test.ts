import { describe, it, expect } from 'vitest';
import { fontFamilyClass } from './survey-style-panel';

describe('fontFamilyClass', () => {
  it('maps serif to font-serif', () => {
    expect(fontFamilyClass('serif')).toBe('font-serif');
  });

  it('maps sans / rounded / undefined to font-sans', () => {
    expect(fontFamilyClass('sans')).toBe('font-sans');
    expect(fontFamilyClass('rounded')).toBe('font-sans');
    expect(fontFamilyClass(undefined)).toBe('font-sans');
  });
});
