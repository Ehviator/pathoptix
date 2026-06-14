/**
 * PathOptix - Computational Interpolation Engine
 * Handles multi-dimensional linear and non-linear performance lookup table interpolations.
 */

/**
 * 1D Linear Interpolation
 * @param {number} x - Target x coordinate
 * @param {number} x0 - Lower x boundary
 * @param {number} x1 - Upper x boundary
 * @param {number} y0 - Lower y boundary
 * @param {number} y1 - Upper y boundary
 * @returns {number} Interpolated value
 */
export function interpolate1D(x, x0, x1, y0, y1) {
  if (x0 === x1) return y0;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

/**
 * 2D Bilinear Interpolation
 * @param {number} x - Target x coordinate (e.g. Weight)
 * @param {number} y - Target y coordinate (e.g. Temperature)
 * @param {Array<number>} xRange - [x0, x1]
 * @param {Array<number>} yRange - [y0, y1]
 * @param {Array<Array<number>>} qValues - [[q00, q01], [q10, q11]] (grid values)
 * @returns {number} Interpolated value
 */
export function interpolate2D(x, y, xRange, yRange, qValues) {
  const [x0, x1] = xRange;
  const [y0, y1] = yRange;
  const [[q00, q01], [q10, q11]] = qValues;

  if (x0 === x1 && y0 === y1) return q00;

  if (x0 === x1) {
    return interpolate1D(y, y0, y1, q00, q01);
  }
  if (y0 === y1) {
    return interpolate1D(x, x0, x1, q00, q10);
  }

  const r1 = interpolate1D(x, x0, x1, q00, q10);
  const r2 = interpolate1D(x, x0, x1, q01, q11);

  return interpolate1D(y, y0, y1, r1, r2);
}

/**
 * Finds bounding indices in a sorted array
 * @param {number} val - Value to locate
 * @param {Array<number>} arr - Sorted numeric array
 * @returns {Array<number>} [lowerIndex, upperIndex]
 */
export function findBoundingIndices(val, arr) {
  if (val <= arr[0]) return [0, 0];
  if (val >= arr[arr.length - 1]) return [arr.length - 1, arr.length - 1];

  for (let i = 0; i < arr.length - 1; i++) {
    if (val >= arr[i] && val <= arr[i + 1]) {
      return [i, i + 1];
    }
  }
  return [0, 0];
}
