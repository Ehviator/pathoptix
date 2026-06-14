import { describe, it, expect } from 'vitest';
import { parseWsiBrief } from '../src/services/wsiParser.js';

describe('Porter Navblue OFP Parser Tests', () => {
  it('should parse the standard ACARS datalink block format', () => {
    const acarsBlock = `
CYOW / CYYT / CYDF / POE297 / 16029
CYOW BORD4 TEB Q907 CYYT
1666 / 400 / 2665 / FL310 / 279@47 / 97P / 26.0 / P04 ISA / 101758 LBS / CI055
    `;
    const result = parseWsiBrief(acarsBlock);

    expect(result.departure).toBe('CYOW');
    expect(result.arrival).toBe('CYYT');
    expect(result.alternate).toBe('CYDF');
    expect(result.flightNumber).toBe('POE297');
    expect(result.routeString).toBe('CYOW BORD4 TEB Q907 CYYT');
    expect(result.finalReserveFuel).toBe(1666);
    expect(result.taxiFuel).toBe(400);
    expect(result.alternateFuel).toBe(2665);
    expect(result.cruiseFL).toBe(310);
    expect(result.averageWindDir).toBe(279);
    expect(result.averageWindSpeed).toBe(47);
    expect(result.wind).toBe(47);
    expect(result.pax).toBe(97);
    expect(result.mac).toBe(26.0);
    expect(result.isaDev).toBe(4);
    expect(result.zeroFuelWeight).toBe(101758);
    expect(result.costIndex).toBe(55);
  });

  it('should parse a full copy-pasted Navblue Porter Airlines OFP', () => {
    const navblueOFP = `
OFP 1 - CO-ROUTE CYOWCYYT - FUEL BIAS 1.000
FLIGHT POE297 / CYOW TO CYYT
AIRCRAFT C-GELU (E195-E2 PW1922G-A)
REG: C-GELU
DISP RELEASE
FLT POE297   DEP CYOW/07 ARR CYYT/11 ALTN CYDF/23

ZFW 101758  TOW 125000  LW 112000

FUEL SUMMARY:
TAXI      400
TRIP    15600
CONT 5%   780
ALTN     2665
HOLD     1800
RESV     1666
BLOCK   22851

ROUTE:
CYOW BORD4 TEB
Q907 CYYT

CI 55

WIND/TEMP INFO:
FL310 279/047 P04
FL350 280/050 M12
    `;

    const result = parseWsiBrief(navblueOFP);

    expect(result.departure).toBe('CYOW');
    expect(result.arrival).toBe('CYYT');
    expect(result.alternate).toBe('CYDF');
    expect(result.flightNumber).toBe('POE297');
    expect(result.registration).toBe('C-GELU');
    expect(result.zeroFuelWeight).toBe(101758);
    expect(result.blockFuel).toBe(22851);
    expect(result.taxiFuel).toBe(400);
    expect(result.plannedFuelBurn).toBe(15600);
    expect(result.alternateFuel).toBe(2665);
    expect(result.finalReserveFuel).toBe(1666);
    expect(result.routeString).toBe('CYOW BORD4 TEB Q907 CYYT');
    expect(result.costIndex).toBe(55);
    expect(result.averageWindDir).toBe(279);
    expect(result.averageWindSpeed).toBe(47);
    expect(result.isaDev).toBe(4);
  });

  it('should handle missing fields and return what is available', () => {
    const incompleteText = `
FLT POE297
DEP CYOW
ARR CYYT
BLOCK 12000
    `;
    const result = parseWsiBrief(incompleteText);

    expect(result.flightNumber).toBe('POE297');
    expect(result.departure).toBe('CYOW');
    expect(result.arrival).toBe('CYYT');
    expect(result.blockFuel).toBe(12000);
    expect(result.alternate).toBeUndefined();
  });

  it('should parse numbers formatted with commas and robust route lookaheads', () => {
    const ofpWithCommasAndWinds = `
FLIGHT POE297 / CYOW TO CYYT
ZFW 101,758  TOW 125,000
FUEL SUMMARY:
TAXI      400
TRIP    15,600
ALTN     2,665
RESV     1,666
BLOCK   22,851
ROUTE:
CYOW BORD4 TEB Q907 CYYT
WIND/TEMP INFO:
FL310 279/047 P04
    `;

    const result = parseWsiBrief(ofpWithCommasAndWinds);
    expect(result.zeroFuelWeight).toBe(101758);
    expect(result.blockFuel).toBe(22851);
    expect(result.plannedFuelBurn).toBe(15600);
    expect(result.alternateFuel).toBe(2665);
    expect(result.finalReserveFuel).toBe(1666);
    expect(result.routeString).toBe('CYOW BORD4 TEB Q907 CYYT');
  });

  it('should not false-match FLIGHT PLAN, DEP TIME, and ROUTE BRIEFING section headers', () => {
    const ofpWithHeaders = `
FLIGHT PLAN BRIEFING RELEASE - FUEL BIAS 1.000
CO-ROUTE CYOWCYYT
FLIGHT POE297 / CYOW TO CYYT
DEP TIME 1500
FLT POE297   DEP CYOW/07 ARR CYYT/11 ALTN CYDF/23
ROUTE BRIEFING / CHARTS
ROUTE:
CYOW BORD4 TEB Q907 CYYT
WIND/TEMP INFO:
FL310 279/047 P04
    `;

    const result = parseWsiBrief(ofpWithHeaders);
    expect(result.flightNumber).toBe('POE297');
    expect(result.departure).toBe('CYOW');
    expect(result.arrival).toBe('CYYT');
    expect(result.alternate).toBe('CYDF');
    expect(result.routeString).toBe('CYOW BORD4 TEB Q907 CYYT');
  });

  it('should parse and extract NavLog waypoints correctly from the main nav log', () => {
    const fullOfp = `
MAIN NAV LOG
-----------------------------------------------------------------------------------
WPT FL WIND IAS SAT TRP DIST HDG TIME ETA BURN PFREM TRQ%
 TAS/GS DEV SHR DTGO TRK TTREM ATA MDIV AFREM
TAKOL CLB 277/026 CLB CLB CLB 0028 054 00.05 .... 00852 15748
 308/324 CLB 1 0958 058 01.59 .... 12777 .....
-KZBW 310 284/044 .79 M42 400 0138 090 00.17 .... 01235 13233
 468/507 P04 2 0736 091 01.31 .... 10262 .....
CYYT DSC 271/049 DSC DSC DSC 0016 263 00.04 .... 00131 07303
 271/232 DSC 3 0000 215 00.00 .... 04331 .....
-----------------------------------------------------------------------------------
POINT FL330 FL350
    `;

    const result = parseWsiBrief(fullOfp);
    expect(result.navLogCustomData).toBeDefined();
    expect(result.navLogCustomData.length).toBe(3);

    // TAKOL
    expect(result.navLogCustomData[0].ident).toBe('TAKOL');
    expect(result.navLogCustomData[0].fl).toBe(350);
    expect(result.navLogCustomData[0].wind).toBe(16);
    expect(result.navLogCustomData[0].sat).toBe(-45);
    expect(result.navLogCustomData[0].plannedFuel).toBe(15748);

    // KZBW
    expect(result.navLogCustomData[1].ident).toBe('KZBW');
    expect(result.navLogCustomData[1].fl).toBe(310);
    expect(result.navLogCustomData[1].wind).toBe(39);
    expect(result.navLogCustomData[1].sat).toBe(-42);
    expect(result.navLogCustomData[1].plannedFuel).toBe(13233);

    // CYYT
    expect(result.navLogCustomData[2].ident).toBe('CYYT');
    expect(result.navLogCustomData[2].wind).toBe(-39);
    expect(result.navLogCustomData[2].plannedFuel).toBe(7303);
  });

  it('should parse planned ETE correctly from different OFP layout formats', () => {
    const textWithEte = `
      DEP CYOW ARR CYYT
      BURN  CYYT  09297 0204  OEW  081505  CAPABILITY
      ETE  0204
    `;
    const result = parseWsiBrief(textWithEte);
    expect(result.plannedEte).toBe(124); // 2 hours 4 minutes = 124 minutes

    const textWithFplEte = `
      DEP CYOW ARR CYYT
      -CYOW1800
      -N0468F310 TAKOL Q941 ESTEL DCT MIILS Q907 MIVAD AVALN5
      -CYYT0204 CYDF
    `;
    const resultFpl = parseWsiBrief(textWithFplEte);
    expect(resultFpl.plannedEte).toBe(124);
  });

  it('should return null or empty object for empty input', () => {
    expect(parseWsiBrief(null)).toBeNull();
    expect(parseWsiBrief('')).toBeNull();
  });
});
