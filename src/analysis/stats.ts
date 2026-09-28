export interface HistogramBin {
  start: number;
  end: number;
  count: number;
}

export interface SharedHistogramResult {
  binsA: HistogramBin[];
  binsB: HistogramBin[];
  min: number;
  max: number;
  binWidth: number;
}

/**
 * Calculates the arithmetic mean of an array of numbers.
 * Returns 0 for empty arrays without throwing.
 */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sum = xs.reduce((acc, val) => acc + val, 0);
  return sum / xs.length;
}

/**
 * Calculates a percentile q in [0, 1] using linear interpolation.
 * Returns 0 for empty arrays without throwing.
 */
export function percentile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  if (xs.length === 1) return xs[0];

  const clampedQ = Math.max(0, Math.min(1, q));
  const sorted = [...xs].sort((a, b) => a - b);
  const index = clampedQ * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = index - lower;
  return sorted[lower] + weight * (sorted[upper] - sorted[lower]);
}

/**
 * Calculates the median (50th percentile) using linear interpolation.
 * Returns 0 for empty arrays without throwing.
 */
export function median(xs: number[]): number {
  return percentile(xs, 0.5);
}

/**
 * Bins numbers into equal-width intervals over [min, max].
 * If all values are equal, returns a single bin.
 * Every value lands in exactly one bin; the sum of counts equals xs.length.
 * Returns [] for empty input without throwing.
 */
export function histogramBins(xs: number[], binCount: number = 10): HistogramBin[] {
  if (xs.length === 0) return [];
  if (binCount <= 0) binCount = 1;

  let min = xs[0];
  let max = xs[0];
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] < min) min = xs[i];
    if (xs[i] > max) max = xs[i];
  }

  // If all values are equal, return a single bin
  if (min === max) {
    return [{ start: min, end: max, count: xs.length }];
  }

  const binWidth = (max - min) / binCount;
  const bins: HistogramBin[] = new Array(binCount);

  for (let i = 0; i < binCount; i++) {
    bins[i] = {
      start: min + i * binWidth,
      end: min + (i + 1) * binWidth,
      count: 0,
    };
  }

  for (const x of xs) {
    let idx = Math.floor((x - min) / binWidth);
    if (idx >= binCount) {
      idx = binCount - 1;
    } else if (idx < 0) {
      idx = 0;
    }
    bins[idx].count++;
  }

  return bins;
}

/**
 * Bins two datasets across a shared, combined [min, max] range using identical bin edges.
 */
export function sharedHistogramBins(
  xsA: number[],
  xsB: number[],
  binCount: number = 10
): SharedHistogramResult {
  if (binCount <= 0) binCount = 1;
  const all = [...xsA, ...xsB];
  if (all.length === 0) {
    return { binsA: [], binsB: [], min: 0, max: 0, binWidth: 0 };
  }

  let min = all[0];
  let max = all[0];
  for (let i = 1; i < all.length; i++) {
    if (all[i] < min) min = all[i];
    if (all[i] > max) max = all[i];
  }

  if (min === max) {
    return {
      binsA: [{ start: min, end: max, count: xsA.length }],
      binsB: [{ start: min, end: max, count: xsB.length }],
      min,
      max,
      binWidth: 0,
    };
  }

  const binWidth = (max - min) / binCount;

  function binList(xs: number[]): HistogramBin[] {
    const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
      start: min + i * binWidth,
      end: min + (i + 1) * binWidth,
      count: 0,
    }));

    for (const x of xs) {
      let idx = Math.floor((x - min) / binWidth);
      if (idx >= binCount) {
        idx = binCount - 1;
      } else if (idx < 0) {
        idx = 0;
      }
      bins[idx].count++;
    }
    return bins;
  }

  return {
    binsA: binList(xsA),
    binsB: binList(xsB),
    min,
    max,
    binWidth,
  };
}
