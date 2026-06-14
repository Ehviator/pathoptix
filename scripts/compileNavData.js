import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIGURATION: Points to the local NAVDATA directory on your Desktop
const SOURCE_NAV_DATA_DIR = path.join(process.env.USERPROFILE || process.env.HOME, 'Desktop', 'NAVDATA', 'NavData');
const OUTPUT_FILE_PATH = path.resolve(__dirname, '../public/data/nav_db.json');

// GEOGRAPHIC FILTER: Eastern/Central Canada & North East US bounding envelope
const LAT_MIN = 40.0;
const LAT_MAX = 65.0;
const LON_MIN = -95.0;
const LON_MAX = -50.0;

async function parseFile(filePath, isNavaid, waypointsDict) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Source asset missing at: ${filePath}`);
    return;
  }

  console.log(`📖 Streaming and parsing: ${path.basename(filePath)}...`);
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    if (!line || line.startsWith('#')) continue;

    const parts = line.split('|');
    if (isNavaid) {
      if (parts.length < 8) continue;
      const ident = parts[0].trim().toUpperCase();
      const freqVal = parseInt(parts[2], 10);
      const lat = parseFloat(parts[6]) / 1000000;
      const lon = parseFloat(parts[7]) / 1000000;

      if (lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX) {
        let type = 'NDB';
        let freq = '';
        if (freqVal >= 108000) {
          type = 'VOR';
          freq = (freqVal / 1000).toFixed(2);
        } else {
          freq = (freqVal / 1000).toString();
        }

        waypointsDict[ident] = {
          type,
          lat: Math.round(lat * 10000) / 10000,
          lon: Math.round(lon * 10000) / 10000,
          freq
        };
        count++;
      }
    } else {
      if (parts.length < 3) continue;
      const ident = parts[0].trim().toUpperCase();
      const lat = parseFloat(parts[1]) / 1000000;
      const lon = parseFloat(parts[2]) / 1000000;

      if (lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX) {
        waypointsDict[ident] = {
          type: 'FIX',
          lat: Math.round(lat * 10000) / 10000,
          lon: Math.round(lon * 10000) / 10000
        };
        count++;
      }
    }
  }
  console.log(`✔️ Processed ${count} records from ${path.basename(filePath)}`);
}

async function compileMasterNavDatabase() {
  console.log('⚡ Initializing local NavData streaming compilation matrix...');
  
  const masterNavDb = {
    database_cycle: "2606",
    waypoints: {}
  };

  const waypointSource = path.join(SOURCE_NAV_DATA_DIR, 'Waypoints.txt');
  const navaidSource = path.join(SOURCE_NAV_DATA_DIR, 'Navaids.txt');

  if (!fs.existsSync(waypointSource) || !fs.existsSync(navaidSource)) {
    console.error('❌ One or more source database files are missing in NAVDATA folder.');
    return;
  }

  // Parse fixes/waypoints first
  await parseFile(waypointSource, false, masterNavDb.waypoints);

  // Parse navaids (VOR/NDB) next, overriding or adding
  await parseFile(navaidSource, true, masterNavDb.waypoints);

  // Ensure output directory exists
  const dir = path.dirname(OUTPUT_FILE_PATH);
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE_PATH, JSON.stringify(masterNavDb, null, 2), 'utf-8');
  console.log(`✅ Success! High-fidelity Navlog database written to: ${OUTPUT_FILE_PATH}`);
  console.log(`📦 Compiled ${Object.keys(masterNavDb.waypoints).length} regional navigation fixes safely.`);
}

compileMasterNavDatabase();
