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
        result.finalReserveFuel = parseInt(perfParts[0].replace(/,/g, ''), 10);
        result.taxiFuel = parseInt(perfParts[1].replace(/,/g, ''), 10);
        result.alternateFuel = parseInt(perfParts[2].replace(/,/g, ''), 10);

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
        const zfwMatch = perfParts[8].match(/([\d,]+)\s*LBS/i);
        if (zfwMatch) result.zeroFuelWeight = parseInt(zfwMatch[1].replace(/,/g, ''), 10);

        // Cost Index
        const ciMatch = perfParts[9].match(/CI(\d+)/i);
        if (ciMatch) result.costIndex = parseInt(ciMatch[1], 10);
      }
    }
  }

  // 2. Global Regex parsing fallbacks (handles full Pilotbrief tables copy-pasted directly)

  // RAMP FUEL (Block Fuel)
  if (!result.blockFuel) {
    const rampMatch = text.match(/(?:RAMP|BLOCK)\s+FUEL\s+([\d,]+)/i) || 
                      text.match(/RAMP FUEL\s+([\d,]+)/i) || 
                      text.match(/TOT BRF\s+([\d,]+)/i) ||
                      text.match(/BLOCK\s+([\d,]+)/i) ||
                      text.match(/BLOCK FUEL\s+([\d,]+)/i) ||
                      text.match(/RAMP\s+([\d,]+)/i) ||
                      text.match(/RAMP\s*:\s*([\d,]+)/i) ||
                      text.match(/BLOCK\s*:\s*([\d,]+)/i);
    if (rampMatch) result.blockFuel = parseInt(rampMatch[1].replace(/,/g, ''), 10);
  }

  // PLANNED FUEL BURN
  if (!result.plannedFuelBurn) {
    const burnMatch = text.match(/BURN\s+(?:[A-Z]{4}\s+)?([\d,]+)/i) || 
                      text.match(/BURN CYYT\s+([\d,]+)/i) || 
                      text.match(/TRIP\s+([\d,]+)/i) ||
                      text.match(/TRIP\s+FUEL\s+([\d,]+)/i) ||
                      text.match(/TRIP\s*:\s*([\d,]+)/i) ||
                      text.match(/BURN\s*:\s*([\d,]+)/i);
    if (burnMatch) result.plannedFuelBurn = parseInt(burnMatch[1].replace(/,/g, ''), 10);
  }

  // ZFW
  if (!result.zeroFuelWeight) {
    const zfwMatch = text.match(/ZFW\s+([\d,]+)/i) || 
                     text.match(/EZFW\s+([\d,]+)/i) || 
                     text.match(/ZERO FUEL WT\s+([\d,]+)/i) || 
                     text.match(/ZFW\s*:\s*([\d,]+)/i) ||
                     text.match(/ZERO FUEL WT\s*:\s*([\d,]+)/i);
    if (zfwMatch) result.zeroFuelWeight = parseInt(zfwMatch[1].replace(/,/g, ''), 10);
  }

  // TAXI FUEL
  if (!result.taxiFuel) {
    const taxiMatch = text.match(/TAXI\s+([\d,]+)/i) || 
                      text.match(/TAXI FUEL\s+([\d,]+)/i) || 
                      text.match(/TAXI\s*:\s*([\d,]+)/i);
    if (taxiMatch) result.taxiFuel = parseInt(taxiMatch[1].replace(/,/g, ''), 10);
  }

  // ALTERNATE FUEL
  if (!result.alternateFuel) {
    const altMatch = text.match(/ALT\s+(?:[A-Z]{4}\s+)?([\d,]+)/i) || 
                     text.match(/ALT CYDF\s+([\d,]+)/i) || 
                     text.match(/ALTN\s+([\d,]+)/i) || 
                     text.match(/ALTN FUEL\s+([\d,]+)/i) || 
                     text.match(/ALTN\s*:\s*([\d,]+)/i);
    if (altMatch) result.alternateFuel = parseInt(altMatch[1].replace(/,/g, ''), 10);
  }

  // FINAL RESERVE FUEL
  if (!result.finalReserveFuel) {
    const finalMatch = text.match(/FINAL\s+([\d,]+)/i) || 
                       text.match(/RESV\s+([\d,]+)/i) || 
                       text.match(/RESERVE\s+([\d,]+)/i) || 
                       text.match(/FINAL RESERVE\s+([\d,]+)/i) || 
                       text.match(/RESV\s*:\s*([\d,]+)/i) || 
                       text.match(/HOLD\s+([\d,]+)/i) ||
                       text.match(/HOLD\s*:\s*([\d,]+)/i);
    if (finalMatch) result.finalReserveFuel = parseInt(finalMatch[1].replace(/,/g, ''), 10);
  }

  // PAX
  if (!result.pax) {
    const paxMatch = text.match(/EXP PAX\s+(\d+)/i) || 
                     text.match(/PAX\s+(\d+)/i) || 
                     text.match(/PAX\s*:\s*(\d+)/i);
    if (paxMatch) result.pax = parseInt(paxMatch[1], 10);
  }

  // COST INDEX
  if (!result.costIndex) {
    const ciMatch = text.match(/CI\s*(\d+)/i) || 
                    text.match(/COST INDEX\s*(\d+)/i) || 
                    text.match(/CI\s*:\s*(\d+)/i) || 
                    text.match(/COST INDEX\s*:\s*(\d+)/i);
    if (ciMatch) result.costIndex = parseInt(ciMatch[1], 10);
  }

  // CRUISE LEVEL
  if (!result.cruiseFL) {
    const flMatch = text.match(/FL\s*(\d+)/i) || 
                    text.match(/CRUISE ALT\s*FL?(\d+)/i) || 
                    text.match(/CRUISE LEVEL\s*FL?(\d+)/i) || 
                    text.match(/FLIGHT LEVEL\s*FL?(\d+)/i);
    if (flMatch) result.cruiseFL = parseInt(flMatch[1], 10);
  }

  // MAC
  if (!result.mac) {
    const macMatch = text.match(/(\d+\.\d+)\s*(?:MAC|%)/i) || 
                     text.match(/(?:MAC|%)\s*(\d+\.\d+)/i) ||
                     text.match(/(?:MAC|%)\s*:\s*(\d+\.\d+)/i);
    if (macMatch) result.mac = parseFloat(macMatch[1]);
  }

  // REGISTRATION (aircraft registration)
  const regMatch = text.match(/REG\/([A-Z0-9\-]+)/i) ||
                   text.match(/REG\s+([A-Z0-9\-]+)/i) ||
                   text.match(/REG\s*:\s*([A-Z0-9\-]+)/i) ||
                   text.match(/AIRCRAFT\s+([A-Z0-9\-]+)/i) ||
                   text.match(/AC\s+REG\s+([A-Z0-9\-]+)/i) ||
                   text.match(/AC\s+([A-Z0-9\-]+)/i);
  if (!result.registration && regMatch) {
    result.registration = regMatch[1].toUpperCase();
  }

  // FLIGHT ID / NUMBER
  const fltMatch = text.match(/\bFLIGHT\s+(?!(?:PLAN|BRIEFING|RELEASE|LOG|OFP|STATUS|INFO)\b)([A-Z0-9]+)/i) ||
                   text.match(/\bFLT\s+(?!(?:PLAN|BRIEFING|RELEASE|LOG|OFP|STATUS|INFO)\b)([A-Z0-9]+)/i) ||
                   text.match(/\bFLT\s*:\s*([A-Z0-9]+)/i) ||
                   text.match(/\bFLIGHT\s*:\s*([A-Z0-9]+)/i) ||
                   text.match(/\bFLT\s*ID\s+([A-Z0-9]+)/i);
  if (!result.flightNumber && fltMatch) {
    result.flightNumber = fltMatch[1].toUpperCase();
  }

  // DEPARTURE, ARRIVAL, ALTERNATE
  if (!result.departure) {
    const depMatch = text.match(/\bDEP\s*:\s*([A-Z]{4})/i) || text.match(/\bDEP\s+(?!(?:TIME|DATE|FUEL|BIAS|WIND|TEMP|GATE|ELEV|QNH)\b)([A-Z]{4})\b/i);
    if (depMatch) result.departure = depMatch[1].toUpperCase();
  }
  if (!result.arrival) {
    const arrMatch = text.match(/\bARR\s*:\s*([A-Z]{4})/i) || text.match(/\bARR\s+(?!(?:TIME|DATE|FUEL|BIAS|WIND|TEMP|GATE|ELEV|QNH)\b)([A-Z]{4})\b/i);
    if (arrMatch) result.arrival = arrMatch[1].toUpperCase();
  }
  if (!result.alternate) {
    const altnMatch = text.match(/\bALTN\s*:\s*([A-Z]{4})/i) || text.match(/\bALTN\s+(?!(?:TIME|DATE|FUEL|BIAS|WIND|TEMP|GATE|ELEV|QNH)\b)([A-Z]{4})\b/i) || text.match(/\bALT\s+(?!(?:TIME|DATE|FUEL|BIAS|WIND|TEMP|GATE|ELEV|QNH)\b)([A-Z]{4})\b/i);
    if (altnMatch) result.alternate = altnMatch[1].toUpperCase();
  }

  // ROUTE STRING
  const routeMatch = text.match(/(?<!CO-)\bROUTE\s*:\s*(?!BRIEFING)([\s\S]+?)(?=\r?\n\s*\r?\n|\r?\n\s*(?:FUEL|CI|COST|ZFW|BLOCK|TAXI|ALTN|REG|FLIGHT|DISP|RMK|FPL-|\*|-|WIND|TEMP|ELEV|NAV|AWY|INFO))/i) ||
                     text.match(/(?<!CO-)\bROUTE\s+(?!BRIEFING)([\s\S]+?)(?=\r?\n\s*\r?\n|\r?\n\s*(?:FUEL|CI|COST|ZFW|BLOCK|TAXI|ALTN|REG|FLIGHT|DISP|RMK|FPL-|\*|-|WIND|TEMP|ELEV|NAV|AWY|INFO))/i);
  if (!result.routeString && routeMatch) {
    result.routeString = routeMatch[1].replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  // ETE (Estimated Time Enroute)
  if (!result.plannedEte) {
    const eteMatch = text.match(/\bETE\s+(\d{2})(\d{2})\b/i) || 
                     text.match(/\bETE\s*:\s*(\d{2})(\d{2})\b/i);
    if (eteMatch) {
      const hours = parseInt(eteMatch[1], 10);
      const mins = parseInt(eteMatch[2], 10);
      if (hours < 24 && mins < 60) {
        result.plannedEte = hours * 60 + mins;
      }
    }
  }

  if (!result.plannedEte) {
    if (result.arrival) {
      const fplEteMatch = text.match(new RegExp(`-${result.arrival}(\\d{2})(\\d{2})\\b`, 'i'));
      if (fplEteMatch) {
        const hours = parseInt(fplEteMatch[1], 10);
        const mins = parseInt(fplEteMatch[2], 10);
        if (hours < 24 && mins < 60) {
          result.plannedEte = hours * 60 + mins;
        }
      }
    }
    if (!result.plannedEte) {
      const matches = [...text.matchAll(/-([A-Z]{4})(\d{2})(\d{2})\b/gi)];
      for (const match of matches) {
        const apt = match[1].toUpperCase();
        if (apt !== result.departure) {
          const hours = parseInt(match[2], 10);
          const mins = parseInt(match[3], 10);
          if (hours < 24 && mins < 60) {
            result.plannedEte = hours * 60 + mins;
            break;
          }
        }
      }
    }
  }

  if (!result.plannedEte) {
    const burnEteMatch = text.match(/BURN\s+[A-Z]{4}\s+\d+\s+(\d{2})(\d{2})\b/i);
    if (burnEteMatch) {
      const hours = parseInt(burnEteMatch[1], 10);
      const mins = parseInt(burnEteMatch[2], 10);
      if (hours < 24 && mins < 60) {
        result.plannedEte = hours * 60 + mins;
      }
    }
  }

  // WIND PROFILE AND ISA DEV EXTRACTION
  let windSpeedVal = null;
  let windDirVal = null;
  let isaDevVal = null;

  const windProfileRegex = /FL(\d+)\s+(\d{3})\/(\d{2,3})(?:\s+(P|M)(\d+))?/i;
  const windProfileMatches = text.match(windProfileRegex);
  if (windProfileMatches) {
    const cruiseFLVal = result.cruiseFL;
    let bestMatch = windProfileMatches;

    if (cruiseFLVal) {
      const allMatches = [...text.matchAll(new RegExp(windProfileRegex, 'gi'))];
      const matchForFL = allMatches.find(m => parseInt(m[1], 10) === cruiseFLVal);
      if (matchForFL) {
        bestMatch = matchForFL;
      }
    }

    windDirVal = parseInt(bestMatch[2], 10);
    windSpeedVal = parseInt(bestMatch[3], 10);
    if (bestMatch[4] && bestMatch[5]) {
      const sign = bestMatch[4].toUpperCase() === 'M' ? -1 : 1;
      isaDevVal = sign * parseInt(bestMatch[5], 10);
    }
  }

  if (windDirVal !== null && !result.averageWindDir) result.averageWindDir = windDirVal;
  if (windSpeedVal !== null && !result.averageWindSpeed) {
    result.averageWindSpeed = windSpeedVal;
    result.wind = windSpeedVal;
  }
  if (isaDevVal !== null && (result.isaDev === undefined || result.isaDev === '')) result.isaDev = isaDevVal;

  const navLogWaypoints = parseNavLogWaypoints(text);
  if (navLogWaypoints.length > 0) {
    result.navLogCustomData = navLogWaypoints;
  }

  return result;
}

/**
 * Parses the waypoint rows inside the PDF's MAIN NAV LOG table.
 * Extracts flight levels, wind components (GS - TAS), SAT, and planned fuel remaining (PFREM).
 * 
 * @param {string} text Raw flight briefing text
 * @returns {Array<object>} Array of parsed waypoint details
 */
export function parseNavLogWaypoints(text) {
  if (!text) return [];

  const waypoints = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let inNavLog = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('MAIN NAV LOG')) {
      inNavLog = true;
      continue;
    }

    if (inNavLog && (line.includes('ALTERNATE NAV LOG') || line.includes('POINT FL330') || (line.includes('---') && i > 0 && lines[i-1].includes('CYYT')))) {
      inNavLog = false;
      break;
    }

    if (!inNavLog) continue;

    const words1 = line.split(/\s+/);
    if (words1.length < 5) continue;

    const identCandidate = words1[0];
    if (!/^-?[A-Z0-9]{3,7}$/.test(identCandidate)) continue;

    if (i + 1 >= lines.length) continue;
    const line2 = lines[i + 1];
    const words2 = line2.split(/\s+/);
    if (words2.length < 3) continue;

    const tasGsWord = words2[0];
    if (!/^\d{3}\/\d{3}$/.test(tasGsWord)) continue;

    const ident = identCandidate.replace(/^-/, '').toUpperCase();

    // 1. Flight Level (FL)
    let fl = 350; // default cruise level fallback
    const flWord = words1[1];
    if (/^\d{3}$/.test(flWord)) {
      fl = parseInt(flWord, 10);
    }

    // 2. Wind Component (GS - TAS)
    const [tasStr, gsStr] = tasGsWord.split('/');
    const tas = parseInt(tasStr, 10);
    const gs = parseInt(gsStr, 10);
    const wind = gs - tas;

    // 3. SAT (temperature)
    let sat = -45; // default fallback temp
    const tempWord = words1.find(w => /^[MP]\d{2}$/i.test(w));
    if (tempWord) {
      const sign = tempWord[0].toUpperCase() === 'M' ? -1 : 1;
      sat = sign * parseInt(tempWord.slice(1), 10);
    }

    // 4. Planned Fuel Remaining (PFREM)
    const pfremWord = words1[words1.length - 1];
    let plannedFuel = 0;
    if (/^\d+$/.test(pfremWord)) {
      plannedFuel = parseInt(pfremWord, 10);
    }

    waypoints.push({
      ident,
      fl,
      wind,
      sat,
      plannedFuel,
      actualFuel: plannedFuel
    });

    i++; // Skip Line 2 since it was consumed
  }

  return waypoints;
}

