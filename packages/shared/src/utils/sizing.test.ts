import { describe, it, expect } from 'vitest';
import { sizingTone } from './sizing';

describe('sizingTone', () => {
  it('null → neutral em-dash', () => {
    const t = sizingTone(null);
    expect(t.state).toBe('inline');
    expect(t.label).toBe('—');
  });

  it('within ±0.5 of parity → in line (neutral)', () => {
    expect(sizingTone(0).state).toBe('inline');
    expect(sizingTone(0.4).state).toBe('inline');
    expect(sizingTone(-0.5).state).toBe('inline');
    expect(sizingTone(0.4).label).toBe('in line');
  });

  it('heavier than the trader → oversized, warning tone', () => {
    const t = sizingTone(1.2);
    expect(t.state).toBe('oversized');
    expect(t.label).toBe('+1.2% oversized');
    expect(t.textVar).toContain('warning');
  });

  it('lighter than the trader → undersized, info tone (distinct from oversized)', () => {
    const t = sizingTone(-1.2);
    expect(t.state).toBe('undersized');
    expect(t.label).toBe('-1.2% undersized');
    expect(t.textVar).toContain('info');
    expect(t.textVar).not.toBe(sizingTone(1.2).textVar);
  });

  it('respects a custom threshold', () => {
    expect(sizingTone(1.5, 2).state).toBe('inline');
    expect(sizingTone(2.5, 2).state).toBe('oversized');
  });
});
