/**
 * Weather API Service for PathOptix
 * Connects to the Aviation Weather Center (AWC) API and parses METAR data.
 */

/**
 * Parses a raw METAR text string to extract key operational metrics.
 * 
 * @param {string} rawMetarString Raw METAR text
 * @returns {object} Parsed metrics (altimeter, temperature, windString, windDirection, windSpeed, windGust, flightCategory)
 */
export function parseMetar(rawMetarString) {
  const defaultResult = {
    altimeter: 29.92,
    temperature: 15,
    windString: 'Calm',
    windDirection: 0,
    windSpeed: 0,
    windGust: null,
    flightCategory: 'VFR',
    elevation: 0
  };

  if (!rawMetarString) return defaultResult;

  const cleanMetar = rawMetarString.toUpperCase().trim();

  // 1. Parse Altimeter (e.g., A2992 or Q1013)
  let altimeter = 29.92;
  const altMatch = cleanMetar.match(/\bA(\d{4})\b/);
  if (altMatch) {
    altimeter = parseFloat(altMatch[1]) / 100;
  } else {
    const qnhMatch = cleanMetar.match(/\bQ(\d{4})\b/);
    if (qnhMatch) {
      // Convert hPa to inHg: 1 hPa = 0.0295300286 inHg
      altimeter = Math.round(parseFloat(qnhMatch[1]) * 0.0295300286 * 100) / 100;
    }
  }

  // 2. Parse Surface Temperature (e.g., 14/08 or M02/M05)
  let temperature = 15;
  const tempMatch = cleanMetar.match(/\b(M?\d{2})\/(M?\d{2})?\b/);
  if (tempMatch) {
    const tempStr = tempMatch[1];
    temperature = tempStr.startsWith('M')
      ? -parseInt(tempStr.slice(1), 10)
      : parseInt(tempStr, 10);
  }

  // 3. Parse Wind Vector (e.g., 24015G25KT or VRB05KT or 00000KT)
  let windDirection = 0;
  let windSpeed = 0;
  let windGust = null;
  let windString = 'Calm';

  const windMatch = cleanMetar.match(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/);
  if (windMatch) {
    const dir = windMatch[1];
    const speed = parseInt(windMatch[2], 10);
    const gust = windMatch[3] ? parseInt(windMatch[3], 10) : null;

    windDirection = dir === 'VRB' ? 'VRB' : parseInt(dir, 10);
    windSpeed = speed;
    windGust = gust;

    if (dir === 'VRB') {
      windString = `VRB @ ${speed} KT`;
    } else if (speed === 0) {
      windString = 'Calm';
    } else {
      windString = `${dir}° @ ${speed} KT`;
    }

    if (gust !== null && speed > 0) {
      windString += ` G ${gust} KT`;
    }
  }

  // 4. Fallback/Rough Flight Category Parser if not supplied by API JSON
  // (LIFR: ceiling < 500' or vis < 1SM; IFR: ceiling < 1000' or vis < 3SM; MVFR: ceiling <= 3000' or vis <= 5SM; VFR otherwise)
  let flightCategory = 'VFR';
  const visMatch = cleanMetar.match(/\b(\d+(?:\/\d+)?|M?\d+)SM\b/);
  let visibility = 10; // Default VFR
  if (visMatch) {
    if (visMatch[1].includes('/')) {
      const parts = visMatch[1].split('/');
      visibility = parseFloat(parts[0]) / parseFloat(parts[1]);
    } else {
      visibility = parseFloat(visMatch[1].replace('M', ''));
    }
  }

  // Simple cloud height check: e.g. OVC008, BKN015, FEW025, SCT030
  // Clouds are in hundreds of feet, so OVC008 is 800 ft
  let ceiling = 99999;
  const cloudMatches = cleanMetar.matchAll(/\b(BKN|OVC)(\d{3})\b/g);
  for (const match of cloudMatches) {
    const height = parseInt(match[2], 10) * 100;
    if (height < ceiling) {
      ceiling = height;
    }
  }

  if (ceiling < 500 || visibility < 1) {
    flightCategory = 'LIFR';
  } else if (ceiling < 1000 || visibility < 3) {
    flightCategory = 'IFR';
  } else if (ceiling <= 3000 || visibility <= 5) {
    flightCategory = 'MVFR';
  }

  return {
    altimeter,
    temperature,
    windString,
    windDirection,
    windSpeed,
    windGust,
    flightCategory
  };
}

/**
 * Fetches the METAR weather data for a given ICAO airport from the AWC API.
 * Uses AbortController to support a 5-second timeout and gracefully degrades.
 * 
 * @param {string} icao ICAO code (e.g. CYOW, KORD)
 * @returns {Promise<object>} Parsed weather object, or OFFLINE fallback
 */
export async function fetchAirportWeather(icao) {
  if (!icao || icao.length < 3) {
    return { status: 'NO_ICAO', icao };
  }

  const cleanIcao = icao.toUpperCase().trim();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000); // 6-second timeout for extra headroom

  try {
    const devProxyUrl = `/awc/api/data/metar?ids=${cleanIcao}&format=json`;
    const directUrl = `https://aviationweather.gov/api/data/metar?ids=${cleanIcao}&format=json`;
    
    let response = null;

    // Check if we are running on a local development server
    const isLocal = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || 
       window.location.hostname === '127.0.0.1' || 
       window.location.hostname.startsWith('192.168.'));

    if (isLocal) {
      try {
        response = await fetch(devProxyUrl, { signal: controller.signal });
      } catch (proxyErr) {
        console.warn(`[AWC Weather API] Dev proxy failed for ${cleanIcao}, trying direct fetch:`, proxyErr);
      }
    }

    // If not local or dev proxy fetch failed, try direct fetch
    if (!response || !response.ok) {
      response = await fetch(directUrl, { signal: controller.signal });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP response status: ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      return { status: 'NO_DATA', icao: cleanIcao };
    }

    const metarObj = data[0];
    const parsed = parseMetar(metarObj.rawOb || '');

    return {
      status: 'OK',
      icao: cleanIcao,
      raw: metarObj.rawOb || '',
      obsTime: metarObj.obsTime || Math.floor(Date.now() / 1000),
      receiptTime: metarObj.receiptTime || new Date().toISOString(),
      flightCategory: metarObj.fltCat || parsed.flightCategory || 'VFR',
      elevation: metarObj.elev ? Math.round(metarObj.elev * 3.28084) : 0,
      altimeter: parsed.altimeter || 29.92,
      temperature: parsed.temperature !== null ? parsed.temperature : 15,
      wind: parsed.windString || 'Calm',
      windDirection: parsed.windDirection,
      windSpeed: parsed.windSpeed,
      windGust: parsed.windGust
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn(`[AWC Weather API] Direct/Proxy fetch failed for ${cleanIcao}. Attempting CORS backup proxy...`);

    // Backup: Try AllOrigins CORS proxy as a last resort
    const backupController = new AbortController();
    const backupTimeoutId = setTimeout(() => backupController.abort(), 6000);

    try {
      const directUrl = `https://aviationweather.gov/api/data/metar?ids=${cleanIcao}&format=json`;
      const allOriginsUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(directUrl)}`;
      
      const backupResponse = await fetch(allOriginsUrl, { signal: backupController.signal });
      clearTimeout(backupTimeoutId);

      if (backupResponse.ok) {
        const backupJson = await backupResponse.json();
        if (backupJson && backupJson.contents) {
          const backupData = JSON.parse(backupJson.contents);
          if (backupData && backupData.length > 0) {
            const metarObj = backupData[0];
            const parsed = parseMetar(metarObj.rawOb || '');
            return {
              status: 'OK',
              icao: cleanIcao,
              raw: metarObj.rawOb || '',
              obsTime: metarObj.obsTime || Math.floor(Date.now() / 1000),
              receiptTime: metarObj.receiptTime || new Date().toISOString(),
              flightCategory: metarObj.fltCat || parsed.flightCategory || 'VFR',
              elevation: metarObj.elev ? Math.round(metarObj.elev * 3.28084) : 0,
              altimeter: parsed.altimeter || 29.92,
              temperature: parsed.temperature !== null ? parsed.temperature : 15,
              wind: parsed.windString || 'Calm',
              windDirection: parsed.windDirection,
              windSpeed: parsed.windSpeed,
              windGust: parsed.windGust
            };
          }
        }
      }
    } catch (backupErr) {
      clearTimeout(backupTimeoutId);
      console.error(`[AWC Weather API] AllOrigins backup proxy fetch failed:`, backupErr);
    }

    console.warn(`[AWC Weather API] All fetch methods exhausted. Returning OFFLINE status for ${cleanIcao}.`);
    return { status: 'OFFLINE', icao: cleanIcao };
  }
}
