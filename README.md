# PathOptix E195-E2 Electronic Flight Bag (EFB) Optimizer

PathOptix is an offline-first performance look-up engine and tactical vertical profile optimizer tailored for the Embraer E195-E2 aircraft. It is designed to run locally on iPad Electronic Flight Bags (EFBs), ensuring complete access to critical aerodynamic, climbing, and emergency OEI (One Engine Inoperative) lookup matrices even under total satellite connectivity loss.

The application features a premium dark OLED split-view layout built on standard iPadOS ergonomics and touch-screen safety buffers.

---

## Key Features

1. **Native Sidebar Navigation**: iPadOS-inspired split view layout featuring a collapsible left-hand navigation sidebar (toggle width: 260px / 70px) to maximize screen space for navigation maps and briefing sheets.
2. **Offline-First PWA Capabilities**: Leverages service workers and local caching databases to allow complete application execution, airport wind analysis, and performance lookups without any network connection.
3. **High-Fidelity Aeronautical Calculators**:
   - **Climb Tab**: Dynamically calculates optimal KIAS/Mach climbing targets, TOC ranges, and progressive mid-climb weight reductions.
   - **Cruise Tab**: Interpolates calibrated Mach speeds and fuel flow metrics matching the Porter E195-E2 fleet profiles.
   - **Descent Tab**: Solves Top-of-Descent (TOD) ranges based on customizable FPA flight paths, altimetry corrections, and surface winds.
4. **Enroute Terrain & OEI Simulator**: Samples coordinates and elevation models along the active route. Simulates engine failure (OEI) and driftdown slopes, verifying a regulatory 2,000-ft mountain clearance buffer, and recommending optimal escape airports.
5. **Real-time Meteorological Awareness**: Ingests aviation weather XML/feeds to display parsed METAR data, surface temperatures, and altimeter settings. Computes magnetic runway wind components, flagging crosswinds and tailwinds exceeding E195-E2 limits.
6. **Unified Flight Briefing Packages**: Compiles dispatch briefings, fuel loads, waypoints tracking, METARs, OEI escape plans, and terminal runway notes in a print-ready briefing release form.

---

## Directory Scaffolding

```
├── public/
│   ├── data/
│   │   ├── airport_db.json       # Runway dimensions, orientations & elevation data
│   │   ├── airways_db.json       # Sequential waypoint arrays for global airways
│   │   ├── climb_perf.json       # Bilinear look-up matrix for climb time, fuel & distance
│   │   ├── cruise_econ.json      # Optimal econ speeds matching E195-E2 profiles
│   │   ├── descent_fpa.json      # Bilinear look-up matrix for FPA descent profiles
│   │   ├── driftdown_oei.json    # Single-engine ceilings & fuel flow parameters
│   │   ├── holding_endurance.json
│   │   ├── nav_db.json           # Comprehensive waypoint coordinate data
│   │   └── terrain_db.json       # Elevation grid mapping coordinates to peak heights
│   ├── favicon.ico
│   ├── manifest.json             # PWA configuration
│   └── sw.js                     # Cache management service worker
├── src/
│   ├── components/
│   │   ├── AirportAutocomplete.js# Searchable autocompletion select input
│   │   ├── BriefFlight.js        # Flight briefing release layout (PDF print ready)
│   │   ├── CalculatorClimb.js    # Time, fuel & distance lookup queries
│   │   ├── CalculatorCruise.js   # Fuel flow & calibrated Mach computations
│   │   ├── CalculatorDescent.js  # TOD & VSI descent calculators
│   │   ├── CreateFlight.js       # Dispatch inputs, presets & ACARS brief parsing
│   │   ├── ErrorBoundary.js      # Tab-level crash isolation and restoration boundaries
│   │   ├── ReviewFuel.js         # Fuel setup & compliance reserves
│   │   ├── ReviewOei.js          # Driftdown simulator & mountain clearance tables
│   │   ├── ReviewOptimization.js # Cruising speed optimization
│   │   ├── ReviewRoute.js        # Leaflet 2D route map & vertical profile SVG
│   │   ├── ReviewWeather.js      # Meteorological METAR feeds & enroute turbulence layers
│   ├── context/
│   │   └── MissionContext.js     # Unified global mission state manager
│   ├── engine/
│   │   ├── atmospheric.js        # Cold temp corrections & standard ISA models
│   │   ├── dynamicModulators.js  # Cost Index speed correctors
│   │   ├── interpolation.js      # Multi-dimensional bilinear matrix solvers
│   │   ├── kinematics.js         # Haversine distance, bearings, and TOC/TOD solvers
│   │   └── thermodynamics.js     # Altimeter transition-level altitude correctors
│   ├── services/
│   │   ├── airportService.js     # Runway Wind calculators
│   │   ├── awcApi.js             # Aviation Weather Center METAR fetch client
│   │   ├── pdfExtractor.js       # Client-side PDF page parser
│   │   └── wsiParser.js          # Datalink/Navblue brief ingestion parser
│   ├── App.js                    # Shell wrapper, split view layout, and sidebar
│   ├── index.js                  # PWA bootstrap mount point
│   └── styles.css                # OLED colors, 44px targets, and CSS grids
├── tests/                        # Comprehensive unit testing suite
├── package.json
└── README.md
```

---

## Running Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` to run the active local EFB instance.

3. **Run Unit Tests**:
   ```bash
   npm run test
   ```
   Executes Vitest tests verifying core kinematics, interpolations, and ofp parsers.

4. **Compile Production Bundle**:
   ```bash
   npm run build
   ```
   Generates minified static assets in the `/dist` directory ready for deployment.
