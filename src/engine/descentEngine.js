/**
 * PathOptix - Descent Performance Engine
 * Pure functions extracted from CalculatorDescent.js.
 * All inputs are plain values; descentPerf is passed explicitly so these
 * functions are fully testable without React or context.
 *
 * CARs 602.35 note: cold temperature altitude corrections are flagged here
 * (OAT ≤ -15°C threshold) so the UI can surface the caution. The geometric
 * altitude correction itself is applied upstream in atmospheric.js via
 * calculateColdTempCorrection().
 */

import { interpolate2D, interpolate1D } from './interpolation.js';

/**
 * Looks up the descent performance (dist / time / fuel) for a specific FPA
 * profile key (e.g. "3.0") against an altitude difference and descent speed.
 *
 * @param {string} fpaKey      - FPA profile key, e.g. "2.0", "3.5"
 * @param {number} altDiff     - Altitude differential in feet (cruise alt − target alt)
 * @param {number} speed       - Descent KIAS
 * @param {object} descentPerf - Parsed descent_fpa.json
 * @returns {{ dist: number, time: number, fuel: number } | null}
 */
export function lookupDescentPerfForFpa(fpaKey, altDiff, speed, descentPerf) {
  if (!descentPerf?.descent_profiles) return null;
  const profile = descentPerf.descent_profiles[fpaKey];
  if (!profile) return null;

  const dist = interpolate2D(altDiff, speed, profile.alt_diff_headers, profile.speed_headers, profile.distance_nm);
  const time = interpolate2D(altDiff, speed, profile.alt_diff_headers, profile.speed_headers, profile.time_min);
  const fuel = interpolate2D(altDiff, speed, profile.alt_diff_headers, profile.speed_headers, profile.fuel_lbs);

  if (dist === null || time === null || fuel === null) return null;
  return { dist, time, fuel };
}

/**
 * Resolves the descent performance by interpolating across FPA tiers when the
 * requested FPA falls between two published profiles.
 *
 * @param {number} fpa         - Flight path angle in degrees
 * @param {number} altDiff     - Altitude differential in feet
 * @param {number} speed       - Descent KIAS
 * @param {object} descentPerf - Parsed descent_fpa.json
 * @returns {{ dist: number, time: number, fuel: number } | null}
 */
export function lookupDescentPerf(fpa, altDiff, speed, descentPerf) {
  if (!descentPerf?.descent_profiles) return null;

  const profiles = descentPerf.descent_profiles;
  const fpaKeys  = Object.keys(profiles).map(Number).sort((a, b) => a - b);

  let fpaLo = fpaKeys[0];
  let fpaHi = fpaKeys[fpaKeys.length - 1];

  if (fpa <= fpaKeys[0]) {
    fpaLo = fpaHi = fpaKeys[0];
  } else if (fpa >= fpaKeys[fpaKeys.length - 1]) {
    fpaLo = fpaHi = fpaKeys[fpaKeys.length - 1];
  } else {
    for (let i = 0; i < fpaKeys.length - 1; i++) {
      if (fpa >= fpaKeys[i] && fpa <= fpaKeys[i + 1]) {
        fpaLo = fpaKeys[i];
        fpaHi = fpaKeys[i + 1];
        break;
      }
    }
  }

  const loResult = lookupDescentPerfForFpa(fpaLo.toFixed(1), altDiff, speed, descentPerf);
  const hiResult = lookupDescentPerfForFpa(fpaHi.toFixed(1), altDiff, speed, descentPerf);

  if (!loResult || !hiResult) return null;
  if (fpaLo === fpaHi) return loResult;

  return {
    dist: interpolate1D(fpa, fpaLo, fpaHi, loResult.dist, hiResult.dist),
    time: interpolate1D(fpa, fpaLo, fpaHi, loResult.time, hiResult.time),
    fuel: interpolate1D(fpa, fpaLo, fpaHi, loResult.fuel, hiResult.fuel),
  };
}

/**
 * Computes the full descent profile including icing penalty, wind correction,
 * deceleration track, VSI, glide ratio, and CARs 602.35 cold-temperature flag.
 *
 * @param {object} inputs
 * @param {number} inputs.fpa                 - Flight path angle (degrees)
 * @param {number} inputs.altDiff             - Altitude to lose (cruise alt − corrected target alt, ft)
 * @param {number} inputs.descentSpeed        - Descent KIAS
 * @param {number} inputs.speedTransitionAlt  - Speed restriction transition altitude (ft)
 * @param {number} inputs.trueTargetAlt       - QNH-corrected (and cold-temp-corrected) target alt (ft)
 * @param {number} inputs.descentWind         - Average descent wind (positive = tailwind, kt)
 * @param {boolean} inputs.flightIdleIcing    - FADEC Flight Idle Icing active
 * @param {number} inputs.destinationOAT      - Destination outside air temperature (°C)
 * @param {object} descentPerf                - Parsed descent_fpa.json
 * @returns {{
 *   todDistance: number, timeFormatted: string, vsi: number,
 *   glideRatio: number, fuelBurned: number, decelerationDistance: number,
 *   averageGS: number, isOutOfEnvelope: boolean,
 *   coldTempActive: boolean, coldTempCarsWarning: boolean
 * }}
 */
export function calculateDescentProfile(inputs, descentPerf) {
  const {
    fpa                = 3.0,
    altDiff            = 0,
    descentSpeed       = 280,
    speedTransitionAlt = 10000,
    trueTargetAlt      = 3000,
    descentWind        = 0,
    flightIdleIcing    = false,
    destinationOAT     = 15,
  } = inputs || {};

  // CARs 602.35: cold temperature corrections are required when OAT ≤ -15°C.
  // The actual geometric correction is applied upstream; we surface the flag
  // so the UI can show the appropriate caution tier.
  const coldTempActive      = destinationOAT <= 0;
  const coldTempCarsWarning = destinationOAT <= -15;

  const dbResult = lookupDescentPerf(fpa, altDiff, descentSpeed, descentPerf);

  if (dbResult === null || altDiff <= 0) {
    return {
      todDistance: 0, timeFormatted: '0:00 min', vsi: 0, glideRatio: 0,
      fuelBurned: 0, decelerationDistance: 0, averageGS: 0,
      isOutOfEnvelope: true, coldTempActive, coldTempCarsWarning,
    };
  }

  // FADEC Flight Idle Icing: elevated N1 floor shortens glide path → earlier TOD
  const icingPenalty = flightIdleIcing ? 1.15 : 1.0;

  // Deceleration track: level segment to bleed kinetic energy at the speed
  // transition altitude. Only applies when target is below the transition
  // and aircraft is faster than 250 KIAS.
  const decelerationDistance = trueTargetAlt < speedTransitionAlt && descentSpeed > 250
    ? Math.max(0, (descentSpeed - 250) * 0.15)
    : 0;

  // Wind correction: logarithmic decay model prevents linear over-correction
  // at extreme wind values; sign convention: positive = tailwind (adds distance).
  const boundedWind  = Math.max(-200, Math.min(200, descentWind));
  const windSign     = boundedWind >= 0 ? 1 : -1;
  const windCorrection = windSign
    * Math.log10(1 + Math.abs(boundedWind) * 0.15)
    * (altDiff / 1000)
    * 1.65;

  const todDistance = Math.round(
    Math.max(10, (dbResult.dist * icingPenalty) + windCorrection + decelerationDistance)
  );

  // Kinematic outputs — time derived from wind-corrected distance / GS
  // (more accurate than using still-air matrix time directly)
  const averageTAS = Math.round(350 - (altDiff / 1000) * 2);
  const averageGS  = Math.max(100, averageTAS + boundedWind);

  const timeMin     = (todDistance / averageGS) * 60;
  const timeFormatted = `${Math.floor(timeMin)}:${Math.round((timeMin % 1) * 60).toString().padStart(2, '0')} min`;

  const safeFpa  = fpa < 0.1 ? 0.1 : fpa;
  const vsi      = Math.round(-1 * averageGS * 101.268 * Math.tan((safeFpa * Math.PI) / 180));
  const glideRatio = altDiff > 0
    ? Math.round(((todDistance * 6076.1) / altDiff) * 10) / 10
    : 0;

  const fuelBurned = Math.round(dbResult.fuel * icingPenalty + (boundedWind * 0.11));

  return {
    todDistance, timeFormatted, vsi, glideRatio,
    fuelBurned, decelerationDistance, averageGS,
    isOutOfEnvelope: false,
    coldTempActive, coldTempCarsWarning,
  };
}
