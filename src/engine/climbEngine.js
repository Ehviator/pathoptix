/**
 * PathOptix - Climb Performance Engine
 * Pure functions extracted from CalculatorClimb.js.
 * All inputs are plain values; the climbPerf JSON database is passed explicitly
 * so these functions are fully testable without React or context.
 */

import { interpolate2D, interpolate1D } from './interpolation.js';

/**
 * Returns the cumulative climb performance (time / fuel / distance) from
 * sea level to `pressureAlt` by looking up the climb_perf.json matrix.
 *
 * Altitude bracketing strategy:
 * - pressureAlt < first table tier → linear interpolation from SL (0,0,0)
 * - pressureAlt within table range → bilinear interpolation between two tiers
 * - pressureAlt ≥ highest tier     → return highest tier value (no extrapolation)
 *
 * Returns null when the weight/ISA point falls in a "--" cell (out of envelope).
 *
 * @param {number} pressureAlt  - Pressure altitude in feet
 * @param {number} weightLbs    - Aircraft gross weight in lbs
 * @param {number} isaDev       - ISA temperature deviation in °C
 * @param {object} climbPerf    - Parsed climb_perf.json
 * @returns {{ time: number, fuel: number, dist: number } | null}
 */
export function lookupClimbPerfAtAlt(pressureAlt, weightLbs, isaDev, climbPerf) {
  if (!climbPerf?.climb_profiles) return null;
  if (pressureAlt <= 0) return { time: 0, fuel: 0, dist: 0 };

  const profiles = climbPerf.climb_profiles;
  const altKeys  = Object.keys(profiles).map(Number).sort((a, b) => a - b);

  // Below the first published altitude tier — interpolate from (0, 0, 0)
  if (pressureAlt < altKeys[0]) {
    const hi  = altKeys[0];
    const pHi = profiles[hi.toString()];
    const tHi = interpolate2D(weightLbs, isaDev, pHi.weights, pHi.isa_headers, pHi.time_min);
    const fHi = interpolate2D(weightLbs, isaDev, pHi.weights, pHi.isa_headers, pHi.fuel_lbs);
    const dHi = interpolate2D(weightLbs, isaDev, pHi.weights, pHi.isa_headers, pHi.distance_nm);
    if (tHi === null || fHi === null || dHi === null) return null;
    return {
      time: interpolate1D(pressureAlt, 0, hi, 0, tHi),
      fuel: interpolate1D(pressureAlt, 0, hi, 0, fHi),
      dist: interpolate1D(pressureAlt, 0, hi, 0, dHi),
    };
  }

  // Find bracket
  let loKey = altKeys[altKeys.length - 1];
  let hiKey = altKeys[altKeys.length - 1];

  if (pressureAlt < altKeys[altKeys.length - 1]) {
    for (let i = 0; i < altKeys.length - 1; i++) {
      if (pressureAlt >= altKeys[i] && pressureAlt <= altKeys[i + 1]) {
        loKey = altKeys[i];
        hiKey = altKeys[i + 1];
        break;
      }
    }
  }

  const pLo = profiles[loKey.toString()];
  const tLo = interpolate2D(weightLbs, isaDev, pLo.weights, pLo.isa_headers, pLo.time_min);
  const fLo = interpolate2D(weightLbs, isaDev, pLo.weights, pLo.isa_headers, pLo.fuel_lbs);
  const dLo = interpolate2D(weightLbs, isaDev, pLo.weights, pLo.isa_headers, pLo.distance_nm);

  // Exact tier match
  if (loKey === hiKey) {
    if (tLo === null || fLo === null || dLo === null) return null;
    return { time: tLo, fuel: fLo, dist: dLo };
  }

  // Interpolate between two tiers
  const pHi = profiles[hiKey.toString()];
  const tHi = interpolate2D(weightLbs, isaDev, pHi.weights, pHi.isa_headers, pHi.time_min);
  const fHi = interpolate2D(weightLbs, isaDev, pHi.weights, pHi.isa_headers, pHi.fuel_lbs);
  const dHi = interpolate2D(weightLbs, isaDev, pHi.weights, pHi.isa_headers, pHi.distance_nm);

  if (tLo === null || tHi === null || fLo === null || fHi === null || dLo === null || dHi === null) {
    return null;
  }

  return {
    time: interpolate1D(pressureAlt, loKey, hiKey, tLo, tHi),
    fuel: interpolate1D(pressureAlt, loKey, hiKey, fLo, fHi),
    dist: interpolate1D(pressureAlt, loKey, hiKey, dLo, dHi),
  };
}

/**
 * Computes the full climb profile from field elevation to target altitude,
 * applying ATC speed restriction, anti-ice, and dual-tier wind corrections.
 *
 * @param {object} inputs
 * @param {number} inputs.pressureTargetAlt   - QNH-corrected cruise target altitude (ft)
 * @param {number} inputs.pressureFieldAlt    - QNH-corrected field elevation (ft)
 * @param {number} inputs.weightLbs           - Takeoff weight in lbs
 * @param {number} inputs.isaDev              - ISA deviation (°C)
 * @param {boolean} inputs.atcSpeedRestriction - 250 KIAS ≤ 10,000 ft restriction active
 * @param {boolean} inputs.antiIce            - Engine/wing anti-ice bleed penalty active
 * @param {number} inputs.windBelow180        - Average headwind/tailwind below FL180 (kt)
 * @param {number} inputs.windAbove180        - Average headwind/tailwind above FL180 (kt)
 * @param {object} climbPerf                  - Parsed climb_perf.json
 * @returns {{
 *   timeToClimb: number, fuelBurned: number, climbDistance: number,
 *   averageROC: number, totalWindDisplacement: number,
 *   isOutOfEnvelope: boolean, rawTime: number, rawDist: number
 * }}
 */
export function calculateClimbProfile(inputs, climbPerf) {
  if (!inputs) {
    return {
      timeToClimb: 0, fuelBurned: 0, climbDistance: 0,
      averageROC: 0, totalWindDisplacement: 0,
      isOutOfEnvelope: true, rawTime: 0, rawDist: 0,
    };
  }
  const {
    pressureTargetAlt = 0,
    pressureFieldAlt  = 0,
    weightLbs         = 100000,
    isaDev            = 0,
    atcSpeedRestriction = false,
    antiIce           = false,
    windBelow180      = 0,
    windAbove180      = 0,
  } = inputs || {};

  const effectiveClimbAlt = Math.max(0, pressureTargetAlt - pressureFieldAlt);

  const perfTarget = lookupClimbPerfAtAlt(pressureTargetAlt, weightLbs, isaDev, climbPerf);
  const perfField  = lookupClimbPerfAtAlt(pressureFieldAlt,  weightLbs, isaDev, climbPerf);

  if (perfTarget === null || perfField === null) {
    return {
      timeToClimb: 0, fuelBurned: 0, climbDistance: 0,
      averageROC: 0, totalWindDisplacement: 0,
      isOutOfEnvelope: true, rawTime: 0, rawDist: 0,
    };
  }

  const rawTime = perfTarget.time - perfField.time;
  const rawFuel = perfTarget.fuel - perfField.fuel;
  const rawDist = perfTarget.dist - perfField.dist;

  // Operational penalties applied on top of matrix values
  const atcPenaltyTime    = atcSpeedRestriction && effectiveClimbAlt > 10000 ? 1.8 : 0;
  const antiIcePenaltyTime = antiIce ? (effectiveClimbAlt / 1000) * 0.06 : 0;
  const antiIceFuelPenalty = antiIce ? (effectiveClimbAlt / 1000) * 14   : 0;

  const timeToClimb = Math.max(1, Math.round(rawTime + atcPenaltyTime + antiIcePenaltyTime));
  const fuelBurned  = Math.round(rawFuel + antiIceFuelPenalty);

  // Dual-tier wind displacement: split climb time at FL180 boundary
  const timeBelow180        = Math.min(timeToClimb, 10);
  const timeAbove180        = Math.max(0, timeToClimb - 10);
  const totalWindDisplacement = (windBelow180 * (timeBelow180 / 60))
                              + (windAbove180 * (timeAbove180 / 60));

  const climbDistance = Math.max(5, Math.round(rawDist + totalWindDisplacement));
  const averageROC    = timeToClimb > 0 ? Math.round(effectiveClimbAlt / timeToClimb) : 0;

  return {
    timeToClimb, fuelBurned, climbDistance,
    averageROC, totalWindDisplacement,
    isOutOfEnvelope: false,
    rawTime, rawDist,
  };
}

/**
 * Computes an alternate speed profile comparison against the standard 290 kt / M 0.76 baseline.
 * Time multiplier uses a drag-squared model: higher speeds cost disproportionately more time
 * at altitude due to lower excess thrust margins.
 *
 * @param {object} baseProfile   - Output of calculateClimbProfile (must not be out-of-envelope)
 * @param {object} compareInputs
 * @param {number} compareInputs.compareIas    - Alternate IAS (kt), default 290
 * @param {number} compareInputs.compareMach   - Alternate Mach, default 0.76
 * @param {number} compareInputs.windBelow180
 * @param {number} compareInputs.windAbove180
 * @returns {{
 *   altTimeToClimb: number, altFuelBurned: number, altClimbDistance: number,
 *   timeDelta: number, fuelDelta: number, distDelta: number
 * }}
 */
export function calculateAlternateClimbProfile(baseProfile, compareInputs) {
  const {
    compareIas   = 290,
    compareMach  = 0.76,
    windBelow180 = 0,
    windAbove180 = 0,
  } = compareInputs || {};

  const { timeToClimb, fuelBurned, climbDistance, rawTime, rawDist } = baseProfile;

  const iasRatio = compareIas / 290;

  const vDiff      = compareIas - 290;
  const timeMultIas = vDiff >= 0
    ? 1.0 + 0.6 * (vDiff / 290) + 2.0 * Math.pow(vDiff / 290, 2)
    : 1.0 + 0.25 * Math.abs(vDiff / 290);

  const mDiff       = compareMach - 0.76;
  const timeMultMach = mDiff >= 0
    ? 1.0 + 0.6 * (mDiff / 0.76) + 2.0 * Math.pow(mDiff / 0.76, 2)
    : 1.0 + 0.25 * Math.abs(mDiff / 0.76);

  // IAS dominates in lower airspace (0.8 weight), Mach in upper (0.2 weight)
  const timeMult = 0.8 * timeMultIas + 0.2 * timeMultMach;

  // Fuel flow scales with drag (V^2.2 Oswald approximation)
  const ffMult = 0.8 * Math.pow(compareIas  / 290,  2.2)
               + 0.2 * Math.pow(compareMach / 0.76, 2.2);

  const altTimeToClimb = Math.max(1, Math.round(timeToClimb * timeMult));
  const altFuelBurned  = Math.round(fuelBurned * timeMult * ffMult);

  const altDistStillAir   = rawDist * iasRatio * timeMult;
  const altTimeBelow180   = Math.min(altTimeToClimb, 10);
  const altTimeAbove180   = Math.max(0, altTimeToClimb - 10);
  const altWindEffect     = (windBelow180 * (altTimeBelow180 / 60))
                          + (windAbove180 * (altTimeAbove180 / 60));

  const altClimbDistance = Math.max(5, Math.round(altDistStillAir + altWindEffect));

  return {
    altTimeToClimb,
    altFuelBurned,
    altClimbDistance,
    timeDelta: altTimeToClimb - timeToClimb,
    fuelDelta: altFuelBurned  - fuelBurned,
    distDelta: altClimbDistance - climbDistance,
  };
}
