/**
 * PathOptix - ISA Atmospheric Calculations Engine
 * Standard ISA atmosphere models (temperature, pressure, density ratio, speed of sound vs altitude/ISA dev).
 */

const SEA_LEVEL_TEMP_K = 288.15; // 15°C in Kelvin
const SEA_LEVEL_PRESSURE_HPA = 1013.25;
const TEMP_LAPSE_RATE = 0.0065; // K/m (6.5°C per 1000m or 1.98°C per 1000ft)
const GRAVITY = 9.80665; // m/s^2
const GAS_CONSTANT = 287.05; // J/(kg*K)
const TROPOPAUSE_ALT_FT = 36089; // 11,000 meters
const TROPOPAUSE_TEMP_K = 216.65; // -56.5°C

/**
 * Converts altitude from feet to meters
 */
export function ftToM(feet) {
  const safeFeet = typeof feet === 'number' && !isNaN(feet) ? feet : 0;
  return safeFeet * 0.3048;
}

/**
 * Calculates ISA Standard Temperature in Celsius for a given altitude
 * @param {number} altFt - Pressure Altitude in feet
 * @returns {number} Standard Temperature in °C
 */
export function getISATemperature(altFt) {
  let safeAlt = typeof altFt === 'number' && !isNaN(altFt) ? altFt : 0;
  if (safeAlt < 0) safeAlt = 0;
  if (safeAlt > 50000) safeAlt = 50000;
  if (safeAlt <= TROPOPAUSE_ALT_FT) {
    return 15.0 - (1.98 * safeAlt) / 1000;
  }
  return -56.5;
}

/**
 * Calculates ISA Pressure in hPa for a given altitude
 * @param {number} altFt - Pressure Altitude in feet
 * @returns {number} Standard Pressure in hPa
 */
export function getISAPressure(altFt) {
  let safeAlt = typeof altFt === 'number' && !isNaN(altFt) ? altFt : 0;
  if (safeAlt < 0) safeAlt = 0;
  if (safeAlt > 50000) safeAlt = 50000;
  const altM = ftToM(safeAlt);
  if (altM <= 11000) {
    // Troposphere equation
    const tempK = SEA_LEVEL_TEMP_K - TEMP_LAPSE_RATE * altM;
    return SEA_LEVEL_PRESSURE_HPA * Math.pow(tempK / SEA_LEVEL_TEMP_K, GRAVITY / (TEMP_LAPSE_RATE * GAS_CONSTANT));
  } else {
    // Stratosphere equation
    const pressureTropo = getISAPressure(TROPOPAUSE_ALT_FT);
    const deltaH = altM - 11000;
    return pressureTropo * Math.exp((-GRAVITY * deltaH) / (GAS_CONSTANT * TROPOPAUSE_TEMP_K));
  }
}

/**
 * Calculates local speed of sound in knots
 * @param {number} tempC - Actual ambient temperature in Celsius
 * @returns {number} Speed of sound in knots
 */
export function getSpeedOfSound(tempC) {
  let safeTemp = typeof tempC === 'number' && !isNaN(tempC) ? tempC : 15;
  if (safeTemp < -273.15) safeTemp = -273.15; // Clamped to absolute zero
  const tempK = safeTemp + 273.15;
  const speedOfSoundMps = Math.sqrt(1.4 * GAS_CONSTANT * tempK);
  return speedOfSoundMps * 1.94384; // Convert m/s to knots
}

/**
 * Calculates True Airspeed (TAS) from Mach and Temperature
 * @param {number} mach - Mach number
 * @param {number} tempC - Outside Air Temperature in Celsius
 * @returns {number} True Airspeed in knots
 */
export function getTASFromMach(mach, tempC) {
  const safeMach = typeof mach === 'number' && !isNaN(mach) ? mach : 0;
  const speedOfSound = getSpeedOfSound(tempC);
  return safeMach * speedOfSound;
}

/**
 * Calculates standard ICAO altimetry cold temperature correction.
 * Based on ICAO Doc 8168 formula.
 * If the destination OAT is 0°C or below, returns the corrected indicated altitude
 * required to maintain the target geometric altitude.
 * 
 * @param {number} targetAltitude - Target geometric altitude in feet
 * @param {number} fieldElevation - Field elevation in feet
 * @param {number} destinationOAT - Outside air temperature in °C
 * @returns {number} Corrected indicated altitude in feet
 */
export function calculateColdTempCorrection(targetAltitude, fieldElevation, destinationOAT) {
  const safeTarget = typeof targetAltitude === 'number' && !isNaN(targetAltitude) ? targetAltitude : 0;
  const safeField = typeof fieldElevation === 'number' && !isNaN(fieldElevation) ? fieldElevation : 0;
  let safeOAT = typeof destinationOAT === 'number' && !isNaN(destinationOAT) ? destinationOAT : 15;

  if (safeOAT <= -273.0) safeOAT = -272.9; // Prevents division by zero in (273.15 + safeOAT)
  if (safeOAT > 50) safeOAT = 50;

  if (safeOAT > 0) {
    return safeTarget;
  }
  const height = safeTarget - safeField;
  if (height <= 0) return safeTarget;

  // Standard ICAO correction formula
  const correction = height * ((15 - safeOAT) / (273.15 + safeOAT - 0.5 * 0.00198 * height));
  return Math.round(safeTarget + correction);
}

