# PathOptix

PathOptix is an offline-first performance look-up engine and tactical vertical profile optimizer tailored for the Embraer E195-E2 aircraft. It is designed to run locally on iPad Electronic Flight Bags (EFBs), ensuring complete access to critical aerodynamic, climbing, and emergency OEI (One Engine Inoperative) lookup matrices even under total satellite connectivity loss.

## Architecture

The project is structured as a Progressive Web Application (PWA):

- **Service Worker (`public/sw.js`)**: Employs a Cache-First strategy with network fallback, securing all static assets and lookup databases locally.
- **Flight Performance Lookup Engine (`src/engine/`)**: Handles interpolation and atmospheric models (ISA standards) to parse performance tables dynamically.
- **Optimizers & Calculators (`src/components/`)**: Features specialized modules for Ground, Cruise, Descent, and Emergency configurations.

## Scaffolding

```
├── public/
│   ├── data/
│   │   ├── climb_perf.json
│   │   ├── cruise_econ.json
│   │   ├── descent_fpa.json
│   │   ├── holding_endurance.json
│   │   └── driftdown_oei.json
│   ├── favicon.ico
│   ├── manifest.json
│   └── sw.js
├── src/
│   ├── components/
│   │   ├── CalculatorGround.js
│   │   ├── CalculatorCruise.js
│   │   ├── CalculatorDescent.js
│   │   └── EmergencySuite.js
│   ├── engine/
│   │   ├── interpolation.js
│   │   ├── atmospheric.js
│   │   └── dynamicModulators.js
│   ├── App.js
│   ├── index.js
│   └── styles.css
├── package.json
└── README.md
```

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```
