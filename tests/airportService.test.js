import { describe, it, expect } from 'vitest';
import { enrichAirport, calculateWindComponents } from '../src/services/airportService.js';

describe('Airport & Runway Service Tests', () => {
  describe('enrichAirport', () => {
    it('should return airport data enriched with runways for major Porter airports', () => {
      const baseCYOW = { name: 'OTTAWA MACDONALD-CARTIER', elevation: 374 };
      const enriched = enrichAirport('CYOW', baseCYOW);
      expect(enriched.runways).toBeDefined();
      expect(enriched.runways.length).toBe(4); // CYOW has runways 07, 25, 14, 32
      expect(enriched.runways[0].ident).toBe('07');
      expect(enriched.runways[0].heading).toBe(70);
    });

    it('should return empty runways array for unknown airports', () => {
      const baseUnknown = { name: 'SMALL STRIP', elevation: 100 };
      const enriched = enrichAirport('KXYZ', baseUnknown);
      expect(enriched.runways).toEqual([]);
    });

    it('should handle case insensitivity and whitespace gracefully', () => {
      const baseCYYZ = { name: 'TORONTO PEARSON', elevation: 568 };
      const enriched = enrichAirport('  cyyz  ', baseCYYZ);
      expect(enriched.runways.length).toBe(10); // CYYZ has 10 runway vectors
    });

    it('should return null if base data is null', () => {
      expect(enrichAirport('CYOW', null)).toBeNull();
    });
  });

  describe('calculateWindComponents', () => {
    it('should return 0 wind components when wind speed is 0', () => {
      const res = calculateWindComponents(90, 180, 0);
      expect(res.headwind).toBe(0);
      expect(res.crosswind).toBe(0);
    });

    it('should calculate pure headwind correctly', () => {
      // Wind directly down runway 09 (heading 90) at 15 kt
      const res = calculateWindComponents(90, 90, 15);
      expect(res.headwind).toBe(15);
      expect(res.crosswind).toBe(0);
    });

    it('should calculate pure tailwind correctly', () => {
      // Wind directly behind runway 09 (heading 90, wind 270) at 10 kt
      const res = calculateWindComponents(90, 270, 10);
      expect(res.headwind).toBe(-10);
      expect(res.crosswind).toBe(0);
    });

    it('should calculate pure crosswind correctly', () => {
      // Wind from 180 (right side of runway 09) at 20 kt
      const res = calculateWindComponents(90, 180, 20);
      expect(res.headwind).toBe(0);
      expect(res.crosswind).toBe(20);
    });

    it('should calculate combined headwind and crosswind at 45 degree angle', () => {
      // Wind from 135 (45 degrees off runway 09) at 10 kt
      // cos(45) = sin(45) = ~0.707. 10 * 0.707 = ~7 kt
      const res = calculateWindComponents(90, 135, 10);
      expect(res.headwind).toBe(7);
      expect(res.crosswind).toBe(7);
    });

    it('should handle missing or NaN inputs safely', () => {
      const res = calculateWindComponents(null, undefined, NaN);
      expect(res.headwind).toBe(0);
      expect(res.crosswind).toBe(0);
    });
  });
});
