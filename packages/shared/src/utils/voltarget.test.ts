import { describe, it, expect } from 'vitest';
import { volTargetScalar, DEFAULT_VOL_TARGET_CONFIG } from './voltarget';

describe('volTargetScalar', () => {
  it('realized vol == target → scalar 1.0', () => {
    expect(volTargetScalar(15, 15)).toBe(1);
  });

  it('below-target vol → scale up (toward the cap)', () => {
    // target 15 / realized 10 = 1.5, exactly at the default cap
    expect(volTargetScalar(10, 15)).toBeCloseTo(1.5, 10);
  });

  it('above-target vol → scale down (toward the floor)', () => {
    // target 15 / realized 30 = 0.5
    expect(volTargetScalar(30, 15)).toBeCloseTo(0.5, 10);
  });

  it('caps the scalar (never levers a low-vol name past the cap)', () => {
    // target 15 / realized 5 = 3.0, clamped to the default 1.5 cap
    expect(volTargetScalar(5, 15)).toBe(DEFAULT_VOL_TARGET_CONFIG.cap);
  });

  it('floors the scalar (never shrinks a high-vol name below the floor)', () => {
    // target 15 / realized 100 = 0.15, clamped to the default 0.3 floor
    expect(volTargetScalar(100, 15)).toBe(DEFAULT_VOL_TARGET_CONFIG.floor);
  });

  it('honors custom cap/floor', () => {
    expect(volTargetScalar(5, 15, 2.0, 0.25)).toBe(2.0);
    expect(volTargetScalar(150, 15, 2.0, 0.25)).toBe(0.25);
  });

  it('null / undefined realized vol → null (never a guessed 1.0)', () => {
    expect(volTargetScalar(null)).toBeNull();
    expect(volTargetScalar(undefined)).toBeNull();
  });

  it('non-positive realized vol → null', () => {
    expect(volTargetScalar(0)).toBeNull();
    expect(volTargetScalar(-5)).toBeNull();
  });

  it('non-positive target → null', () => {
    expect(volTargetScalar(15, 0)).toBeNull();
    expect(volTargetScalar(15, -1)).toBeNull();
  });

  it('uses the documented defaults when only realized vol is passed', () => {
    // realized 15 vs default target 15 → 1.0
    expect(volTargetScalar(15)).toBe(1);
  });
});
