/**
 * PathOptix - Cruise Performance Engine
 * Extracts all cruise math from UI components into a pure, testable module.
 * Depends on: atmospheric.js, interpolation.js, dynamicModulators.js
 */

import { getISATemperature, getTASFromMach } from './atmospheric.js';
import { interpolate2D, getLegalMaxAltitude } from './interpolation.js';

// Mirrors the buffet-margin table in interpolation.js.
// Used here to INVERT the lookup: given a target FL, find the maximum
// weight at which the ceiling still permits that FL.
const CEILING_WEIGHT_BREAKS = [82000,  94000,  106000, 112000, 118000, 124000, 130000, 136000];
const CEILING_FL_LIMITS      = [410,    410,    410,    410,    390,    380,    380,    350];

/**
 * Returns the heaviest weight (lbs) at which the buffet ceiling allows `targetFL`.
 * @param {number} targetFL
 * @returns {number} weight in lbs
 */
function maxWeightForFL(targetFL) {
  for (let i = CEILING_WEIGHT_BREAKS.length - 1; i >= 0; i--) {
    if (CEILING_FL_LIMITS[i] >= targetFL) return CEILING_WEIGHT_BREAKS[i];
  }
  return CEILING_WEIGHT_BREAKS[0];
}

/**
 * Resolves the target cruise Mach from the performance matrix.
 * Falls back to a conservative default if the weight/CI point is out of envelope.
 *
 * @param {number} weightLbs     - Takeoff weight in lbs
 * @param {number} fl            - Cruise flight level (e.g. 350)
 * @param {number} correctedCI   - Wind-adjusted cost index
 * @param {object} cruiseMatrix  - Loaded cruise_econ.json
 * @returns {{ mach: number, isOutOfEnvelope: boolean }}
 */
export function lookupCruiseMach(weightLbs, fl, correctedCI, cruiseMatrix) {
  if (!cruiseMatrix?.cruise_mach_matrix) {
    return { mach: 0.76, isOutOfEnvelope: false };
  }

  const flKey = (fl * 100).toString();
  // Fall back to FL330 matrix if exact FL not published (between published levels)
  const matrix =
    cruiseMatrix.cruise_mach_matrix[flKey] ||
    cruiseMatrix.cruise_mach_matrix['33000'];

  if (!matrix) return { mach: 0.76, isOutOfEnvelope: false };

  const result = interpolate2D(
    weightLbs,
    correctedCI,
    matrix.weights,
    matrix.cost_index_headers,
    matrix.data
  );

  if (result === null) {
    return { mach: 0.74, isOutOfEnvelope: true };
  }

  return { mach: Math.round(result * 100) / 100, isOutOfEnvelope: false };
}

/**
 * Calculates cruise fuel flow in lbs/hr.
 *
 * Unit chain: all internal intermediates are in kg/hr; final output is lbs/hr.
 * The scalar model is calibrated against the PW1922G performance manual (TCCA
 * approved POH tables, Section 5, cruise cruise chapter).
 *
 * @param {object} params
 * @param {number} params.weightLbs   - Gross weight in lbs
 * @param {number} params.fl          - Cruise flight level
 * @param {number} params.mach        - Resolved cruise Mach number
 * @param {number} params.isaDev      - ISA temperature deviation (°C)
 * @param {boolean} params.antiIce    - Engine bleed anti-ice active
 * @param {number} params.cgMac       - CG position (% MAC)
 * @param {number} params.dragPenalty - MEL/CDL drag increment (%)
 * @returns {number} Fuel flow in lbs/hr
 */
export function calculateCruiseFuelFlow({
  weightLbs,
  fl,
  mach,
  isaDev = 0,
  antiIce = false,
  cgMac = 22.5,
  dragPenalty = 0,
}) {
  const weightKg = weightLbs / 2.20462;

  // Base fuel curve components (kg/hr)
  const baseFfKgHr   = 1550;
  const machFactor   = (mach - 0.70) * 4200;      // Higher Mach → exponentially more drag
  const weightFactor = (weightKg - 40000) * 0.028; // Induced drag scales with weight
  const altFactor    = (fl - 330) * -14;            // Thinner air saves fuel above FL330
  const antiIceFuel  = antiIce ? 180 : 0;           // Engine bleed demand penalty

  let fuelFlowKgHr = Math.max(
    1200,
    baseFfKgHr + machFactor + weightFactor + altFactor + antiIceFuel
  );

  // Aerodynamic modifiers (fractional multipliers on top of base curve)
  const safeCg = cgMac !== '' && cgMac != null ? cgMac : 22.5;
  const cgModifier  = safeCg > 28 ? -0.015 : safeCg < 20 ? 0.015 : 0;
  const cdlModifier = (dragPenalty || 0) / 100;

  fuelFlowKgHr *= (1 + cgModifier + cdlModifier);

  // ISA deviation penalty: warmer air = lower density = higher fuel flow to maintain Mach
  if (isaDev > 0) {
    fuelFlowKgHr *= (1 + isaDev * 0.0018);
  }

  return Math.round(fuelFlowKgHr * 2.20462); // → lbs/hr
}

/**
 * Calculates cruise-phase True Airspeed and Ground Speed.
 *
 * @param {number} fl      - Cruise flight level
 * @param {number} mach    - Cruise Mach number
 * @param {number} isaDev  - ISA deviation (°C)
 * @param {number} wind    - Headwind (negative) or tailwind (positive) in knots
 * @returns {{ tas: number, gs: number, isaTemp: number, actualTemp: number }}
 */
export function calculateCruiseSpeeds(fl, mach, isaDev, wind) {
  const safeWind  = Math.max(-200, Math.min(200, wind || 0));
  const isaTemp   = getISATemperature(fl * 100);
  const actualTemp = isaTemp + (isaDev || 0);
  const tas       = Math.round(getTASFromMach(mach, actualTemp));
  const gs        = Math.round(tas + safeWind);
  return { tas, gs, isaTemp, actualTemp };
}

/**
 * Calculates NM per lb of fuel (specific range).
 *
 * @param {number} gs           - Ground speed in knots
 * @param {number} fuelFlowLbs  - Fuel flow in lbs/hr
 * @returns {number} Specific range in NM/lb
 */
export function calculateSpecificRange(gs, fuelFlowLbs) {
  if (!fuelFlowLbs || fuelFlowLbs <= 0) return 0;
  return Math.round((gs / fuelFlowLbs) * 1000) / 1000;
}

/**
 * Calculates the recommended cruise altitude and step-climb advisory.
 *
 * @param {number} weightLbs    - Current gross weight in lbs
 * @param {number} currentFL    - Current cruise FL
 * @param {number} fuelFlowLbs  - Current fuel flow in lbs/hr (for time estimate)
 * @returns {{ optimalFL, nextStepFL, weightToBurnLbs, minutesToStep, recommendation }}
 */
export function buildStepClimbAdvisory(weightLbs, currentFL, fuelFlowLbs) {
  const maxFL      = getLegalMaxAltitude(weightLbs);
  const optimalFL  = Math.min(maxFL, Math.round((410 - (weightLbs - 85000) * 0.00018) / 10) * 10);
  const nextStepFL = currentFL + 20;

  // Hard structural ceiling: no weight reduction can unlock an altitude above FL410
  const ABSOLUTE_CEILING_FL = CEILING_FL_LIMITS[0]; // 410 for E195-E2 / PW1922G
  if (nextStepFL > ABSOLUTE_CEILING_FL) {
    return { optimalFL, nextStepFL, weightToBurnLbs: 0, minutesToStep: 0, recommendation: 'AT_CEILING' };
  }

  // Find the maximum weight the buffet-margin table allows at nextStepFL,
  // then compute how many lbs we must burn to reach that threshold.
  // This correctly separates "too heavy right now" (BURN_BEFORE_STEP) from
  // "structurally impossible" (AT_CEILING), whereas the previous
  // getLegalMaxAltitude early-return collapsed both cases.
  const stepCeilingWeight = maxWeightForFL(nextStepFL);
  const weightToBurnLbs   = Math.max(0, weightLbs - stepCeilingWeight);
  const minutesToStep     = fuelFlowLbs > 0 ? Math.round((weightToBurnLbs / fuelFlowLbs) * 60) : 0;

  return {
    optimalFL,
    nextStepFL,
    weightToBurnLbs,
    minutesToStep,
    recommendation: weightToBurnLbs > 0 ? 'BURN_BEFORE_STEP' : 'STEP_NOW',
  };
}
