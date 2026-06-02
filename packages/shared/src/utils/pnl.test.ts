import { describe, it, expect } from 'vitest';
import { resolvePnl } from './pnl';

describe('resolvePnl', () => {
  it('shares → equity P&L from price vs cost', () => {
    const r = resolvePnl({ positionType: 'shares', price: 110, costBasis: 100, optionsPnlPct: null });
    expect(r.equityPnl).toBeCloseTo(10);
    expect(r.pnlPct).toBeCloseTo(10);
  });

  it('options → IBKR options P&L passthrough', () => {
    const r = resolvePnl({ positionType: 'options', price: 110, costBasis: 100, optionsPnlPct: 42 });
    expect(r.optionsPnl).toBe(42);
    expect(r.pnlPct).toBe(42);
  });

  it('mixed → average of equity and options when both present', () => {
    const r = resolvePnl({ positionType: 'mixed', price: 120, costBasis: 100, optionsPnlPct: 40 });
    expect(r.equityPnl).toBeCloseTo(20);
    expect(r.pnlPct).toBeCloseTo(30); // (20 + 40) / 2
  });

  it('mixed → falls back to whichever side exists', () => {
    expect(resolvePnl({ positionType: 'mixed', price: 120, costBasis: 100, optionsPnlPct: null }).pnlPct).toBeCloseTo(20);
    expect(resolvePnl({ positionType: 'mixed', price: null, costBasis: null, optionsPnlPct: 15 }).pnlPct).toBe(15);
  });

  it('returns null pnl when no inputs resolve', () => {
    expect(resolvePnl({ positionType: 'shares', price: null, costBasis: null, optionsPnlPct: null }).pnlPct).toBeNull();
  });

  it('null positionType falls through to equity calc', () => {
    expect(resolvePnl({ positionType: null, price: 110, costBasis: 100, optionsPnlPct: null }).pnlPct).toBeCloseTo(10);
  });
});
