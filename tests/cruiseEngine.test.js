import { describe, it, expect } from 'vitest';
import {
  lookupCruiseMach,
  calculateCruiseFuelFlow,
  calculateCruiseSpeeds,
  calculateSpecificRange,
  buildStepClimbAdvisory,
} from '../src/engine/cruiseEngine.js';

// Minimal cruise matrix fixture matching cruise_econ.json schema
const mockMatrix = {
  cruise_mach_matrix: {
    '35000': {
      weights:             [82000, 100000, 118000, 136000],
      cost_index_headers:  [0,     30,     80,     120],
      data: [
        [0.68, 0.74, 0.78, 0.80],  // 82,000 lbs
        [0.70, 0.76, 0.79, 0.81],  // 100,000 lbs
        [0.72, 0.77, 0.80, 0.82],  // 118,000 lbs
        ['--', '--', '--', '--'],   // 136,000 lbs — above buffet limit at FL350
      ],
    },
    '33000': {
      weights:             [82000, 100000, 118000, 136000],
      cost_index_headers:  [0,     30,     80,     120],
      data: [
        [0.70, 0.75, 0.79, 0.81],
        [0.72, 0.77, 0.80, 0.82],
        [0.74, 0.78, 0.82, 0.82],
        [0.76, 0.79, 0.82, 0.82],
      ],
    },
  },
};

describe('cruiseEngine — lookupCruiseMach', () => {
  it('returns correct Mach by interpolating weight and CI', () => {
    // 100,000 lbs, CI 30, FL350 → data cell value 0.76
    const { mach, isOutOfEnvelope } = lookupCruiseMach(100000, 350, 30, mockMatrix);
    expect(mach).toBeCloseTo(0.76, 2);
    expect(isOutOfEnvelope).toBe(false);
  });

  it('detects out-of-envelope (-- cells in matrix)', () => {
    // 136,000 lbs at FL350 is all "--" in fixture
    const { isOutOfEnvelope } = lookupCruiseMach(136000, 350, 30, mockMatrix);
    expect(isOutOfEnvelope).toBe(true);
  });

  it('falls back to FL330 matrix when exact FL is not published', () => {
    // FL360 not in fixture — should fall back to FL330 without throwing
    const { mach } = lookupCruiseMach(100000, 360, 30, mockMatrix);
    expect(mach).toBeGreaterThan(0.70);
    expect(mach).toBeLessThan(0.85);
  });

  it('returns safe default Mach when cruiseMatrix is null', () => {
    const { mach, isOutOfEnvelope } = lookupCruiseMach(100000, 350, 30, null);
    expect(mach).toBe(0.76);
    expect(isOutOfEnvelope).toBe(false);
  });
});

describe('cruiseEngine — calculateCruiseFuelFlow', () => {
  it('returns a positive lbs/hr value under standard conditions', () => {
    const ff = calculateCruiseFuelFlow({
      weightLbs:   100000,
      fl:          350,
      mach:        0.78,
      isaDev:      0,
      antiIce:     false,
      cgMac:       22.5,
      dragPenalty: 0,
    });
    expect(ff).toBeGreaterThan(0);
    expect(ff).toBeGreaterThan(2500); // sanity floor — E195-E2 burns more than 2500 lbs/hr
    expect(ff).toBeLessThan(8000);    // sanity ceiling — not a 747
  });

  it('anti-ice ON increases fuel flow', () => {
    const base    = calculateCruiseFuelFlow({ weightLbs: 100000, fl: 350, mach: 0.78, isaDev: 0, antiIce: false, cgMac: 22.5, dragPenalty: 0 });
    const icing   = calculateCruiseFuelFlow({ weightLbs: 100000, fl: 350, mach: 0.78, isaDev: 0, antiIce: true,  cgMac: 22.5, dragPenalty: 0 });
    expect(icing).toBeGreaterThan(base);
  });

  it('higher Mach increases fuel flow', () => {
    const slow = calculateCruiseFuelFlow({ weightLbs: 100000, fl: 350, mach: 0.74, isaDev: 0, antiIce: false, cgMac: 22.5, dragPenalty: 0 });
    const fast = calculateCruiseFuelFlow({ weightLbs: 100000, fl: 350, mach: 0.82, isaDev: 0, antiIce: false, cgMac: 22.5, dragPenalty: 0 });
    expect(fast).toBeGreaterThan(slow);
  });

  it('higher altitude reduces fuel flow (thinner air benefit)', () => {
    const low  = calculateCruiseFuelFlow({ weightLbs: 100000, fl: 280, mach: 0.78, isaDev: 0, antiIce: false, cgMac: 22.5, dragPenalty: 0 });
    const high = calculateCruiseFuelFlow({ weightLbs: 100000, fl: 390, mach: 0.78, isaDev: 0, antiIce: false, cgMac: 22.5, dragPenalty: 0 });
    expect(high).toBeLessThan(low);
  });

  it('drag penalty increases fuel flow proportionally', () => {
    const clean = calculateCruiseFuelFlow({ weightLbs: 100000, fl: 350, mach: 0.78, isaDev: 0, antiIce: false, cgMac: 22.5, dragPenalty: 0   });
    const dirty = calculateCruiseFuelFlow({ weightLbs: 100000, fl: 350, mach: 0.78, isaDev: 0, antiIce: false, cgMac: 22.5, dragPenalty: 10  });
    expect(dirty).toBeGreaterThan(clean);
  });

  it('positive ISA deviation increases fuel flow', () => {
    const isa    = calculateCruiseFuelFlow({ weightLbs: 100000, fl: 350, mach: 0.78, isaDev: 0,  antiIce: false, cgMac: 22.5, dragPenalty: 0 });
    const hotDay = calculateCruiseFuelFlow({ weightLbs: 100000, fl: 350, mach: 0.78, isaDev: 15, antiIce: false, cgMac: 22.5, dragPenalty: 0 });
    expect(hotDay).toBeGreaterThan(isa);
  });

  it('returns a positive value when inputs are all zero (minimum clamp active)', () => {
    const ff = calculateCruiseFuelFlow({ weightLbs: 0, fl: 0, mach: 0, isaDev: 0, antiIce: false, cgMac: 22.5, dragPenalty: 0 });
    expect(ff).toBeGreaterThan(0);
  });
});

describe('cruiseEngine — calculateCruiseSpeeds', () => {
  it('returns physically plausible TAS for M0.78 at FL350 ISA', () => {
    // ISA at FL350: -54.3°C → speed of sound ≈ 573 kt → TAS ≈ 447 kt
    const { tas, gs } = calculateCruiseSpeeds(350, 0.78, 0, 0);
    expect(tas).toBeGreaterThan(430);
    expect(tas).toBeLessThan(470);
    expect(gs).toBe(tas); // zero wind
  });

  it('applies wind correctly: tailwind increases GS, headwind decreases it', () => {
    const { tas, gs: gsTail } = calculateCruiseSpeeds(350, 0.78, 0, 50);
    const { gs: gsHead }       = calculateCruiseSpeeds(350, 0.78, 0, -50);
    expect(gsTail).toBe(tas + 50);
    expect(gsHead).toBe(tas - 50);
  });

  it('positive ISA deviation raises actual temperature, increases TAS at same Mach', () => {
    // Signature: calculateCruiseSpeeds(fl, mach, isaDev, wind)
    const { tas: tasIsa } = calculateCruiseSpeeds(350, 0.78,  0, 0);
    const { tas: tasHot } = calculateCruiseSpeeds(350, 0.78, 20, 0); // isaDev=+20°C, wind=0
    // Warmer air → higher speed of sound → higher TAS at same Mach
    expect(tasHot).toBeGreaterThan(tasIsa);
  });
});

describe('cruiseEngine — calculateSpecificRange', () => {
  it('calculates SR correctly', () => {
    // 450 kt GS at 3000 lbs/hr → 0.15 NM/lb
    expect(calculateSpecificRange(450, 3000)).toBeCloseTo(0.15, 2);
  });

  it('returns 0 when fuel flow is zero (prevents division by zero)', () => {
    expect(calculateSpecificRange(450, 0)).toBe(0);
  });
});

describe('cruiseEngine — buildStepClimbAdvisory', () => {
  it('recommends burning fuel when aircraft exceeds step-ceiling weight', () => {
    // nextStepFL = 370; maxWeightForFL(370) = 130,000 lbs (from buffet-margin table)
    // At 133,000 lbs, the aircraft is 3,000 lbs over the FL370 ceiling weight
    const result = buildStepClimbAdvisory(133000, 350, 4000);
    expect(result.recommendation).toBe('BURN_BEFORE_STEP');
    expect(result.weightToBurnLbs).toBe(3000);
    expect(result.minutesToStep).toBeGreaterThan(0);
  });

  it('recommends immediate step when aircraft is at or below step-ceiling weight', () => {
    // At 82,000 lbs, aircraft is well below all ceiling thresholds
    const result = buildStepClimbAdvisory(82000, 350, 4000);
    expect(result.recommendation).toBe('STEP_NOW');
    expect(result.weightToBurnLbs).toBe(0);
  });

  it('returns AT_CEILING only when next step exceeds the absolute structural ceiling (FL410)', () => {
    // currentFL = 400, nextStepFL = 420 — above the E195-E2 absolute ceiling of FL410
    const result = buildStepClimbAdvisory(82000, 400, 4000);
    expect(result.recommendation).toBe('AT_CEILING');
  });

  it('returns BURN_BEFORE_STEP (not AT_CEILING) when heavy aircraft can unlock step by burning fuel', () => {
    // 136,000 lbs at FL350: nextStepFL = 370, stepCeilingWeight = 130,000 lbs
    // The aircraft CAN reach FL370 eventually — it must burn 6,000 lbs first
    const result = buildStepClimbAdvisory(136000, 350, 4000);
    expect(result.recommendation).toBe('BURN_BEFORE_STEP');
    expect(result.weightToBurnLbs).toBe(6000);
  });
});
