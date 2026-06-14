import { describe, it, expect } from 'vitest';

// Formulas to be tested
function getContingencyFuel(tripFuel) {
  return Math.round(tripFuel * 0.05);
}

function getAlternateFuel(distance) {
  return distance > 0 ? Math.round(distance * 12.5 + 400) : 0;
}

function getFinalReserveFuel(takeoffWeight) {
  return Math.round(1150 + 0.005 * takeoffWeight);
}

function getRequiredBlockFuel(taxi, trip, contingency, alternate, reserve) {
  return taxi + trip + contingency + alternate + reserve;
}

describe('CARs 705 Fuel Legality Calculations', () => {
  it('should calculate contingency fuel as 5% of trip fuel', () => {
    expect(getContingencyFuel(10000)).toBe(500);
    expect(getContingencyFuel(15600)).toBe(780);
    expect(getContingencyFuel(0)).toBe(0);
  });

  it('should calculate alternate fuel based on great-circle distance', () => {
    expect(getAlternateFuel(0)).toBe(0);
    expect(getAlternateFuel(152)).toBe(2300); // 152 * 12.5 + 400 = 1900 + 400 = 2300
    expect(getAlternateFuel(80)).toBe(1400); // 80 * 12.5 + 400 = 1000 + 400 = 1400
  });

  it('should calculate final reserve fuel (30-min hold) based on aircraft weight', () => {
    expect(getFinalReserveFuel(100000)).toBe(1650); // 1150 + 500 = 1650
    expect(getFinalReserveFuel(136200)).toBe(1831); // 1150 + 681 = 1831
    expect(getFinalReserveFuel(85000)).toBe(1575); // 1150 + 425 = 1575
  });

  it('should sum all segments to calculate required block fuel', () => {
    const taxi = 400;
    const trip = 15600;
    const contingency = getContingencyFuel(trip); // 780
    const alternate = getAlternateFuel(152); // 2300
    const reserve = getFinalReserveFuel(125000); // 1150 + 625 = 1775
    
    const requiredBlock = getRequiredBlockFuel(taxi, trip, contingency, alternate, reserve);
    expect(requiredBlock).toBe(20855); // 400 + 15600 + 780 + 2300 + 1775 = 20855
  });
});
