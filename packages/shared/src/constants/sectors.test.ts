import { describe, it, expect } from 'vitest';
import {
  GICS_SECTORS, resolveSector, isGicsSector, isNonEquityBucket, FINNHUB_GICS,
} from './sectors';

describe('GICS taxonomy', () => {
  it('has exactly the 11 GICS sectors', () => {
    expect(GICS_SECTORS).toHaveLength(11);
    expect(isGicsSector('Information Technology')).toBe(true);
    expect(isGicsSector('Semiconductors')).toBe(false); // a Finnhub label, not GICS
  });

  it('isNonEquityBucket flags ETF/Cash only', () => {
    expect(isNonEquityBucket('ETF')).toBe(true);
    expect(isNonEquityBucket('Cash')).toBe(true);
    expect(isNonEquityBucket('Industrials')).toBe(false);
    expect(isNonEquityBucket(null)).toBe(false);
  });

  it('every Finnhub fold target is a real GICS sector', () => {
    for (const target of Object.values(FINNHUB_GICS)) expect(isGicsSector(target)).toBe(true);
  });
});

describe('resolveSector', () => {
  it('folds Finnhub labels to GICS (case-insensitive)', () => {
    expect(resolveSector('SNOW', 'Technology')).toBe('Information Technology');
    expect(resolveSector('QCOM', 'Semiconductors')).toBe('Information Technology');
    expect(resolveSector('ENS', 'Electrical Equipment')).toBe('Industrials');
    expect(resolveSector('JPM', 'banking')).toBe('Financials');
    expect(resolveSector('IRDM', 'Telecommunication')).toBe('Communication Services');
    expect(resolveSector('PANL', 'Marine')).toBe('Industrials');
  });

  it('places clean-energy where GICS does', () => {
    expect(resolveSector('SHLS', 'Electrical Equipment')).toBe('Industrials'); // solar EBOS
    expect(resolveSector('FSLR', 'Semiconductors')).toBe('Information Technology'); // solar cell
    expect(resolveSector('LEU', 'Energy')).toBe('Energy'); // nuclear fuel
  });

  it('per-ticker overrides win over the fold, and cover non-equity holdings', () => {
    expect(resolveSector('CASH')).toBe('Cash');
    expect(resolveSector('ARKK', 'anything')).toBe('ETF');
    expect(resolveSector('sqqq')).toBe('ETF'); // case-insensitive ticker
  });

  it('returns null when unmapped (no override, no/unknown Finnhub label)', () => {
    expect(resolveSector('NEWCO')).toBeNull();
    expect(resolveSector('NEWCO', 'Some Novel Industry')).toBeNull();
  });
});
