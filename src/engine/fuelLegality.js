/**
 * PathOptix - CARs 705 Fuel Legality & Weight Compliance Engine
 * Pure functions for fuel reserve calculations and structural weight validation.
 * Extracted from MissionContext so they can be tested in isolation.
 *
 * Weight model: E195-E2 (Porter Airlines standard configuration)
 * Fuel model: CARs 705 / Part 121 IFR fuel reserve requirements
 */

// E195-E2 structural weight limits (lbs)
export const LIMITS = {
  MTOW_LBS:  136000,
  MLW_LBS:   115741,
  MZFW_LBS:  107143,
};

// Ramp fuel tolerance band: warn when variance exceeds this
export const RAMP_FUEL_TOLERANCE_LBS = 500;

/**
 * CARs 705 contingency fuel: 5 % of planned trip burn.
 * @param {number} tripFuel - Planned trip fuel (lbs)
 * @returns {number}
 */
export function calculateContingencyFuel(tripFuel) {
  return Math.round((tripFuel || 0) * 0.05);
}

/**
 * Physics-informed alternate fuel estimate for E195-E2.
 * Models a descent-and-cruise segment to the alternate airport, weight-adjusted.
 * More conservative than the legacy linear heuristic (distance × 12.5 + 400)
 * especially for heavier weights and short-sector alternates.
 *
 * Methodology: 14.0 lbs/NM baseline at 100,000 lbs, scaled by weight fraction
 * within the E195-E2 operating envelope, plus 800 lbs fixed overhead
 * (climb-out energy + ATC holding buffer at minimum alternate fuel state).
 *
 * @param {number} distanceNm  - Great-circle dist arrival→alternate (NM)
 * @param {number} weightLbs   - Aircraft gross weight at diversion (lbs)
 * @returns {number} Alternate fuel (lbs)
 */
export function calculateAlternateFuel(distanceNm, weightLbs = 100000) {
  if (!(distanceNm > 0)) return 0;
  const OVERHEAD_LBS      = 800;
  const BASE_RATE_LBS_NM  = 14.0;
  const weightMultiplier  = Math.max(0.90, Math.min(1.20, (weightLbs || 100000) / 100000));
  return Math.round(distanceNm * BASE_RATE_LBS_NM * weightMultiplier + OVERHEAD_LBS);
}

/**
 * CARs 705 final reserve fuel: 30-minute holding fuel at destination.
 * Weight-based formula calibrated for E195-E2 holding pattern fuel flow.
 * @param {number} takeoffWeight - Aircraft TOW (lbs)
 * @returns {number}
 */
export function calculateFinalReserveFuel(takeoffWeight) {
  return Math.round(1150 + 0.005 * (takeoffWeight || 0));
}

/**
 * Sums all fuel segments into minimum required block fuel.
 */
export function calculateRequiredBlockFuel(taxi, trip, contingency, alternate, reserve) {
  return (taxi || 0) + (trip || 0) + (contingency || 0) + (alternate || 0) + (reserve || 0);
}

/**
 * Validates aircraft weights against E195-E2 structural limits.
 * Returns one entry per limit breach; empty array = all weights legal.
 *
 * @param {{ zfw: number, tow: number, landingWeight: number }} weights
 * @returns {Array<{ field: string, label: string, limit: number, actual: number, severity: 'RED'|'AMBER' }>}
 */
export function validateWeights({ zfw = 0, tow = 0, landingWeight = 0 }) {
  const violations = [];

  const check = (field, label, actual, limit) => {
    if (!(actual > 0)) return;
    if (actual > limit) {
      violations.push({ field, label, limit, actual, severity: 'RED' });
    } else if (actual > limit * 0.97) {
      violations.push({ field, label, limit, actual, severity: 'AMBER' });
    }
  };

  check('zfw',           'MZFW', zfw,           LIMITS.MZFW_LBS);
  check('tow',           'MTOW', tow,           LIMITS.MTOW_LBS);
  check('landingWeight', 'MLW',  landingWeight, LIMITS.MLW_LBS);

  return violations;
}
