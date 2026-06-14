/**
 * PathOptix - Dynamic Modulators Engine
 * Calculations for wind correction, weight adjustments, runway surface effects, and configuration limits.
 */

/**
 * Adjusts climb speed schedule based on ISA temperature deviation and weight
 * @param {number} baseSpeed - Target climbing speed in IAS
 * @param {number} weightKg - Current weight in kilograms
 * @param {number} isaDev - Temperature deviation from ISA in °C
 * @returns {number} Modulated target climb speed in IAS
 */
export function modulateClimbSpeed(baseSpeed, weightKg, isaDev) {
  // E195-E2 flight dynamics adjustment
  // For each 5,000kg above 48,000kg, increase speed by ~3kt
  const weightFactor = Math.max(0, (weightKg - 48000) / 5000) * 3;
  // Warm air degrades performance; require a slightly higher climb speed to maintain lift margins
  const tempFactor = isaDev > 0 ? isaDev * 0.2 : 0;
  
  return Math.round(baseSpeed + weightFactor + tempFactor);
}

/**
 * Calculates headwind/tailwind component from wind direction, speed, and runway heading
 * @param {number} windDirection - Wind blowing FROM (0-360 degrees)
 * @param {number} windSpeed - Wind speed in knots
 * @param {number} runwayHeading - Runway magnetic heading (0-360 degrees)
 * @returns {number} Headwind component (positive) or tailwind component (negative) in knots
 */
export function calculateWindComponent(windDirection, windSpeed, runwayHeading) {
  const angleRad = ((windDirection - runwayHeading) * Math.PI) / 180;
  return Math.round(windSpeed * Math.cos(angleRad));
}

/**
 * Calculates crossover altitude where constant IAS meets constant Mach
 * @param {number} ias - Indicated Airspeed in knots
 * @param {number} mach - Mach number
 * @returns {number} Altitude in feet
 */
export function getCrossoverAltitude(ias, mach) {
  // Approximation for standard operations
  // For typical values (290kt / M0.78), crossover occurs around FL290 - FL310
  const speedRatio = ias / mach;
  return Math.round(1000 * (1.3 * speedRatio - 170));
}
