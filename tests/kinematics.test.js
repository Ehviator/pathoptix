import { describe, it, expect } from 'vitest';
import {
  calculateDistanceNM,
  estimateTAS,
  calculateClimbPerformance,
  calculateDescentPerformance,
  calculateDriftdownCeiling,
  calculateDriftdownTrajectory
} from '../src/engine/kinematics.js';

describe('Kinematics Physics Engine Tests', () => {
  describe('calculateDistanceNM', () => {
    it('should calculate great-circle distance accurately', () => {
      // Distance between (45.3225, -75.6672) [CYOW] and (43.6777, -79.6248) [CYYZ] is approx 196 NM using the Haversine formula
      const dist = calculateDistanceNM(45.3225, -75.6672, 43.6777, -79.6248);
      expect(dist).toBe(196);
    });

    it('should return 0 if coordinates are identical', () => {
      expect(calculateDistanceNM(45, -75, 45, -75)).toBe(0);
    });

    it('should return 0 and not fail if coordinates exceed geographic bounds', () => {
      expect(calculateDistanceNM(95, -75, 45, -75)).toBe(0);
      expect(calculateDistanceNM(45, -190, 45, -75)).toBe(0);
    });

    it('should handle non-numeric parameters gracefully', () => {
      expect(calculateDistanceNM(null, undefined, 45, -75)).toBe(0);
    });
  });

  describe('estimateTAS', () => {
    it('should approximate TAS under typical cruise profiles', () => {
      // FL350, SAT -45C -> 450 + 0 * 1.2 + 0 * 0.5 = 450 kt
      expect(estimateTAS(350, -45)).toBe(450);
      // FL390, SAT -40C -> 450 + (5) * 1.2 + (40) * 0.5 = 450 + 6 + 20 = 476 kt
      expect(estimateTAS(390, -40)).toBe(476);
    });

    it('should default empty arguments to standard cruise parameters', () => {
      expect(estimateTAS(null, undefined)).toBe(450); // should default to FL350, -45C
    });
  });

  describe('calculateClimbPerformance', () => {
    const inputs = {
      climbWeight: 100000,
      isaDev: 0,
      atcSpeedRestriction: false,
      antiIce: false,
      windBelow180: 0,
      windAbove180: 0
    };

    it('should calculate climb parameters correctly under standard conditions', () => {
      const res = calculateClimbPerformance(inputs, 35000);
      expect(res.timeToClimb).toBeGreaterThan(0);
      expect(res.fuelBurned).toBeGreaterThan(0);
      expect(res.climbDistance).toBeGreaterThan(0);
      expect(res.averageROC).toBeGreaterThan(0);
    });

    it('should apply wind correction displacement correctly', () => {
      const calm = calculateClimbPerformance(inputs, 30000);
      const headwindInputs = { ...inputs, windBelow180: -20, windAbove180: -40 };
      const headwind = calculateClimbPerformance(headwindInputs, 30000);
      expect(headwind.climbDistance).toBeLessThan(calm.climbDistance);
    });

    it('should handle completely empty or undefined inputs without crashing', () => {
      expect(() => calculateClimbPerformance(null, null)).not.toThrow();
      const res = calculateClimbPerformance(null, 15000);
      expect(res.timeToClimb).toBeGreaterThan(0);
      expect(res.fuelBurned).toBeGreaterThan(0);
    });
  });

  describe('calculateDescentPerformance', () => {
    const inputs = {
      fpa: 3.0,
      descentSpeed: 270,
      flightIdleIcing: false,
      speedTransitionAlt: 10000,
      descentWind: 0
    };

    it('should calculate descent profile parameters correctly', () => {
      const res = calculateDescentPerformance(inputs, 350, 3000);
      expect(res.todDistance).toBeGreaterThan(0);
      expect(res.vsi).toBeLessThan(0); // descent rate should be negative VSI
      expect(res.fuelFlowLbs).toBeGreaterThan(0);
    });

    it('should handle wind corrections correctly', () => {
      const calm = calculateDescentPerformance(inputs, 350, 3000);
      const headwindInputs = { ...inputs, descentWind: -30 };
      const headwind = calculateDescentPerformance(headwindInputs, 350, 3000);
      // Headwind -> TOD is closer to airport -> todDistance is smaller
      expect(headwind.todDistance).toBeLessThan(calm.todDistance);
    });

    it('should clamp FPA safely to prevent division by zero or extreme angles', () => {
      const zeroFpaRes = calculateDescentPerformance({ ...inputs, fpa: 0 }, 350, 3000);
      expect(zeroFpaRes.todDistance).toBeGreaterThan(0);
      
      const extremeFpaRes = calculateDescentPerformance({ ...inputs, fpa: 12 }, 350, 3000);
      expect(extremeFpaRes.todDistance).toBeGreaterThan(0);
    });

    it('should handle null parameters safely without throwing', () => {
      expect(() => calculateDescentPerformance(null, null, null)).not.toThrow();
    });
  });

  describe('calculateDriftdownCeiling', () => {
    const mockDriftdownDb = {
      weights: [85000, 100000, 118000, 136000],
      isa_headers: [-15, 0, 15],
      single_engine_ceilings: [
        [25000, 24000, 22000],
        [23000, 22000, 20000],
        [21000, 20000, 18000],
        [19000, 18000, 16000]
      ]
    };

    it('should interpolate ceiling based on weight and ISA', () => {
      expect(calculateDriftdownCeiling(100000, 0, mockDriftdownDb)).toBe(22000);
      expect(calculateDriftdownCeiling(118000, 15, mockDriftdownDb)).toBe(18000);
      expect(calculateDriftdownCeiling(109000, 0, mockDriftdownDb)).toBe(21000);
    });

    it('should handle missing databases and fall back to realistic defaults', () => {
      expect(calculateDriftdownCeiling(100000, 0, null)).toBe(22000);
      expect(calculateDriftdownCeiling(135000, 15, null)).toBe(16000);
    });
  });

  describe('calculateDriftdownTrajectory', () => {
    it('should calculate driftdown distance and gradient', () => {
      const res = calculateDriftdownTrajectory(36000, 22000);
      expect(res.driftdownDistance).toBe(98);
      expect(res.altLoss).toBe(14000);
      expect(res.gradient).toBeGreaterThan(1.0);
    });
  });
});
