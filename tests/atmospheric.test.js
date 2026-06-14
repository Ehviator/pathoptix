import { describe, it, expect } from 'vitest';
import {
  ftToM,
  getISATemperature,
  getISAPressure,
  getSpeedOfSound,
  getTASFromMach,
  calculateColdTempCorrection
} from '../src/engine/atmospheric.js';

describe('Atmospheric Physics Engine Tests', () => {
  describe('ftToM', () => {
    it('should correctly convert feet to meters', () => {
      expect(ftToM(0)).toBe(0);
      expect(ftToM(1000)).toBeCloseTo(304.8, 2);
    });

    it('should handle non-numeric input safely by returning 0', () => {
      expect(ftToM(null)).toBe(0);
      expect(ftToM(undefined)).toBe(0);
      expect(ftToM('invalid')).toBe(0);
    });
  });

  describe('getISATemperature', () => {
    it('should calculate correct ISA standard temperature in Celsius', () => {
      expect(getISATemperature(0)).toBe(15.0);
      // Lapse rate is 1.98 C per 1000 ft
      expect(getISATemperature(10000)).toBeCloseTo(15.0 - 19.8, 2); // -4.8
      // Ceiling check
      expect(getISATemperature(36089)).toBeCloseTo(-56.45, 1);
      expect(getISATemperature(41000)).toBe(-56.5); // Stratosphere ceiling
    });

    it('should clamp altitude inputs to safe range [0, 50000]', () => {
      expect(getISATemperature(-500)).toBe(15.0); // clamped to 0
      expect(getISATemperature(60000)).toBe(-56.5); // clamped to 50000
    });

    it('should handle non-numeric inputs gracefully', () => {
      expect(getISATemperature(undefined)).toBe(15.0);
    });
  });

  describe('getISAPressure', () => {
    it('should calculate correct standard pressure in hPa', () => {
      expect(getISAPressure(0)).toBeCloseTo(1013.25, 2);
      expect(getISAPressure(36089)).toBeCloseTo(226.32, 1);
    });

    it('should clamp altitude bounds safely', () => {
      expect(getISAPressure(-1000)).toBeCloseTo(1013.25, 2);
    });
  });

  describe('getSpeedOfSound', () => {
    it('should calculate correct speed of sound in knots', () => {
      // At ISA sea-level (15°C), speed of sound is ~340.29 m/s or ~661.5 kt
      expect(getSpeedOfSound(15)).toBeCloseTo(661.7, 0);
      // At -56.5°C, speed of sound is ~295 m/s or ~573.4 kt
      expect(getSpeedOfSound(-56.5)).toBeCloseTo(573.5, 0);
    });

    it('should clamp values below absolute zero', () => {
      expect(getSpeedOfSound(-300)).toBeCloseTo(0, 1); // clamped to -273.15
    });
  });

  describe('getTASFromMach', () => {
    it('should calculate correct True Airspeed from Mach and OAT', () => {
      // Mach 0.76 at 15°C
      const speedOfSound = getSpeedOfSound(15);
      expect(getTASFromMach(0.76, 15)).toBeCloseTo(0.76 * speedOfSound, 2);
    });

    it('should handle invalid inputs safely', () => {
      expect(getTASFromMach(null, 15)).toBe(0);
    });
  });

  describe('calculateColdTempCorrection', () => {
    it('should return target altitude unchanged if temperature is positive', () => {
      expect(calculateColdTempCorrection(3000, 500, 10)).toBe(3000);
    });

    it('should return target altitude unchanged if height is zero or negative', () => {
      expect(calculateColdTempCorrection(500, 500, -10)).toBe(500);
      expect(calculateColdTempCorrection(200, 500, -10)).toBe(200);
    });

    it('should calculate ICAO cold temperature correction under sub-zero temperatures', () => {
      const result = calculateColdTempCorrection(3000, 500, -15);
      // height = 2500 ft
      // correction = 2500 * (30) / (258.15 - 0.5 * 0.00198 * 2500) = ~293 ft
      // corrected alt = 3293 ft
      expect(result).toBeGreaterThan(3000);
      expect(result).toBeCloseTo(3293, -1);
    });

    it('should protect against division by zero near absolute zero', () => {
      expect(() => calculateColdTempCorrection(3000, 500, -273.15)).not.toThrow();
    });
  });
});
