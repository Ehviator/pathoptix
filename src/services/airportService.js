/**
 * PathOptix Airport & Runway Service
 * Handles airport runway configurations and runway wind-vector calculations.
 */

// Runway configurations for Porter primary network stations
const RUNWAY_DATABASE = {
  CYYZ: [
    { ident: '05', heading: 57, length: 11120, width: 200 },
    { ident: '23', heading: 237, length: 11120, width: 200 },
    { ident: '06L', heading: 57, length: 9697, width: 150 },
    { ident: '24R', heading: 237, length: 9697, width: 150 },
    { ident: '06R', heading: 57, length: 9000, width: 150 },
    { ident: '24L', heading: 237, length: 9000, width: 150 },
    { ident: '15L', heading: 147, length: 11050, width: 150 },
    { ident: '33R', heading: 327, length: 11050, width: 150 },
    { ident: '15R', heading: 147, length: 9088, width: 150 },
    { ident: '33L', heading: 327, length: 9088, width: 150 }
  ],
  CYOW: [
    { ident: '07', heading: 70, length: 8000, width: 200 },
    { ident: '25', heading: 250, length: 8000, width: 200 },
    { ident: '14', heading: 140, length: 10005, width: 150 },
    { ident: '32', heading: 320, length: 10005, width: 150 }
  ],
  CYUL: [
    { ident: '06L', heading: 57, length: 11000, width: 150 },
    { ident: '24R', heading: 237, length: 11000, width: 150 },
    { ident: '06R', heading: 57, length: 9600, width: 150 },
    { ident: '24L', heading: 237, length: 9600, width: 150 },
    { ident: '10', heading: 97, length: 7000, width: 150 },
    { ident: '28', heading: 277, length: 7000, width: 150 }
  ],
  CYHZ: [
    { ident: '05', heading: 53, length: 10500, width: 150 },
    { ident: '23', heading: 233, length: 10500, width: 150 },
    { ident: '14', heading: 143, length: 7700, width: 150 },
    { ident: '32', heading: 323, length: 7700, width: 150 }
  ],
  CYVR: [
    { ident: '08L', heading: 83, length: 9940, width: 150 },
    { ident: '26R', heading: 263, length: 9940, width: 150 },
    { ident: '08R', heading: 83, length: 11500, width: 200 },
    { ident: '26L', heading: 263, length: 11500, width: 200 },
    { ident: '13', heading: 130, length: 7300, width: 150 },
    { ident: '31', heading: 310, length: 7300, width: 150 }
  ],
  CYEG: [
    { ident: '12', heading: 124, length: 10200, width: 200 },
    { ident: '30', heading: 304, length: 10200, width: 200 },
    { ident: '02', heading: 24, length: 10860, width: 150 },
    { ident: '20', heading: 204, length: 10860, width: 150 }
  ],
  CYYC: [
    { ident: '17L', heading: 174, length: 14000, width: 200 },
    { ident: '35R', heading: 354, length: 14000, width: 200 },
    { ident: '17R', heading: 174, length: 12675, width: 200 },
    { ident: '35L', heading: 354, length: 12675, width: 200 },
    { ident: '11', heading: 108, length: 8000, width: 150 },
    { ident: '29', heading: 288, length: 8000, width: 150 }
  ],
  CYWG: [
    { ident: '13', heading: 132, length: 10000, width: 200 },
    { ident: '31', heading: 312, length: 10000, width: 200 },
    { ident: '18', heading: 182, length: 8700, width: 150 },
    { ident: '36', heading: 2, length: 8700, width: 150 }
  ],
  CYQB: [
    { ident: '06', heading: 62, length: 9000, width: 150 },
    { ident: '24', heading: 242, length: 9000, width: 150 },
    { ident: '11', heading: 112, length: 5700, width: 150 },
    { ident: '29', heading: 292, length: 5700, width: 150 }
  ],
  CYYT: [
    { ident: '11', heading: 110, length: 8502, width: 200 },
    { ident: '29', heading: 290, length: 8502, width: 200 },
    { ident: '16', heading: 159, length: 7005, width: 200 },
    { ident: '34', heading: 339, length: 7005, width: 200 },
    { ident: '20', heading: 204, length: 5028, width: 150 },
    { ident: '02', heading: 24, length: 5028, width: 150 }
  ],
  CYQM: [
    { ident: '06', heading: 61, length: 6150, width: 150 },
    { ident: '24', heading: 241, length: 6150, width: 150 },
    { ident: '11', heading: 111, length: 10000, width: 200 },
    { ident: '29', heading: 291, length: 10000, width: 200 }
  ],
  CYTZ: [
    { ident: '08', heading: 82, length: 3988, width: 150 },
    { ident: '26', heading: 262, length: 3988, width: 150 }
  ],
  // Phase 8 additions:
  CYQT: [
    { ident: '12', heading: 122, length: 7318, width: 150 },
    { ident: '30', heading: 302, length: 7318, width: 150 },
    { ident: '07', heading: 72, length: 5298, width: 150 },
    { ident: '25', heading: 252, length: 5298, width: 150 }
  ],
  CYLW: [
    { ident: '16', heading: 162, length: 7300, width: 150 },
    { ident: '34', heading: 342, length: 7300, width: 150 }
  ],
  CYYJ: [
    { ident: '09', heading: 90, length: 7000, width: 150 },
    { ident: '27', heading: 270, length: 7000, width: 150 },
    { ident: '03', heading: 28, length: 5028, width: 150 },
    { ident: '21', heading: 208, length: 5028, width: 150 },
    { ident: '14', heading: 136, length: 4600, width: 150 },
    { ident: '32', heading: 316, length: 4600, width: 150 }
  ],
  CYDF: [
    { ident: '07', heading: 72, length: 8005, width: 150 },
    { ident: '25', heading: 252, length: 8005, width: 150 }
  ]
};

/**
 * Enriches airport object from standard database with high-fidelity runway layout data.
 * 
 * @param {string} icao - Airport ICAO code
 * @param {Object} baseData - Raw airport data from airport_db.json
 * @returns {Object} Enriched airport data
 */
export function enrichAirport(icao, baseData) {
  if (!baseData) return null;
  const upperIcao = icao.toUpperCase().trim();
  const runways = RUNWAY_DATABASE[upperIcao] || [];
  return {
    ...baseData,
    runways
  };
}

/**
 * Calculates headwind and crosswind components for a runway given wind vectors.
 * 
 * @param {number} runwayHeading - Runway magnetic heading in degrees
 * @param {number} windDir - Wind direction in degrees
 * @param {number} windSpeed - Wind speed in knots
 * @returns {Object} Calculations containing raw headwind (negative is tailwind) and absolute crosswind
 */
export function calculateWindComponents(runwayHeading, windDir, windSpeed) {
  const rwyHdg = typeof runwayHeading === 'number' && !isNaN(runwayHeading) ? runwayHeading : 0;
  const wDir = typeof windDir === 'number' && !isNaN(windDir) ? windDir : 0;
  const wSpeed = typeof windSpeed === 'number' && !isNaN(windSpeed) ? windSpeed : 0;

  if (wSpeed === 0) {
    return { headwind: 0, crosswind: 0 };
  }

  // Calculate angular difference in radians
  const angleRad = ((wDir - rwyHdg) * Math.PI) / 180;
  
  // Headwind (positive = headwind, negative = tailwind)
  const headwind = Math.round(wSpeed * Math.cos(angleRad));
  
  // Crosswind (absolute value is typically used for limits checks)
  const crosswind = Math.round(Math.abs(wSpeed * Math.sin(angleRad)));

  return { headwind, crosswind };
}
