import { describe, it, expect } from 'vitest';
import {
  interpolate1D,
  interpolate2D,
  getLegalMaxAltitude
} from '../src/engine/interpolation.js';

describe('Interpolation Engine Tests', () => {
  describe('interpolate1D', () => {
    it('should correctly interpolate between two points', () => {
      expect(interpolate1D(5, 0, 10, 50, 100)).toBe(75);
      expect(interpolate1D(2, 0, 10, 50, 100)).toBe(60);
    });

    it('should return y0 if x0 equals x1', () => {
      expect(interpolate1D(5, 10, 10, 50, 100)).toBe(50);
    });

    it('should return null if any output bounds are sentinel values or null', () => {
      expect(interpolate1D(5, 0, 10, null, 100)).toBeNull();
      expect(interpolate1D(5, 0, 10, 50, '--')).toBeNull();
    });

    it('should handle non-numeric inputs gracefully by defaulting', () => {
      expect(interpolate1D('invalid', 0, 10, 50, 100)).toBe(50);
    });
  });

  describe('interpolate2D', () => {
    const rowHeaders = [10000, 20000, 30000];
    const colHeaders = [80000, 100000, 120000];
    const dataMatrix = [
      [10, 20, 30],
      [40, 50, 60],
      [70, 80, 90]
    ];

    it('should correctly interpolate values bilinearly inside grid bounds', () => {
      // row = 15000, col = 90000
      // Row 15000 is between 10000 and 20000
      // Col 90000 is between 80000 and 100000
      // At row=10000: interp(90000, 80k, 100k, 10, 20) = 15
      // At row=20000: interp(90000, 80k, 100k, 40, 50) = 45
      // At col=90000: interp(15000, 10k, 20k, 15, 45) = 30
      expect(interpolate2D(15000, 90000, rowHeaders, colHeaders, dataMatrix)).toBe(30);
    });

    it('should clamp out-of-bounds queries to grid edges', () => {
      // row = 5000, col = 70000 -> clamped to row = 10000, col = 80000
      expect(interpolate2D(5000, 70000, rowHeaders, colHeaders, dataMatrix)).toBe(10);
      
      // row = 35000, col = 130000 -> clamped to row = 30000, col = 120000
      expect(interpolate2D(35000, 130000, rowHeaders, colHeaders, dataMatrix)).toBe(90);
    });

    it('should return null if any bounding cell is a sentinel limit "--"', () => {
      const envelopeLimitMatrix = [
        [10, 20, 30],
        [40, '--', 60],
        [70, 80, 90]
      ];
      // A query bracketing the center cell should return null
      expect(interpolate2D(15000, 90000, rowHeaders, colHeaders, envelopeLimitMatrix)).toBeNull();
    });

    it('should handle malformed, empty or mismatched matrices safely', () => {
      expect(interpolate2D(15000, 90000, [], [], [])).toBeNull();
      expect(interpolate2D(15000, 90000, null, colHeaders, dataMatrix)).toBeNull();
    });
  });

  describe('getLegalMaxAltitude', () => {
    it('should return max standard ceiling for light weights', () => {
      expect(getLegalMaxAltitude(70000)).toBe(410);
      expect(getLegalMaxAltitude(82000)).toBe(410);
    });

    it('should step down operating ceiling as weight increases', () => {
      // weight = 120,000 lbs is between 118,000 (390) and 124,000 (380).
      // It must step down to 380.
      expect(getLegalMaxAltitude(120000)).toBe(380);

      // weight = 135,000 lbs is between 130,000 (380) and 136,000 (350).
      // It must step down to 350.
      expect(getLegalMaxAltitude(135000)).toBe(350);
    });

    it('should clamp ceiling for extreme heavy weights', () => {
      expect(getLegalMaxAltitude(145000)).toBe(350);
    });
  });
});
