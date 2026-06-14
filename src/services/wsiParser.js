/**
 * WSI Pilotbrief & ACARS Flight Plan Parser for PathOptix
 */

/**
 * Parses the raw copy-pasted WSI Pilotbrief release or the 4-line ACARS datalink text
 * and extracts MCDU, performance, and flight planning variables.
 * 
 * @param {string} text Raw text block pasted by the pilot
 * @returns {object} Extracted fields mapping directly to mission context variables
 */
export function parseWsiBrief(text) {
  if (!text) return null;

  const result = {};

  // Clean lines
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 1. Parse ACARS Datalink block lines if present
  // Line 1: CYOW / CYYT / CYDF / POE297 / 16029
  const airportLineIndex = lines.findIndex(line => {
    const parts = line.split('/');
    return parts.length >= 3 && parts[0].trim().length === 4 && parts[1].trim().length === 4;
  });

  if (airportLineIndex !== -1) {
    const parts = lines[airportLineIndex].split('/').map(p => p.trim());
    result.departure = parts[0];
    result.arrival = parts[1];
    result.alternate = parts[2];
    if (parts[3]) result.flightNumber = parts[3];

    // Line 2 (Route String): usually immediately follows airports
    if (airportLineIndex + 1 < lines.length) {
      const routeCandidate = lines[airportLineIndex + 1].trim();
      const words = routeCandidate.split(/\s+/);
      if (words.length >= 3 && words[0] === result.departure && words[words.length - 1] === result.arrival) {
        result.routeString = routeCandidate;
      }
    }

    // Line 4 (Performance Data): 1666 / 400 / 2665 / FL310 / 279@47 / 97P / 26.0 / P04 ISA / 101758 LBS / CI055
    const perfLine = lines.find(line => {
      const parts = line.split('/');
      return parts.length >= 8 && (line.includes('ISA') || line.includes('ZFW') || line.includes('LBS') || line.includes('CI'));
    });

    if (perfLine) {
      const perfParts = perfLine.split('/').map(p => p.trim());
      if (perfParts.length >= 10) {
        result.finalReserveFuel = parseInt(perfParts[0], 10);
        result.taxiFuel = parseInt(perfParts[1], 10);
        result.alternateFuel = parseInt(perfParts[2], 10);

        const flMatch = perfParts[3].match(/FL(\d+)/i);
        if (flMatch) result.cruiseFL = parseInt(flMatch[1], 10);

        // Wind: 279@47
        const windMatch = perfParts[4].match(/(\d+)@(\d+)/);
        if (windMatch) {
          result.averageWindDir = parseInt(windMatch[1], 10);
          result.averageWindSpeed = parseInt(windMatch[2], 10);
          result.wind = parseInt(windMatch[2], 10); // Set as default wind component
        }

        const paxMatch = perfParts[5].match(/(\d+)P/i);
        if (paxMatch) result.pax = parseInt(paxMatch[1], 10);

        // MAC %: 26.0
        const macVal = parseFloat(perfParts[6]);
        if (!isNaN(macVal)) result.mac = macVal;

        // ISA: P04 ISA or M04 ISA
        const isaMatch = perfParts[7].match(/(P|M)(\d+)\s+ISA/i);
        if (isaMatch) {
          const sign = isaMatch[1].toUpperCase() === 'M' ? -1 : 1;
          result.isaDev = sign * parseInt(isaMatch[2], 10);
        }

        // ZFW
        const zfwMatch = perfParts[8].match(/(\d+)\s*LBS/i);
        if (zfwMatch) result.zeroFuelWeight = parseInt(zfwMatch[1], 10);

        // Cost Index
        const ciMatch = perfParts[9].match(/CI(\d+)/i);
        if (ciMatch) result.costIndex = parseInt(ciMatch[1], 10);
      }
    }
  }

  // 2. Global Regex parsing fallbacks (handles full Pilotbrief tables copy-pasted directly)

  // RAMP FUEL (Block Fuel)
  if (!result.blockFuel) {
    const rampMatch = text.match(/RAMP FUEL\s+(\d+)/i) || text.match(/TOT BRF\s+(\d+)/i);
    if (rampMatch) result.blockFuel = parseInt(rampMatch[1], 10);
  }

  // PLANNED FUEL BURN
  if (!result.plannedFuelBurn) {
    const burnMatch = text.match(/BURN\s+(?:[A-Z]{4}\s+)?(\d+)/i) || text.match(/BURN CYYT\s+(\d+)/i);
    if (burnMatch) result.plannedFuelBurn = parseInt(burnMatch[1], 10);
  }

  // ZFW
  if (!result.zeroFuelWeight) {
    const zfwMatch = text.match(/ZFW\s+(\d+)/i);
    if (zfwMatch) result.zeroFuelWeight = parseInt(zfwMatch[1], 10);
  }

  // TAXI FUEL
  if (!result.taxiFuel) {
    const taxiMatch = text.match(/TAXI\s+(\d+)/i);
    if (taxiMatch) result.taxiFuel = parseInt(taxiMatch[1], 10);
  }

  // ALTERNATE FUEL
  if (!result.alternateFuel) {
    const altMatch = text.match(/ALT\s+(?:[A-Z]{4}\s+)?(\d+)/i) || text.match(/ALT CYDF\s+(\d+)/i);
    if (altMatch) result.alternateFuel = parseInt(altMatch[1], 10);
  }

  // FINAL RESERVE FUEL
  if (!result.finalReserveFuel) {
    const finalMatch = text.match(/FINAL\s+(\d+)/i);
    if (finalMatch) result.finalReserveFuel = parseInt(finalMatch[1], 10);
  }

  // PAX
  if (!result.pax) {
    const paxMatch = text.match(/EXP PAX\s+(\d+)/i) || text.match(/PAX\s+(\d+)/i);
    if (paxMatch) result.pax = parseInt(paxMatch[1], 10);
  }

  // COST INDEX
  if (!result.costIndex) {
    const ciMatch = text.match(/CI\s*(\d+)/i) || text.match(/COST INDEX\s*(\d+)/i);
    if (ciMatch) result.costIndex = parseInt(ciMatch[1], 10);
  }

  // CRUISE LEVEL
  if (!result.cruiseFL) {
    const flMatch = text.match(/FL\s*(\d+)/i) || text.match(/CRUISE ALT\s*FL?(\d+)/i);
    if (flMatch) result.cruiseFL = parseInt(flMatch[1], 10);
  }

  // MAC
  if (!result.mac) {
    const macMatch = text.match(/(\d+\.\d+)\s*(?:MAC|%)/i);
    if (macMatch) result.mac = parseFloat(macMatch[1]);
  }

  return result;
}
