/**
 * PathOptix - Atmospheric Thermodynamics Engine
 * Handles pressure altitude corrections, temperature normalizations, and ISA calculations.
 */

/**
 * Calculates the True Pressure Altitude.
 * Enforces the North American Transition Altitude boundary check.
 * If targetAlt is 18,000 ft (FL180) or higher, QNH offset is not applied (returns targetAlt).
 * Otherwise, applies the QNH pressure offset.
 * 
 * @param {number} targetAlt - Geometric target altitude in feet
 * @param {number} qnh - Altimeter setting inHg
 * @returns {number} True pressure altitude in feet
 */
export function calculateTruePressureAlt(targetAlt, qnh) {
  if (targetAlt >= 18000) {
    return targetAlt;
  }
  const offset = Math.round((29.92 - qnh) * 1000);
  return Math.max(0, targetAlt + offset);
}

/**
 * Calculates temperature/ISA deviation factor.
 * 
 * @param {number} isaDev - ISA Temperature Deviation in °C
 * @param {number} rate - Coefficient rate multiplier
 * @returns {number} Calculated factor
 */
export function getIsaTempDeviationFactor(isaDev, rate) {
  return isaDev > 0 ? isaDev * rate : 0;
}
