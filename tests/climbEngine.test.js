import { describe, it, expect } from 'vitest';
import {
  lookupClimbPerfAtAlt,
  calculateClimbProfile,
  calculateAlternateClimbProfile,
} from '../src/engine/climbEngine.js';

// Minimal climb_perf.json fixture matching the real schema.
// Two altitude tiers so we can test inter-tier interpolation.
const mockClimbPerf = {
  climb_profiles: {
    '15000': {
      weights:     [85000, 105000, 130000, 136000],
      isa_headers: [-30, 0, 30],
      time_min:     [[3.0, 3.5, 4.4], [4.5, 5.0, 6.2], [6.5, 7.5, 9.0], ['--', '--', '--']],
      fuel_lbs:     [[300, 340, 410], [450, 500, 590], [620, 700, 840], ['--', '--', '--']],
      distance_nm:  [[15, 17, 21], [22, 25, 31], [30, 35, 42], ['--', '--', '--']],
    },
    '35000': {
      weights:     [85000, 105000, 130000, 136000],
      isa_headers: [-30, 0, 30],
      time_min:     [[10, 12, 15], [15, 18, 22], [22, 27, 33], ['--', '--', '--']],
      fuel_lbs:     [[900, 1050, 1280], [1350, 1550, 1890], [1950, 2250, 2750], ['--', '--', '--']],
      distance_nm:  [[60, 70, 85], [90, 105, 128], [130, 155, 188], ['--', '--', '--']],
    },
  },
};

describe('climbEngine — lookupClimbPerfAtAlt', () => {
  it('returns zeros for zero altitude (at field elevation)', () => {
    const result = lookupClimbPerfAtAlt(0, 105000, 0, mockClimbPerf);
    expect(result).toEqual({ time: 0, fuel: 0, dist: 0 });
  });

  it('interpolates correctly between SL and first tier for sub-tier altitude', () => {
    // At 7500 ft (half of 15000), expect half the 15000 ft values at 105000 lbs, ISA+0
    const result = lookupClimbPerfAtAlt(7500, 105000, 0, mockClimbPerf);
    expect(result).not.toBeNull();
    expect(result.time).toBeCloseTo(5.0 / 2, 1); // half of 5.0 min at 15000 ft
    expect(result.fuel).toBeCloseTo(500 / 2, 0); // half of 500 lbs
  });

  it('hits exact tier values at 35000 ft for known weight and ISA', () => {
    // 85000 lbs, ISA=0 → time_min = 12, fuel_lbs = 1050, distance_nm = 70
    const result = lookupClimbPerfAtAlt(35000, 85000, 0, mockClimbPerf);
    expect(result).not.toBeNull();
    expect(result.time).toBeCloseTo(12, 1);
    expect(result.fuel).toBeCloseTo(1050, 0);
    expect(result.dist).toBeCloseTo(70, 0);
  });

  it('interpolates altitude between 15000 and 35000 ft tiers', () => {
    // At 25000 ft (midpoint), result should be between 15000 and 35000 tier values
    const lo = lookupClimbPerfAtAlt(15000, 105000, 0, mockClimbPerf);
    const hi = lookupClimbPerfAtAlt(35000, 105000, 0, mockClimbPerf);
    const mid = lookupClimbPerfAtAlt(25000, 105000, 0, mockClimbPerf);
    expect(mid).not.toBeNull();
    expect(mid.time).toBeGreaterThan(lo.time);
    expect(mid.time).toBeLessThan(hi.time);
  });

  it('returns null for out-of-envelope weight (-- cells)', () => {
    // 136000 lbs has -- in all cells
    const result = lookupClimbPerfAtAlt(35000, 136000, 0, mockClimbPerf);
    expect(result).toBeNull();
  });

  it('returns null when climbPerf database is null', () => {
    expect(lookupClimbPerfAtAlt(35000, 105000, 0, null)).toBeNull();
  });
});

describe('climbEngine — calculateClimbProfile', () => {
  const standardInputs = {
    pressureTargetAlt:   35000,
    pressureFieldAlt:    0,
    weightLbs:           105000,
    isaDev:              0,
    atcSpeedRestriction: false,
    antiIce:             false,
    windBelow180:        0,
    windAbove180:        0,
  };

  it('returns positive time, fuel, distance under standard conditions', () => {
    const r = calculateClimbProfile(standardInputs, mockClimbPerf);
    expect(r.isOutOfEnvelope).toBe(false);
    expect(r.timeToClimb).toBeGreaterThan(0);
    expect(r.fuelBurned).toBeGreaterThan(0);
    expect(r.climbDistance).toBeGreaterThan(0);
    expect(r.averageROC).toBeGreaterThan(0);
  });

  it('ATC restriction adds ~1.8 min when climbing above 10,000 ft', () => {
    const noAtc = calculateClimbProfile({ ...standardInputs, atcSpeedRestriction: false }, mockClimbPerf);
    const atc   = calculateClimbProfile({ ...standardInputs, atcSpeedRestriction: true  }, mockClimbPerf);
    expect(atc.timeToClimb).toBeGreaterThan(noAtc.timeToClimb);
  });

  it('anti-ice increases time and fuel', () => {
    const clean = calculateClimbProfile({ ...standardInputs, antiIce: false }, mockClimbPerf);
    const iced  = calculateClimbProfile({ ...standardInputs, antiIce: true  }, mockClimbPerf);
    expect(iced.timeToClimb).toBeGreaterThan(clean.timeToClimb);
    expect(iced.fuelBurned).toBeGreaterThan(clean.fuelBurned);
  });

  it('tailwind increases ground distance; headwind decreases it', () => {
    const calm     = calculateClimbProfile({ ...standardInputs }, mockClimbPerf);
    const tail     = calculateClimbProfile({ ...standardInputs, windAbove180: 50 }, mockClimbPerf);
    const head     = calculateClimbProfile({ ...standardInputs, windAbove180: -50 }, mockClimbPerf);
    expect(tail.climbDistance).toBeGreaterThan(calm.climbDistance);
    expect(head.climbDistance).toBeLessThan(calm.climbDistance);
  });

  it('returns isOutOfEnvelope when weight puts matrix cells at "--"', () => {
    const r = calculateClimbProfile({ ...standardInputs, weightLbs: 136000 }, mockClimbPerf);
    expect(r.isOutOfEnvelope).toBe(true);
  });

  it('handles null inputs gracefully without throwing', () => {
    expect(() => calculateClimbProfile(null, mockClimbPerf)).not.toThrow();
    expect(calculateClimbProfile(null, mockClimbPerf).isOutOfEnvelope).toBe(true);
  });
});

describe('climbEngine — calculateAlternateClimbProfile', () => {
  const baseProfile = {
    timeToClimb: 20, fuelBurned: 1800, climbDistance: 100,
    averageROC: 1750, totalWindDisplacement: 0,
    isOutOfEnvelope: false, rawTime: 20, rawDist: 95,
  };

  it('returns equal values when alternate speed equals baseline (290 kt / M 0.76)', () => {
    const r = calculateAlternateClimbProfile(baseProfile, { compareIas: 290, compareMach: 0.76 });
    expect(r.timeDelta).toBe(0);
  });

  it('faster IAS increases time and fuel (drag-squared model)', () => {
    const fast = calculateAlternateClimbProfile(baseProfile, { compareIas: 320, compareMach: 0.76 });
    expect(fast.altTimeToClimb).toBeGreaterThan(baseProfile.timeToClimb);
    expect(fast.altFuelBurned).toBeGreaterThan(baseProfile.fuelBurned);
  });

  it('slower IAS increases time slightly (lower ROC at lower speed)', () => {
    const slow = calculateAlternateClimbProfile(baseProfile, { compareIas: 250, compareMach: 0.76 });
    expect(slow.altTimeToClimb).toBeGreaterThan(baseProfile.timeToClimb);
  });

  it('tailwind increases alternate distance', () => {
    const calm = calculateAlternateClimbProfile(baseProfile, { compareIas: 290, compareMach: 0.76, windAbove180: 0 });
    const tail = calculateAlternateClimbProfile(baseProfile, { compareIas: 290, compareMach: 0.76, windAbove180: 50 });
    expect(tail.altClimbDistance).toBeGreaterThan(calm.altClimbDistance);
  });
});
