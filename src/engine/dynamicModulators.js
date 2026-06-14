import { interpolate2D } from './interpolation.js';

const WIND_HEADERS = [-200, -160, -130, -100, -80, -60, -40, -20, 20, 40, 60, 80, 100, 130, 160, 200];
const CALM_CI_HEADERS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120];

const WIND_CORRECTION_MATRIX = [
  [32, 41, 50, 59, 68, 77, 85, 94, 103, 112, 120, 138, 155, 173, 190, 208, 225, 243], // -200 kt (Headwind)
  [22, 30, 38, 45, 53, 61, 68, 76, 84, 91, 99, 114, 129, 144, 160, 175, 190, 205],  // -160 kt
  [16, 23, 30, 37, 44, 51, 58, 65, 72, 79, 86, 100, 114, 128, 141, 155, 169, 183],  // -130 kt
  [11, 17, 24, 30, 37, 43, 50, 56, 62, 69, 75, 88, 101, 113, 126, 139, 152, 164],  // -100 kt
  [8,  14, 20, 27, 33, 39, 45, 51, 57, 63, 69, 81,  93, 105, 117, 129, 141, 154],  // -80 kt
  [6,  11, 17, 23, 29, 35, 40, 46, 52, 58, 63, 75,  86,  98, 109, 121, 132, 144],  // -60 kt
  [3,   9, 14, 20, 25, 31, 36, 42, 47, 53, 58, 69,  80,  91, 102, 113, 124, 135],  // -40 kt
  [2,   7, 12, 17, 22, 28, 33, 38, 43, 49, 54, 64,  75,  85,  96, 106, 117, 127],  // -20 kt
  [0,   3,  8, 12, 17, 22, 27, 31, 36, 41, 46, 55,  65,  75,  84,  94, 103, 113],  // +20 kt (Tailwind)
  [0,   1,  5, 10, 15, 19, 24, 28, 33, 38, 42, 51,  61,  70,  79,  88,  97, 107],  // +40 kt
  [0,   0,  4,  8, 12, 17, 21, 26, 30, 34, 39, 48,  56,  65,  74,  83,  92, 101],  // +60 kt
  [0,   0,  2,  6, 10, 15, 19, 23, 27, 32, 36, 44,  53,  61,  70,  78,  87,  95],  // +80 kt
  [0,   0,  1,  5,  9, 13, 17, 21, 25, 29, 33, 41,  49,  58,  66,  74,  82,  90],  // +100 kt
  [0,   0,  0,  2,  6, 10, 14, 18, 21, 25, 29, 37,  45,  52,  60,  68,  76,  84],  // +130 kt
  [0,   0,  0,  0,  4,  8, 11, 15, 18, 22, 26, 33,  40,  48,  55,  63,  70,  78],  // +160 kt
  [0,   0,  0,  0,  1,  5,  8, 11, 15, 18, 22, 29,  35,  42,  49,  56,  63,  70]   // +200 kt
];

/**
 * Resolves the operational wind-adjusted Cost Index value.
 */
export function getCorrectedCostIndex(plannedCI, windComponent) {
  return Math.round(interpolate2D(windComponent, plannedCI, WIND_HEADERS, CALM_CI_HEADERS, WIND_CORRECTION_MATRIX));
}

/**
 * Adjusts climb speed schedule based on ISA temperature deviation and weight
 * @param {number} baseSpeed - Target climbing speed in IAS
 * @param {number} weightKg - Current weight in kilograms
 * @param {number} isaDev - Temperature deviation from ISA in °C
 * @returns {number} Modulated target climb speed in IAS
 */
export function modulateClimbSpeed(baseSpeed, weightKg, isaDev) {
  const weightFactor = Math.max(0, (weightKg - 48000) / 5000) * 3;
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
  const speedRatio = ias / mach;
  return Math.round(1000 * (1.3 * speedRatio - 170));
}
