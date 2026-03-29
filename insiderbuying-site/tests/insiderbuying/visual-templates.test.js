'use strict';
const vt = require('../../n8n/code/insiderbuying/visual-templates.js');

describe('visual-templates stubs', () => {
  test('generateInsiderTable returns null', () => {
    expect(vt.generateInsiderTable([])).toBeNull();
  });
  test('generatePriceChart returns null', () => {
    expect(vt.generatePriceChart('AAPL', {})).toBeNull();
  });
  test('generatePeerRadar returns null', () => {
    expect(vt.generatePeerRadar('AAPL', [])).toBeNull();
  });
  test('all three accept undefined args without throwing', () => {
    expect(() => vt.generateInsiderTable(undefined)).not.toThrow();
    expect(() => vt.generatePriceChart(undefined, undefined)).not.toThrow();
    expect(() => vt.generatePeerRadar(undefined, undefined)).not.toThrow();
  });
});
