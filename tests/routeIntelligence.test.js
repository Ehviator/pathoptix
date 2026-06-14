import { describe, it, expect } from 'vitest';
import { calculateTrackAngle } from '../src/engine/kinematics.js';
import { parseFlightRoute } from '../src/context/MissionContext.js';

describe('Route Intelligence & Altimetry Track Angle Tests', () => {
  describe('calculateTrackAngle', () => {
    it('should calculate initial course headings accurately', () => {
      // (0,0) to (1, 0) represents direct North (heading 360/0)
      expect(calculateTrackAngle(0, 0, 1, 0)).toBe(0);
      
      // (0,0) to (0, 1) represents East (heading 90)
      expect(calculateTrackAngle(0, 0, 0, 1)).toBe(90);
      
      // (0,0) to (-1, 0) represents South (heading 180)
      expect(calculateTrackAngle(0, 0, -1, 0)).toBe(180);
      
      // (0,0) to (0, -1) represents West (heading 270)
      expect(calculateTrackAngle(0, 0, 0, -1)).toBe(270);
    });

    it('should handle invalid input types safely', () => {
      expect(calculateTrackAngle(null, undefined, 0, 0)).toBe(0);
    });
  });

  describe('parseFlightRoute', () => {
    const mockDatabase = {
      waypoints: {
        CYYZ: { type: 'FIX', lat: 43.6777, lon: -79.6248 },
        CYOW: { type: 'FIX', lat: 45.3225, lon: -75.6672 },
        TEB: { type: 'FIX', lat: 40.8501, lon: -74.0608 }
      }
    };
    const mockAirways = {
      Q907: ['TEB', 'CYOW']
    };

    it('should identify resolved waypoints and calculate leg tracks', () => {
      const { newLog, newDistance, unresolvedElements } = parseFlightRoute(
        'CYYZ TEB',
        [],
        mockDatabase,
        350,
        mockAirways,
        10000,
        400,
        5000,
        1000,
        1500
      );

      expect(newLog.length).toBe(2);
      expect(newLog[0].ident).toBe('CYYZ');
      expect(newLog[1].ident).toBe('TEB');
      expect(newLog[1].trackAngle).toBeDefined();
      expect(newLog[1].trackAngle).toBeGreaterThan(100); // CYYZ to TEB is south-eastish
      expect(unresolvedElements).toEqual([]);
    });

    it('should ignore procedures/DCT and flag unknown fixes', () => {
      const { newLog, unresolvedElements } = parseFlightRoute(
        'CYYZ BORD4 DCT TEB UNKNOWNFIX',
        [],
        mockDatabase,
        350,
        mockAirways,
        10000,
        400,
        5000,
        1000,
        1500
      );

      // CYYZ and TEB should be resolved, BORD4 and DCT should be ignored from unresolved elements
      expect(newLog.length).toBe(2);
      expect(unresolvedElements.length).toBe(1);
      
      expect(unresolvedElements[0]).toEqual({
        ident: 'UNKNOWNFIX',
        type: 'UNKNOWN',
        reason: 'Not found in navigation database'
      });
    });

    it('should expand airways correctly and apply track angles', () => {
      const { newLog } = parseFlightRoute(
        'TEB Q907 CYOW',
        [],
        mockDatabase,
        350,
        mockAirways,
        10000,
        400,
        5000,
        1000,
        1500
      );

      // Q907 expands to TEB and CYOW, which are already present but tests expansion logic
      expect(newLog.length).toBe(2);
      expect(newLog[0].ident).toBe('TEB');
      expect(newLog[1].ident).toBe('CYOW');
    });

    it('should handle missing coordinates in waypoints safely and reject/flag them', () => {
      const dbWithInvalidCoords = {
        waypoints: {
          CYYZ: { type: 'FIX', lat: 43.6777, lon: -79.6248 },
          BADWP: { type: 'FIX', lat: undefined, lon: NaN },
          CYOW: { type: 'FIX', lat: 45.3225, lon: -75.6672 }
        }
      };

      const { newLog, unresolvedElements } = parseFlightRoute(
        'CYYZ BADWP CYOW',
        [],
        dbWithInvalidCoords,
        350,
        mockAirways,
        10000,
        400,
        5000,
        1000,
        1500
      );

      // CYOW and CYYZ should be resolved. BADWP should be rejected and flagged as invalid coordinates.
      expect(newLog.length).toBe(2);
      expect(newLog[0].ident).toBe('CYYZ');
      expect(newLog[1].ident).toBe('CYOW');
      expect(unresolvedElements.length).toBe(1);
      expect(unresolvedElements[0]).toEqual({
        ident: 'BADWP',
        type: 'INVALID_COORDS',
        reason: 'Missing or invalid coordinates'
      });
    });

    it('should handle airway expansion failure cases gracefully', () => {
      const { newLog, unresolvedElements } = parseFlightRoute(
        'CYYZ Q999 TEB',
        [],
        mockDatabase,
        350,
        mockAirways,
        10000,
        400,
        5000,
        1000,
        1500
      );

      // CYYZ and TEB should be resolved, airway Q999 doesn't exist and should be flagged
      expect(newLog.length).toBe(2);
      expect(unresolvedElements.length).toBe(1);
      expect(unresolvedElements[0]).toEqual({
        ident: 'Q999',
        type: 'UNKNOWN',
        reason: 'Not found in navigation database'
      });
    });
  });
});
