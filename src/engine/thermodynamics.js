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
  const safeAlt = typeof targetAlt === 'number' && !isNaN(targetAlt) ? targetAlt : 0;
  let safeQnh = typeof qnh === 'number' && !isNaN(qnh) ? qnh : 29.92;

  // QNH limits (clamped within physical limits to prevent extreme pressure calculations)
  if (safeQnh < 25.0) safeQnh = 25.0;
  if (safeQnh > 32.5) safeQnh = 32.5;

  if (safeAlt >= 18000) {
    return safeAlt;
  }
  const offset = Math.round((29.92 - safeQnh) * 1000);
  return Math.max(0, safeAlt + offset);
}

/**
 * Calculates temperature/ISA deviation factor.
 * 
 * @param {number} isaDev - ISA Temperature Deviation in °C
 * @param {number} rate - Coefficient rate multiplier
 * @returns {number} Calculated factor
 */
export function getIsaTempDeviationFactor(isaDev, rate) {
  const safeIsaDev = typeof isaDev === 'number' && !isNaN(isaDev) ? isaDev : 0;
  const safeRate = typeof rate === 'number' && !isNaN(rate) ? rate : 0;
  return safeIsaDev > 0 ? safeIsaDev * safeRate : 0;
}
