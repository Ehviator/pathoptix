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
 * Approximates True Airspeed (TAS) in knots for jet cruise.
 * 
 * @param {number} fl - Flight Level (FL)
 * @param {number} sat - Static Air Temperature (SAT) in °C
 * @returns {number} Estimated TAS in knots
 */
export function estimateTAS(fl, sat) {
  return Math.round(450 + (sat + 45) * 1.2 + (fl - 350) * 0.5);
}

/**
 * Calculates climb performance parameters (Time, Fuel, Distance, Rate of Climb).
 * 
 * @param {Object} inputs - Climb configuration inputs
 * @param {number} effectiveClimbAlt - Calculated pressure altitude difference to climb
 * @returns {Object} Calculated climb performance outputs
 */
export function calculateClimbPerformance(inputs, effectiveClimbAlt) {
  const climbWeightKg = inputs.climbWeight / 2.20462;
  
  // Time to Climb Dynamics
  const baseTimeToClimb = (effectiveClimbAlt / 1000) * 0.38; 
  const weightTimeFactor = (inputs.climbWeight - 90000) * 0.00012;
  const tempTimeFactor = getIsaTempDeviationFactor(inputs.isaDev, 0.15);
  const atcPenaltyTime = inputs.atcSpeedRestriction && effectiveClimbAlt > 10000 ? 1.8 : 0;
  const antiIcePenaltyTime = inputs.antiIce ? (effectiveClimbAlt / 1000) * 0.06 : 0;
  
  const timeToClimb = Math.max(1, Math.round(baseTimeToClimb + weightTimeFactor + tempTimeFactor + atcPenaltyTime + antiIcePenaltyTime));

  // Ground Distance (TOC) with Multi-Tier Wind Integration
  const timeBelow180 = Math.min(timeToClimb, 10); // Time spent in lower stratum
  const timeAbove180 = Math.max(0, timeToClimb - 10);
  
  const windEffectBelow = (inputs.windBelow180 * (timeBelow180 / 60));
  const windEffectAbove = (inputs.windAbove180 * (timeAbove180 / 60));
  const totalWindDisplacement = windEffectBelow + windEffectAbove;

  const stillAirDistance = Math.round(15 + (climbWeightKg - 40000) * 0.0008 + (effectiveClimbAlt) * 0.0018 + inputs.isaDev * 0.25);
  const climbDistance = Math.max(5, Math.round(stillAirDistance + totalWindDisplacement));

  // Fuel Flow Modulators
  const baseClimbFuel = (effectiveClimbAlt / 1000) * 45; 
  const weightFuelFactor = (inputs.climbWeight - 90000) * 0.015;
  const tempFuelFactor = getIsaTempDeviationFactor(inputs.isaDev, 12);
  const antiIceFuelPenalty = inputs.antiIce ? (effectiveClimbAlt / 1000) * 14 : 0;
  
  const fuelBurned = Math.round(baseClimbFuel + weightFuelFactor + tempFuelFactor + antiIceFuelPenalty);
  const averageROC = timeToClimb > 0 ? Math.round(effectiveClimbAlt / timeToClimb) : 0;

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
  const altDiff = (cruiseFL * 100) - trueTargetAlt;
  
  // Standard aerodynamic base profile line
  const baseTOD = (altDiff / 1000) * 3;
  const fpaFactor = 3.0 / inputs.fpa;
  const speedFactor = 1.0 + (inputs.descentSpeed - 270) * 0.0025;
  
  // E-Jet Specific FADEC Flight Idle Icing Penalty (Higher N1 = Shallower Descent)
  const icingDistancePenalty = inputs.flightIdleIcing ? 1.15 : 1.0;

  // Horizontal Deceleration Segment (Level or shallow flight to bleed speed at transition altitude)
  const decelerationDistance = trueTargetAlt < inputs.speedTransitionAlt && inputs.descentSpeed > 250 
    ? Math.max(0, (inputs.descentSpeed - 250) * 0.15) 
    : 0;
  
  // High-wind correction with a logarithmic decay model
  const boundedWind = Math.max(-200, Math.min(200, inputs.descentWind));
  const windSign = boundedWind >= 0 ? 1 : -1;
  const windCorrection = windSign * Math.log10(1 + Math.abs(boundedWind) * 0.15) * (altDiff / 1000) * 1.65;
  
  const todDistance = Math.round(Math.max(10, (baseTOD * fpaFactor * speedFactor * icingDistancePenalty) + windCorrection + decelerationDistance));
  
  // Kinematics and Timings
  const averageTAS = Math.round(350 - (altDiff / 1000) * 2);
  const averageGS = Math.max(100, averageTAS + boundedWind);
  
  const timeMin = (todDistance / averageGS) * 60;
  const timeFormatted = `${Math.floor(timeMin)}:${Math.round((timeMin % 1) * 60).toString().padStart(2, '0')} min`;

  const vsi = Math.round(-1 * averageGS * 101.268 * Math.tan((inputs.fpa * Math.PI) / 180));
  const glideRatio = altDiff > 0 ? Math.round(((todDistance * 6076.1) / altDiff) * 10) / 10 : 0;

  // Fuel & Cabin metrics
  const baseFuelBurnRate = inputs.flightIdleIcing ? 3.6 : 3.0; 
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
