import { describe, it, expect } from 'vitest';
import {
  calculateContingencyFuel,
  calculateAlternateFuel,
  calculateFinalReserveFuel,
  calculateRequiredBlockFuel,
  validateWeights,
  LIMITS,
  RAMP_FUEL_TOLERANCE_LBS,
} from '../src/engine/fuelLegality.js';

describe('CARs 705 Fuel Legality Calculations', () => {
  it('calculates contingency fuel as 5% of trip fuel', () => {
    expect(calculateContingencyFuel(10000)).toBe(500);
    expect(calculateContingencyFuel(15600)).toBe(780);
    expect(calculateContingencyFuel(0)).toBe(0);
  });

  it('returns zero alternate fuel for zero distance', () => {
    expect(calculateAlternateFuel(0, 105000)).toBe(0);
    expect(calculateAlternateFuel(-10, 105000)).toBe(0);
  });

  it('alternate fuel scales with distance (weight-adjusted model)', () => {
    const short  = calculateAlternateFuel(80,  105000);
    const medium = calculateAlternateFuel(152, 105000);
    const long   = calculateAlternateFuel(250, 105000);
    expect(medium).toBeGreaterThan(short);
    expect(long).toBeGreaterThan(medium);
  });

  it('alternate fuel increases with aircraft weight', () => {
    const light  = calculateAlternateFuel(152, 85000);
    const heavy  = calculateAlternateFuel(152, 130000);
    expect(heavy).toBeGreaterThan(light);
  });

  it('alternate fuel includes fixed overhead at minimum distance', () => {
    // At very short distance the overhead (800 lbs) dominates
    const veryShort = calculateAlternateFuel(10, 100000);
    expect(veryShort).toBeGreaterThan(800);
    expect(veryShort).toBeLessThan(1200);
  });

  it('alternate fuel is more conservative than legacy heuristic for typical sectors', () => {
    // Legacy: 152 * 12.5 + 400 = 2300 lbs
    const legacyAlternate = Math.round(152 * 12.5 + 400);
    const newAlternate    = calculateAlternateFuel(152, 105000);
    expect(newAlternate).toBeGreaterThan(legacyAlternate);
  });

  it('calculates final reserve fuel (30-min hold) based on aircraft weight', () => {
    expect(calculateFinalReserveFuel(100000)).toBe(1650);  // 1150 + 500
    expect(calculateFinalReserveFuel(136200)).toBe(1831);  // 1150 + 681
    expect(calculateFinalReserveFuel(85000)).toBe(1575);   // 1150 + 425
    expect(calculateFinalReserveFuel(0)).toBe(1150);
  });

  it('sums all segments into required block fuel', () => {
    const taxi        = 400;
    const trip        = 15600;
    const contingency = calculateContingencyFuel(trip);    // 780
    const alternate   = calculateAlternateFuel(152, 125000);
    const reserve     = calculateFinalReserveFuel(125000); // 1775
    const required    = calculateRequiredBlockFuel(taxi, trip, contingency, alternate, reserve);
    expect(required).toBe(taxi + trip + contingency + alternate + reserve);
    expect(required).toBeGreaterThan(18000);
  });
});

describe('E195-E2 Weight Validation', () => {
  it('returns no violations for weights well within limits', () => {
    const violations = validateWeights({ zfw: 95000, tow: 120000, landingWeight: 105000 });
    expect(violations).toHaveLength(0);
  });

  it('flags RED when TOW exceeds MTOW', () => {
    const violations = validateWeights({ zfw: 95000, tow: 137000, landingWeight: 105000 });
    const tow = violations.find(v => v.field === 'tow');
    expect(tow).toBeDefined();
    expect(tow.severity).toBe('RED');
    expect(tow.label).toBe('MTOW');
    expect(tow.limit).toBe(LIMITS.MTOW_LBS);
  });

  it('flags AMBER when TOW is within 3% of MTOW', () => {
    const nearMtow = Math.round(LIMITS.MTOW_LBS * 0.98); // 2% below MTOW
    const violations = validateWeights({ zfw: 90000, tow: nearMtow, landingWeight: 100000 });
    const tow = violations.find(v => v.field === 'tow');
    expect(tow).toBeDefined();
    expect(tow.severity).toBe('AMBER');
  });

  it('flags RED when ZFW exceeds MZFW', () => {
    const violations = validateWeights({ zfw: 110000, tow: 125000, landingWeight: 108000 });
    const zfw = violations.find(v => v.field === 'zfw');
    expect(zfw).toBeDefined();
    expect(zfw.severity).toBe('RED');
    expect(zfw.label).toBe('MZFW');
  });

  it('flags RED when landing weight exceeds MLW', () => {
    const violations = validateWeights({ zfw: 95000, tow: 130000, landingWeight: 118000 });
    const lw = violations.find(v => v.field === 'landingWeight');
    expect(lw).toBeDefined();
    expect(lw.severity).toBe('RED');
    expect(lw.label).toBe('MLW');
  });

  it('can flag multiple violations simultaneously', () => {
    const violations = validateWeights({ zfw: 110000, tow: 138000, landingWeight: 120000 });
    expect(violations.length).toBeGreaterThanOrEqual(3);
  });

  it('ignores zero weight fields (unset inputs)', () => {
    const violations = validateWeights({ zfw: 0, tow: 0, landingWeight: 0 });
    expect(violations).toHaveLength(0);
  });

  it('exports correct structural limit constants', () => {
    expect(LIMITS.MTOW_LBS).toBe(136000);
    expect(LIMITS.MLW_LBS).toBe(115741);
    expect(LIMITS.MZFW_LBS).toBe(107143);
  });

  it('exports ramp fuel tolerance constant', () => {
    expect(RAMP_FUEL_TOLERANCE_LBS).toBe(500);
  });
});
