/**
 * Executes a 1D linear interpolation between two data points.
 */
export function interpolate1D(x, x0, x1, y0, y1) {
  if (x0 === x1) return y0;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
}

/**
 * Executes a 2D bilinear interpolation across an indexed data matrix.
 * Used to find target speeds when weight or cost index fall between rows/columns.
 */
export function interpolate2D(targetRow, targetCol, rowHeaders, colHeaders, dataMatrix) {
  // 1. Locate bounding row indices
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

  // 2. Locate bounding column indices
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

  // 3. Pull the four bounding matrix values
  const q00 = dataMatrix[r0][c0];
  const q01 = dataMatrix[r0][c1];
  const q10 = dataMatrix[r1][c0];
  const q11 = dataMatrix[r1][c1];

  // 4. Interpolate columns across bounding rows
  const r0_interp = interpolate1D(targetCol, colHeaders[c0], colHeaders[c1], q00, q01);
  const r1_interp = interpolate1D(targetCol, colHeaders[c0], colHeaders[c1], q10, q11);

  // 5. Final interpolation between rows to yield resolved solution
  return interpolate1D(targetRow, rowHeaders[r0], rowHeaders[r1], r0_interp, r1_interp);
}
