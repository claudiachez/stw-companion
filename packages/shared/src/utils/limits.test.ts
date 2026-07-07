import { describe, it, expect } from 'vitest';
import {
  positionMarketValue, rollupByUnderlying, grossExposure,
  positionConcentration, sectorConcentration, grossExposureViolation,
  drawdownLadderTarget, evaluateRiskConfig,
  type PositionInput, type RiskConfig,
} from './limits';

const OPERATOR_LADDER = [
  { drawdownPct: -10, targetGrossPct: 70 },
  { drawdownPct: -15, targetGrossPct: 50 },
];

const OPERATOR_CONFIG: RiskConfig = {
  maxPositionPct: 10,
  maxSectorPct: 25,
  maxGrossPct: 100,
  ladder: OPERATOR_LADDER,
};

// A fixture book with known breaches: AAPL alone is 15% of equity (> 10% max),
// AAPL+MSFT (both 'Tech') sum to 27% (> 25% sector max), and the whole book is
// 112% gross (> 100% max).
const FIXTURE_BOOK: PositionInput[] = [
  { underlying: 'AAPL', quantity: 100, markPrice: 150, multiplier: 1 },   // $15,000
  { underlying: 'MSFT', quantity: 40, markPrice: 300, multiplier: 1 },    // $12,000
  { underlying: 'XOM', quantity: 500, markPrice: 110, multiplier: 1 },    // $55,000
  { underlying: 'SPY', quantity: -1, markPrice: 30000, multiplier: 1 },   // short $30,000 (options-style notional)
];
const FIXTURE_EQUITY = 100_000;
const FIXTURE_SECTORS: Record<string, string> = { AAPL: 'Tech', MSFT: 'Tech', XOM: 'Energy' };

describe('positionMarketValue', () => {
  it('multiplies quantity × markPrice × multiplier', () => {
    expect(positionMarketValue({ underlying: 'AAPL', quantity: 10, markPrice: 5, multiplier: 100 })).toBe(5000);
  });
  it('treats null quantity/markPrice/multiplier as zero/one respectively', () => {
    expect(positionMarketValue({ underlying: 'X', quantity: null, markPrice: 5, multiplier: null })).toBe(0);
  });
});

describe('rollupByUnderlying / grossExposure', () => {
  it('sums absolute value across legs of the same underlying', () => {
    const rolled = rollupByUnderlying(FIXTURE_BOOK);
    expect(rolled.AAPL).toBe(15000);
    expect(rolled.SPY).toBe(30000); // short — absolute value counts toward concentration
  });
  it('gross exposure sums absolute value across the whole book', () => {
    expect(grossExposure(FIXTURE_BOOK)).toBe(15000 + 12000 + 55000 + 30000);
  });
});

describe('positionConcentration', () => {
  it('flags AAPL as a breach (15% > 10% max)', () => {
    const violations = positionConcentration(FIXTURE_BOOK, FIXTURE_EQUITY, OPERATOR_CONFIG.maxPositionPct);
    const aapl = violations.find((v) => v.scope === 'AAPL')!;
    expect(aapl.exposurePct).toBeCloseTo(15, 5);
    expect(aapl.severity).toBe('breach');
  });
  it('does not flag a position under the limit', () => {
    const smallBook: PositionInput[] = [{ underlying: 'IBM', quantity: 10, markPrice: 100, multiplier: 1 }]; // $1,000 = 1%
    const violations = positionConcentration(smallBook, FIXTURE_EQUITY, OPERATOR_CONFIG.maxPositionPct);
    expect(violations[0].severity).toBe('ok');
  });
});

describe('sectorConcentration', () => {
  it('flags Tech (AAPL+MSFT = 27%) as a breach vs 25% max', () => {
    const violations = sectorConcentration(FIXTURE_BOOK, FIXTURE_SECTORS, FIXTURE_EQUITY, OPERATOR_CONFIG.maxSectorPct);
    const tech = violations.find((v) => v.scope === 'Tech')!;
    expect(tech.exposurePct).toBeCloseTo(27, 5);
    expect(tech.severity).toBe('breach');
  });
  it('rolls unmapped tickers into an "Unmapped" bucket instead of dropping them', () => {
    const violations = sectorConcentration(FIXTURE_BOOK, FIXTURE_SECTORS, FIXTURE_EQUITY, OPERATOR_CONFIG.maxSectorPct);
    const unmapped = violations.find((v) => v.scope === 'Unmapped')!;
    expect(unmapped.exposurePct).toBeCloseTo(30, 5); // SPY, unmapped in FIXTURE_SECTORS
  });
});

describe('grossExposureViolation', () => {
  it('flags the whole book as a breach (112% > 100% max)', () => {
    const v = grossExposureViolation(FIXTURE_BOOK, FIXTURE_EQUITY, OPERATOR_CONFIG.maxGrossPct);
    expect(v.exposurePct).toBeCloseTo(112, 5);
    expect(v.severity).toBe('breach');
    expect(v.scope).toBe('GROSS');
  });
});

describe('drawdownLadderTarget — all four ladder cells + no-breach', () => {
  it('no drawdown breached → null (no glide-path target)', () => {
    expect(drawdownLadderTarget(OPERATOR_LADDER, -5)).toBeNull();
  });
  it('first step breached (-10 to -14.99) → 70% target', () => {
    expect(drawdownLadderTarget(OPERATOR_LADDER, -10)).toBe(70);
    expect(drawdownLadderTarget(OPERATOR_LADDER, -12)).toBe(70);
  });
  it('deeper step breached (-15 and beyond) → 50% target (the deepest applicable)', () => {
    expect(drawdownLadderTarget(OPERATOR_LADDER, -15)).toBe(50);
    expect(drawdownLadderTarget(OPERATOR_LADDER, -22)).toBe(50);
  });
});

describe('evaluateRiskConfig', () => {
  it('proves multi-tenancy: two independent configs/books produce independent results', () => {
    const operatorResult = evaluateRiskConfig(FIXTURE_BOOK, FIXTURE_SECTORS, FIXTURE_EQUITY, OPERATOR_CONFIG, -12);

    const secondUserBook: PositionInput[] = [{ underlying: 'IBM', quantity: 5, markPrice: 100, multiplier: 1 }]; // $500 = 1% of $50k
    const secondUserConfig: RiskConfig = { maxPositionPct: 20, maxSectorPct: 40, maxGrossPct: 150, ladder: [] };
    const secondUserResult = evaluateRiskConfig(secondUserBook, {}, 50_000, secondUserConfig, null);

    expect(operatorResult.grossViolation.severity).toBe('breach');
    expect(secondUserResult.grossViolation.severity).toBe('ok');
    expect(operatorResult.ladderTargetGrossPct).toBe(70);
    expect(secondUserResult.ladderTargetGrossPct).toBeNull();
  });
});
