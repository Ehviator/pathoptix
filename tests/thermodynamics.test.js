import { describe, it, expect } from 'vitest';
import {
  calculateTruePressureAlt,
  getIsaTempDeviationFactor
} from '../src/engine/thermodynamics.js';

describe('Thermodynamics Physics Engine Tests', () => {
  describe('calculateTruePressureAlt', () => {
    it('should apply correct QNH pressure offset below 18,000 ft', () => {
      // Below 18,000 ft: True Pressure Alt = targetAlt + (29.92 - QNH) * 1000
      expect(calculateTruePressureAlt(5000, 29.92)).toBe(5000);
      expect(calculateTruePressureAlt(5000, 29.82)).toBe(5100);
      expect(calculateTruePressureAlt(5000, 30.02)).toBe(4900);
    });

    it('should bypass QNH pressure offset at or above 18,000 ft (Flight Levels)', () => {
      expect(calculateTruePressureAlt(18000, 29.82)).toBe(18000);
      expect(calculateTruePressureAlt(35000, 30.12)).toBe(35000);
    });

    it('should clamp QNH to safe operational bounds [25.0, 32.5]', () => {
      // 29.92 - 24.0 -> clamped to 25.0 -> offset = (29.92 - 25.0) * 1000 = 4920
      expect(calculateTruePressureAlt(5000, 24.0)).toBe(5000 + 4920);
      // 29.92 - 34.0 -> clamped to 32.5 -> offset = (29.92 - 32.5) * 1000 = -2580
      expect(calculateTruePressureAlt(5000, 34.0)).toBe(5000 - 2580);
    });

    it('should prevent negative output altitudes', () => {
      expect(calculateTruePressureAlt(100, 32.0)).toBe(0);
    });

    it('should handle invalid input types gracefully', () => {
      expect(calculateTruePressureAlt(null, undefined)).toBe(0);
    });
  });

  describe('getIsaTempDeviationFactor', () => {
    it('should return 0 if ISA deviation is zero or negative', () => {
      expect(getIsaTempDeviationFactor(0, 0.15)).toBe(0);
      expect(getIsaTempDeviationFactor(-10, 0.15)).toBe(0);
    });

    it('should calculate deviation factor correctly for positive deviations', () => {
      expect(getIsaTempDeviationFactor(10, 0.15)).toBeCloseTo(1.5, 5);
      expect(getIsaTempDeviationFactor(15, 12)).toBe(180);
    });

    it('should handle invalid input types gracefully', () => {
      expect(getIsaTempDeviationFactor(null, null)).toBe(0);
    });
  });
});
