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
  return feet * 0.3048;
}

/**
 * Calculates ISA Standard Temperature in Celsius for a given altitude
 * @param {number} altFt - Pressure Altitude in feet
 * @returns {number} Standard Temperature in °C
 */
export function getISATemperature(altFt) {
  if (altFt <= TROPOPAUSE_ALT_FT) {
    return 15.0 - (1.98 * altFt) / 1000;
  }
  return -56.5;
}

/**
 * Calculates ISA Pressure in hPa for a given altitude
 * @param {number} altFt - Pressure Altitude in feet
 * @returns {number} Standard Pressure in hPa
 */
export function getISAPressure(altFt) {
  const altM = ftToM(altFt);
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
  const tempK = tempC + 273.15;
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
  const speedOfSound = getSpeedOfSound(tempC);
  return mach * speedOfSound;
}
