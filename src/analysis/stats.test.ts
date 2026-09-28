import { describe, it, expect } from 'vitest';
import { mean, median, percentile, histogramBins, sharedHistogramBins } from './stats';

describe('Stats Analysis', () => {
  it('handles empty input without throwing', () => {
    expect(mean([])).toBe(0);
    expect(median([])).toBe(0);
    expect(percentile([], 0.95)).toBe(0);
    expect(histogramBins([], 10)).toEqual([]);
  });

  it('calculates mean, median, and percentile on known small arrays', () => {
    const xs = [10, 20, 30, 40, 50];
    expect(mean(xs)).toBe(30);
    expect(median(xs)).toBe(30);
    expect(percentile(xs, 0)).toBe(10);
    expect(percentile(xs, 0.5)).toBe(30);
    expect(percentile(xs, 1)).toBe(50);
    expect(percentile(xs, 0.25)).toBe(20);
    expect(percentile(xs, 0.75)).toBe(40);

    const even = [10, 20, 30, 40];
    expect(mean(even)).toBe(25);
    expect(median(even)).toBe(25);
  });

  it('linear interpolation for percentile works correctly', () => {
    // 0 to 10 with 2 elements: [0, 10]
    // 0.3 should give 0 + 0.3 * (10 - 0) = 3
    expect(percentile([0, 10], 0.3)).toBeCloseTo(3, 5);
    expect(percentile([10, 30], 0.5)).toBe(20);
    expect(percentile([10, 30], 0.25)).toBe(15);
    expect(percentile([10, 30], 0.75)).toBe(25);
  });

  it('bin counts sum to length and every value lands in exactly one bin', () => {
    const data = [1, 5, 8, 12, 15, 23, 27, 30, 35, 42, 45, 50, 55, 60];
    const bins = histogramBins(data, 5);

    expect(bins.length).toBe(5);
    const totalCount = bins.reduce((sum, b) => sum + b.count, 0);
    expect(totalCount).toBe(data.length);
  });

  it('returns a single bin for all-equal input', () => {
    const allEqual = [25, 25, 25, 25, 25];
    const bins = histogramBins(allEqual, 10);

    expect(bins.length).toBe(1);
    expect(bins[0].start).toBe(25);
    expect(bins[0].end).toBe(25);
    expect(bins[0].count).toBe(5);
  });

  it('sharedHistogramBins creates identical bin edges spanning combined [min, max]', () => {
    const xsA = [10, 20, 30];
    const xsB = [25, 45, 60];
    const { binsA, binsB, min, max } = sharedHistogramBins(xsA, xsB, 5);

    expect(min).toBe(10);
    expect(max).toBe(60);
    expect(binsA.length).toBe(5);
    expect(binsB.length).toBe(5);

    // Sum of counts matches each input dataset
    expect(binsA.reduce((sum, b) => sum + b.count, 0)).toBe(xsA.length);
    expect(binsB.reduce((sum, b) => sum + b.count, 0)).toBe(xsB.length);

    // Bin edges are strictly identical
    for (let i = 0; i < 5; i++) {
      expect(binsA[i].start).toBeCloseTo(binsB[i].start);
      expect(binsA[i].end).toBeCloseTo(binsB[i].end);
    }
  });
});
