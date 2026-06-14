import { describe, it, expect } from 'vitest';
import {
  lookupDescentPerfForFpa,
  lookupDescentPerf,
  calculateDescentProfile,
} from '../src/engine/descentEngine.js';

const mockDescentPerf = {
  descent_profiles: {
    '2.0': {
      alt_diff_headers: [10000, 20000, 30000],
      speed_headers:    [260, 280, 300],
      distance_nm: [[30, 35, 40], [55, 65, 75], [80, 95, 110]],
      time_min:    [[8,  9,  10], [15, 18, 21], [22, 26, 30]],
      fuel_lbs:    [[400, 460, 520], [720, 840, 960], [1050, 1220, 1390]],
    },
    '3.0': {
      alt_diff_headers: [10000, 20000, 30000],
      speed_headers:    [260, 280, 300],
      distance_nm: [[20, 23, 27], [37, 43, 50], [54, 63, 73]],
      time_min:    [[5,  6,  7],  [10, 12, 14], [15, 17, 20]],
      fuel_lbs:    [[350, 400, 455], [630, 725, 825], [920, 1060, 1200]],
    },
    '4.0': {
      alt_diff_headers: [10000, 20000, 30000],
      speed_headers:    [260, 280, 300],
      distance_nm: [[15, 17, 20], [28, 32, 37], [40, 47, 54]],
      time_min:    [[4,  5,  5],  [7,  9,  10], [11, 13, 15]],
      fuel_lbs:    [[310, 355, 400], [560, 640, 730], [810, 935, 1060]],
    },
  },
};

describe('descentEngine — lookupDescentPerfForFpa', () => {
  it('returns correct values at exact grid point', () => {
    const r = lookupDescentPerfForFpa('3.0', 20000, 280, mockDescentPerf);
    expect(r).not.toBeNull();
    expect(r.dist).toBeCloseTo(43, 0);
    expect(r.time).toBeCloseTo(12, 0);
    expect(r.fuel).toBeCloseTo(725, 0);
  });

  it('interpolates between speed values', () => {
    const lo = lookupDescentPerfForFpa('3.0', 20000, 260, mockDescentPerf);
    const hi = lookupDescentPerfForFpa('3.0', 20000, 300, mockDescentPerf);
    const mid = lookupDescentPerfForFpa('3.0', 20000, 280, mockDescentPerf);
    expect(mid.dist).toBeGreaterThan(lo.dist);
    expect(mid.dist).toBeLessThan(hi.dist);
  });

  it('returns null for unknown fpaKey', () => {
    expect(lookupDescentPerfForFpa('5.0', 20000, 280, mockDescentPerf)).toBeNull();
  });

  it('returns null when descentPerf is null', () => {
    expect(lookupDescentPerfForFpa('3.0', 20000, 280, null)).toBeNull();
  });
});

describe('descentEngine — lookupDescentPerf', () => {
  it('hits exact FPA tier value at 3.0 degrees', () => {
    const r = lookupDescentPerf(3.0, 20000, 280, mockDescentPerf);
    expect(r).not.toBeNull();
    expect(r.dist).toBeCloseTo(43, 0);
  });

  it('interpolates between FPA 2.0 and 3.0', () => {
    const lo  = lookupDescentPerf(2.0, 20000, 280, mockDescentPerf);
    const hi  = lookupDescentPerf(3.0, 20000, 280, mockDescentPerf);
    const mid = lookupDescentPerf(2.5, 20000, 280, mockDescentPerf);
    expect(mid).not.toBeNull();
    expect(mid.dist).toBeGreaterThan(hi.dist);
    expect(mid.dist).toBeLessThan(lo.dist);
  });

  it('clamps to minimum FPA when below range', () => {
    const clamped = lookupDescentPerf(1.0, 20000, 280, mockDescentPerf);
    const floor   = lookupDescentPerf(2.0, 20000, 280, mockDescentPerf);
    expect(clamped).not.toBeNull();
    expect(clamped.dist).toBeCloseTo(floor.dist, 0);
  });

  it('clamps to maximum FPA when above range', () => {
    const clamped = lookupDescentPerf(5.0, 20000, 280, mockDescentPerf);
    const ceiling = lookupDescentPerf(4.0, 20000, 280, mockDescentPerf);
    expect(clamped).not.toBeNull();
    expect(clamped.dist).toBeCloseTo(ceiling.dist, 0);
  });

  it('returns null when descentPerf is null', () => {
    expect(lookupDescentPerf(3.0, 20000, 280, null)).toBeNull();
  });
});

describe('descentEngine — calculateDescentProfile', () => {
  const standardInputs = {
    fpa:               3.0,
    altDiff:           30000,
    descentSpeed:      280,
    speedTransitionAlt: 10000,
    trueTargetAlt:     3000,
    descentWind:       0,
    flightIdleIcing:   false,
    destinationOAT:    15,
  };

  it('returns positive outputs under standard conditions', () => {
    const r = calculateDescentProfile(standardInputs, mockDescentPerf);
    expect(r.isOutOfEnvelope).toBe(false);
    expect(r.todDistance).toBeGreaterThan(0);
    expect(r.vsi).toBeLessThan(0);
    expect(r.glideRatio).toBeGreaterThan(0);
    expect(r.fuelBurned).toBeGreaterThan(0);
  });

  it('returns isOutOfEnvelope when altDiff is zero or negative', () => {
    const r = calculateDescentProfile({ ...standardInputs, altDiff: 0 }, mockDescentPerf);
    expect(r.isOutOfEnvelope).toBe(true);
  });

  it('flight idle icing increases TOD distance', () => {
    const clean = calculateDescentProfile({ ...standardInputs, flightIdleIcing: false }, mockDescentPerf);
    const iced  = calculateDescentProfile({ ...standardInputs, flightIdleIcing: true  }, mockDescentPerf);
    expect(iced.todDistance).toBeGreaterThan(clean.todDistance);
  });

  it('tailwind increases TOD distance; headwind decreases it', () => {
    const calm = calculateDescentProfile({ ...standardInputs }, mockDescentPerf);
    const tail = calculateDescentProfile({ ...standardInputs, descentWind:  50 }, mockDescentPerf);
    const head = calculateDescentProfile({ ...standardInputs, descentWind: -50 }, mockDescentPerf);
    expect(tail.todDistance).toBeGreaterThan(calm.todDistance);
    expect(head.todDistance).toBeLessThan(calm.todDistance);
  });

  it('adds deceleration distance when descent speed exceeds 250 KIAS below transition', () => {
    const withDec  = calculateDescentProfile({ ...standardInputs, descentSpeed: 300, trueTargetAlt: 3000, speedTransitionAlt: 10000 }, mockDescentPerf);
    const noDec    = calculateDescentProfile({ ...standardInputs, descentSpeed: 240, trueTargetAlt: 3000, speedTransitionAlt: 10000 }, mockDescentPerf);
    expect(withDec.decelerationDistance).toBeGreaterThan(0);
    expect(noDec.decelerationDistance).toBe(0);
  });

  it('sets coldTempActive when OAT ≤ 0°C', () => {
    const r = calculateDescentProfile({ ...standardInputs, destinationOAT: -5 }, mockDescentPerf);
    expect(r.coldTempActive).toBe(true);
    expect(r.coldTempCarsWarning).toBe(false);
  });

  it('sets coldTempCarsWarning when OAT ≤ -15°C (CARs 602.35)', () => {
    const r = calculateDescentProfile({ ...standardInputs, destinationOAT: -20 }, mockDescentPerf);
    expect(r.coldTempActive).toBe(true);
    expect(r.coldTempCarsWarning).toBe(true);
  });

  it('does not set cold temp flags when OAT is above 0°C', () => {
    const r = calculateDescentProfile({ ...standardInputs, destinationOAT: 10 }, mockDescentPerf);
    expect(r.coldTempActive).toBe(false);
    expect(r.coldTempCarsWarning).toBe(false);
  });

  it('handles null inputs gracefully without throwing', () => {
    expect(() => calculateDescentProfile(null, mockDescentPerf)).not.toThrow();
    expect(calculateDescentProfile(null, mockDescentPerf).isOutOfEnvelope).toBe(true);
  });
});
