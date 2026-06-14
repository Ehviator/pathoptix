/**
 * PathOptix - Core Physics & Kinematics Engine
 * Handles great-circle routing, speed vectors, enroute timings, and trajectory profile calculations.
 */

import { getIsaTempDeviationFactor } from './thermodynamics.js';

/**
 * Calculates the great-circle distance between two coordinates in Nautical Miles using the Haversine formula.
 * 
 * @param {number} lat1 - Latitude of origin
 * @param {number} lon1 - Longitude of origin
 * @param {number} lat2 - Latitude of destination
 * @param {number} lon2 - Longitude of destination
 * @returns {number} Great-circle distance in Nautical Miles (rounded)
 */
export function calculateDistanceNM(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== 'number' || isNaN(lat1) ||
    typeof lon1 !== 'number' || isNaN(lon1) ||
    typeof lat2 !== 'number' || isNaN(lat2) ||
    typeof lon2 !== 'number' || isNaN(lon2)
  ) {
    return 0;
  }

  // Geographic boundary check
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90 || lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) {
    return 0;
  }

  const R = 3440.065; // Radius of the Earth in Nautical Miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

/**
 * Calculates the initial great-circle track angle (bearing) between two coordinates in degrees.
 * 
 * @param {number} lat1 - Latitude of origin
 * @param {number} lon1 - Longitude of origin
 * @param {number} lat2 - Latitude of destination
 * @param {number} lon2 - Longitude of destination
 * @returns {number} Initial track angle in degrees [0, 359]
 */
export function calculateTrackAngle(lat1, lon1, lat2, lon2) {
  if (
    typeof lat1 !== 'number' || isNaN(lat1) ||
    typeof lon1 !== 'number' || isNaN(lon1) ||
    typeof lat2 !== 'number' || isNaN(lat2) ||
    typeof lon2 !== 'number' || isNaN(lon2)
  ) {
    return 0;
  }

  // Geographic boundary check
  if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90 || lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) {
    return 0;
  }

  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return Math.round((brng + 360) % 360);
}

/**
 * Approximates True Airspeed (TAS) in knots for jet cruise.
 * 
 * @param {number} fl - Flight Level (FL)
 * @param {number} sat - Static Air Temperature (SAT) in °C
 * @returns {number} Estimated TAS in knots
 */
export function estimateTAS(fl, sat) {
  const safeFl = typeof fl === 'number' && !isNaN(fl) ? fl : 350;
  const safeSat = typeof sat === 'number' && !isNaN(sat) ? sat : -45;
  return Math.round(450 + (safeSat + 45) * 1.2 + (safeFl - 350) * 0.5);
}

/**
 * Calculates climb performance parameters (Time, Fuel, Distance, Rate of Climb).
 * 
 * @param {Object} inputs - Climb configuration inputs
 * @param {number} effectiveClimbAlt - Calculated pressure altitude difference to climb
 * @returns {Object} Calculated climb performance outputs
 */
export function calculateClimbPerformance(inputs, effectiveClimbAlt) {
  const safeInputs = inputs || {};
  const weight = typeof safeInputs.climbWeight === 'number' && !isNaN(safeInputs.climbWeight) ? safeInputs.climbWeight : 100000;
  const isaDev = typeof safeInputs.isaDev === 'number' && !isNaN(safeInputs.isaDev) ? safeInputs.isaDev : 0;
  const atc = !!safeInputs.atcSpeedRestriction;
  const antiIce = !!safeInputs.antiIce;
  const windBelow = typeof safeInputs.windBelow180 === 'number' && !isNaN(safeInputs.windBelow180) ? safeInputs.windBelow180 : 0;
  const windAbove = typeof safeInputs.windAbove180 === 'number' && !isNaN(safeInputs.windAbove180) ? safeInputs.windAbove180 : 0;

  let safeAlt = typeof effectiveClimbAlt === 'number' && !isNaN(effectiveClimbAlt) ? effectiveClimbAlt : 0;
  if (safeAlt < 0) safeAlt = 0;

  const climbWeightKg = weight / 2.20462;
  
  // Time to Climb Dynamics
  const baseTimeToClimb = (safeAlt / 1000) * 0.38; 
  const weightTimeFactor = (weight - 90000) * 0.00012;
  const tempTimeFactor = getIsaTempDeviationFactor(isaDev, 0.15);
  const atcPenaltyTime = atc && safeAlt > 10000 ? 1.8 : 0;
  const antiIcePenaltyTime = antiIce ? (safeAlt / 1000) * 0.06 : 0;
  
  const timeToClimb = Math.max(1, Math.round(baseTimeToClimb + weightTimeFactor + tempTimeFactor + atcPenaltyTime + antiIcePenaltyTime));

  // Ground Distance (TOC) with Multi-Tier Wind Integration
  const timeBelow180 = Math.min(timeToClimb, 10); // Time spent in lower stratum
  const timeAbove180 = Math.max(0, timeToClimb - 10);
  
  const windEffectBelow = (windBelow * (timeBelow180 / 60));
  const windEffectAbove = (windAbove * (timeAbove180 / 60));
  const totalWindDisplacement = windEffectBelow + windEffectAbove;

  const stillAirDistance = Math.round(15 + (climbWeightKg - 40000) * 0.0008 + (safeAlt) * 0.0018 + isaDev * 0.25);
  const climbDistance = Math.max(5, Math.round(stillAirDistance + totalWindDisplacement));

  // Fuel Flow Modulators
  const baseClimbFuel = (safeAlt / 1000) * 45; 
  const weightFuelFactor = (weight - 90000) * 0.015;
  const tempFuelFactor = getIsaTempDeviationFactor(isaDev, 12);
  const antiIceFuelPenalty = antiIce ? (safeAlt / 1000) * 14 : 0;
  
  const fuelBurned = Math.round(baseClimbFuel + weightFuelFactor + tempFuelFactor + antiIceFuelPenalty);
  const averageROC = timeToClimb > 0 ? Math.round(safeAlt / timeToClimb) : 0;

  return {
    timeToClimb,
    fuelBurned,
    climbDistance,
    averageROC,
    totalWindDisplacement
  };
}

/**
 * Calculates descent performance parameters (TOD, descent time, VSI, glide ratio, fuel flow, cabin rate).
 * 
 * @param {Object} inputs - Descent configuration inputs
 * @param {number} cruiseFL - Starting cruise FL
 * @param {number} trueTargetAlt - Corrected target pressure altitude
 * @returns {Object} Calculated descent performance outputs
 */
export function calculateDescentPerformance(inputs, cruiseFL, trueTargetAlt) {
  const safeInputs = inputs || {};
  let fpa = typeof safeInputs.fpa === 'number' && !isNaN(safeInputs.fpa) ? safeInputs.fpa : 3.0;
  // Guard FPA against zero or negatives
  if (fpa < 0.1) fpa = 0.1;
  if (fpa > 8.0) fpa = 8.0;

  const descentSpeed = typeof safeInputs.descentSpeed === 'number' && !isNaN(safeInputs.descentSpeed) ? safeInputs.descentSpeed : 270;
  const flightIdleIcing = !!safeInputs.flightIdleIcing;
  const speedTransitionAlt = typeof safeInputs.speedTransitionAlt === 'number' && !isNaN(safeInputs.speedTransitionAlt) ? safeInputs.speedTransitionAlt : 10000;
  const descentWind = typeof safeInputs.descentWind === 'number' && !isNaN(safeInputs.descentWind) ? safeInputs.descentWind : 0;

  const safeCruiseFL = typeof cruiseFL === 'number' && !isNaN(cruiseFL) ? cruiseFL : 350;
  const safeTargetAlt = typeof trueTargetAlt === 'number' && !isNaN(trueTargetAlt) ? trueTargetAlt : 3000;

  const altDiff = Math.max(0, (safeCruiseFL * 100) - safeTargetAlt);
  
  // Standard aerodynamic base profile line
  const baseTOD = (altDiff / 1000) * 3;
  const fpaFactor = 3.0 / fpa;
  const speedFactor = 1.0 + (descentSpeed - 270) * 0.0025;
  
  // E-Jet Specific FADEC Flight Idle Icing Penalty (Higher N1 = Shallower Descent)
  const icingDistancePenalty = flightIdleIcing ? 1.15 : 1.0;

  // Horizontal Deceleration Segment (Level or shallow flight to bleed speed at transition altitude)
  const decelerationDistance = safeTargetAlt < speedTransitionAlt && descentSpeed > 250 
    ? Math.max(0, (descentSpeed - 250) * 0.15) 
    : 0;
  
  // High-wind correction with a logarithmic decay model
  const boundedWind = Math.max(-200, Math.min(200, descentWind));
  const windSign = boundedWind >= 0 ? 1 : -1;
  const windCorrection = windSign * Math.log10(1 + Math.abs(boundedWind) * 0.15) * (altDiff / 1000) * 1.65;
  
  const todDistance = Math.round(Math.max(10, (baseTOD * fpaFactor * speedFactor * icingDistancePenalty) + windCorrection + decelerationDistance));
  
  // Kinematics and Timings
  const averageTAS = Math.round(350 - (altDiff / 1000) * 2);
  const averageGS = Math.max(100, averageTAS + boundedWind);
  
  const timeMin = (todDistance / averageGS) * 60;
  const timeFormatted = `${Math.floor(timeMin)}:${Math.round((timeMin % 1) * 60).toString().padStart(2, '0')} min`;

  const vsi = Math.round(-1 * averageGS * 101.268 * Math.tan((fpa * Math.PI) / 180));
  const glideRatio = altDiff > 0 ? Math.round(((todDistance * 6076.1) / altDiff) * 10) / 10 : 0;

  // Fuel & Cabin metrics
  const baseFuelBurnRate = flightIdleIcing ? 3.6 : 3.0; 
  const fuelFlowLbs = Math.round(todDistance * baseFuelBurnRate + (boundedWind * 0.11));
  const cabinRate = Math.round(-320 + (vsi + 1800) * 0.08);

  return {
    todDistance,
    timeFormatted,
    vsi,
    glideRatio,
    fuelFlowLbs,
    cabinRate,
    decelerationDistance,
    averageGS,
    averageTAS
  };
}

/**
 * Calculates the Single-Engine (OEI) service ceiling based on gross weight and ISA dev.
 * 
 * @param {number} weight - Aircraft gross weight in lbs
 * @param {number} isaDev - Temperature deviation from standard in °C
 * @param {Object} driftdownDb - Aerodynamic database (parsed from driftdown_oei.json)
 * @returns {number} Single-Engine Service Ceiling in feet
 */
export function calculateDriftdownCeiling(weight, isaDev, driftdownDb) {
  if (!driftdownDb || !driftdownDb.single_engine_ceilings) {
    // Realistic fallback ceilings for E195-E2
    if (weight > 130000) return isaDev > 10 ? 16000 : 18000;
    if (weight > 115000) return isaDev > 10 ? 18000 : 20000;
    if (weight > 95000) return isaDev > 10 ? 20000 : 22000;
    return isaDev > 10 ? 22000 : 24000;
  }

  const weights = driftdownDb.weights;
  const isaHeaders = driftdownDb.isa_headers;
  const ceilings = driftdownDb.single_engine_ceilings;

  // Find weight indices
  let wIdx1 = 0;
  let wIdx2 = weights.length - 1;
  for (let i = 0; i < weights.length - 1; i++) {
    if (weight >= weights[i] && weight <= weights[i + 1]) {
      wIdx1 = i;
      wIdx2 = i + 1;
      break;
    }
  }
  if (weight < weights[0]) {
    wIdx1 = 0;
    wIdx2 = 0;
  }
  if (weight > weights[weights.length - 1]) {
    wIdx1 = weights.length - 1;
    wIdx2 = weights.length - 1;
  }

  // Find ISA indices
  let tIdx1 = 0;
  let tIdx2 = isaHeaders.length - 1;
  for (let j = 0; j < isaHeaders.length - 1; j++) {
    if (isaDev >= isaHeaders[j] && isaDev <= isaHeaders[j + 1]) {
      tIdx1 = j;
      tIdx2 = j + 1;
      break;
    }
  }
  if (isaDev < isaHeaders[0]) {
    tIdx1 = 0;
    tIdx2 = 0;
  }
  if (isaDev > isaHeaders[isaHeaders.length - 1]) {
    tIdx1 = isaHeaders.length - 1;
    tIdx2 = isaHeaders.length - 1;
  }

  const w1 = weights[wIdx1];
  const w2 = weights[wIdx2];
  const t1 = isaHeaders[tIdx1];
  const t2 = isaHeaders[tIdx2];

  const c11 = ceilings[wIdx1][tIdx1];
  const c12 = ceilings[wIdx1][tIdx2];
  const c21 = ceilings[wIdx2][tIdx1];
  const c22 = ceilings[wIdx2][tIdx2];

  let wRatio = w2 === w1 ? 0 : (weight - w1) / (w2 - w1);
  let tRatio = t2 === t1 ? 0 : (isaDev - t1) / (t2 - t1);

  const c1 = c11 + wRatio * (c21 - c11);
  const c2 = c12 + wRatio * (c22 - c12);
  const ceiling = c1 + tRatio * (c2 - c1);

  return Math.round(ceiling);
}

/**
 * Calculates the driftdown profile trajectory: altitude and distance at each point.
 * Driftdown slope is typically 1.5% to 2.5% gradient.
 * 
 * @param {number} startAlt - Starting cruise altitude in feet
 * @param {number} ceilingAlt - Calculated single-engine ceiling in feet
 * @returns {Object} Driftdown performance details
 */
export function calculateDriftdownTrajectory(startAlt, ceilingAlt) {
  const altLoss = Math.max(0, startAlt - ceilingAlt);
  // Trajectory distance covers ~7 NM per 1,000 ft descended (1.37% gradient)
  const driftdownDistance = Math.round((altLoss / 1000) * 7.0);
  return {
    driftdownDistance,
    altLoss,
    gradient: altLoss > 0 ? (altLoss / (driftdownDistance * 6076.1)) * 100 : 0
  };
}

