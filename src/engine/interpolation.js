/**
 * Safe 1D linear interpolation with strict boundary checks.
 */
export function interpolate1D(x, x0, x1, y0, y1) {
  if (y0 === null || y1 === null || y0 === "--" || y1 === "--") return null;
  if (x0 === x1) return y0;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

/**
 * Enhanced 2D bilinear interpolation with null/empty cell protection.
 * Prevents extrapolation into illegal aerodynamic envelopes.
 */
export function interpolate2D(targetRow, targetCol, rowHeaders, colHeaders, dataMatrix) {
  // 1. Enforce strict upper and lower boundary clamping for rows
  let r0 = 0, r1 = 0;
  if (targetRow <= rowHeaders[0]) {
    r0 = r1 = 0;
  } else if (targetRow >= rowHeaders[rowHeaders.length - 1]) {
    r0 = r1 = rowHeaders.length - 1;
  } else {
    for (let i = 0; i < rowHeaders.length - 1; i++) {
      if (targetRow >= rowHeaders[i] && targetRow <= rowHeaders[i + 1]) {
        r0 = i;
        r1 = i + 1;
        break;
      }
    }
  }

  // 2. Enforce strict upper and lower boundary clamping for columns
  let c0 = 0, c1 = 0;
  if (targetCol <= colHeaders[0]) {
    c0 = c1 = 0;
  } else if (targetCol >= colHeaders[colHeaders.length - 1]) {
    c0 = c1 = colHeaders.length - 1;
  } else {
    for (let j = 0; j < colHeaders.length - 1; j++) {
      if (targetCol >= colHeaders[j] && targetCol <= colHeaders[j + 1]) {
        c0 = j;
        c1 = j + 1;
        break;
      }
    }
  }

  // 3. Extract the four bounding coordinates
  const q00 = dataMatrix[r0][c0];
  const q01 = dataMatrix[r0][c1];
  const q10 = dataMatrix[r1][c0];
  const q11 = dataMatrix[r1][c1];

  // 4. Structural Verification: If any bounding node is non-existent, return null (Invalid Flight State)
  if (
    q00 === "--" || q01 === "--" || q10 === "--" || q11 === "--" ||
    q00 === null || q01 === null || q10 === null || q11 === null
  ) {
    return null;
  }

  // 5. Execute internal column interpolations
  const r0_interp = interpolate1D(targetCol, colHeaders[c0], colHeaders[c1], q00, q01);
  const r1_interp = interpolate1D(targetCol, colHeaders[c0], colHeaders[c1], q10, q11);

  // 6. Resolve final intersection value
  return interpolate1D(targetRow, rowHeaders[r0], rowHeaders[r1], r0_interp, r1_interp);
}

/**
 * Hardcoded Maximum Operating Altitude Guardrail Matrix
 * Cross-references aircraft weight against standard structural/aerodynamic capabilities.
 */
const MAX_FL_WEIGHT_HEADERS = [82000, 94000, 106000, 112000, 118000, 124000, 130000, 136000];
const MAX_FL_CEILING_DATA    = [410,   410,   410,    410,    390,    380,    380,    350];

/**
 * Returns the maximum legal operating flight level based strictly on current weight.
 * Prevents the application from recommending ceilings that compromise the 1.3g buffet margin.
 */
export function getLegalMaxAltitude(currentWeight) {
  if (currentWeight <= MAX_FL_WEIGHT_HEADERS[0]) return MAX_FL_CEILING_DATA[0];
  if (currentWeight >= MAX_FL_WEIGHT_HEADERS[MAX_FL_WEIGHT_HEADERS.length - 1]) {
    return MAX_FL_CEILING_DATA[MAX_FL_CEILING_DATA.length - 1];
  }

  // Find bounding brackets
  for (let i = 0; i < MAX_FL_WEIGHT_HEADERS.length - 1; i++) {
    if (currentWeight >= MAX_FL_WEIGHT_HEADERS[i] && currentWeight <= MAX_FL_WEIGHT_HEADERS[i + 1]) {
      // Step-down protection: always return the lower, safer ceiling capability of the target bracket
      return MAX_FL_CEILING_DATA[i + 1];
    }
  }
  return 350; // Hard fallback limit
}
