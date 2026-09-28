import { histogramBins, sharedHistogramBins } from './stats';

export interface HistogramRenderOptions {
  totals: number[];
  meanVal: number;
  p95Val: number;
  binCount?: number;
}

/**
 * Renders a histogram bar chart into an SVG element with axes, labels,
 * and vertical markers for mean and 95th percentile.
 */
export function renderHistogramSvg(
  svg: SVGSVGElement,
  options: HistogramRenderOptions
): void {
  svg.innerHTML = '';
  const { totals, meanVal, p95Val, binCount = 16 } = options;

  const width = 640;
  const height = 240;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  if (totals.length === 0) {
    const emptyText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    emptyText.setAttribute('x', String(width / 2));
    emptyText.setAttribute('y', String(height / 2));
    emptyText.setAttribute('text-anchor', 'middle');
    emptyText.setAttribute('fill', '#94a3b8');
    emptyText.setAttribute('font-size', '13');
    emptyText.textContent = 'No simulation data available';
    svg.appendChild(emptyText);
    return;
  }

  const margin = { top: 32, right: 30, bottom: 42, left: 54 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const bins = histogramBins(totals, binCount);
  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const minX = bins[0].start;
  const maxX = bins[bins.length - 1].end;
  const rangeX = maxX - minX > 0 ? maxX - minX : 1;

  // Background grid lines (3 horizontal lines)
  const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gridGroup.setAttribute('class', 'grid');
  for (let i = 0; i <= 3; i++) {
    const y = margin.top + (plotH / 3) * i;
    const countVal = Math.round(maxCount * (1 - i / 3));

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(margin.left));
    line.setAttribute('y1', String(y));
    line.setAttribute('x2', String(margin.left + plotW));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', '#1e293b');
    line.setAttribute('stroke-width', '1');
    gridGroup.appendChild(line);

    // Y tick label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(margin.left - 8));
    label.setAttribute('y', String(y + 4));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('fill', '#64748b');
    label.setAttribute('font-size', '10');
    label.textContent = String(countVal);
    gridGroup.appendChild(label);
  }
  svg.appendChild(gridGroup);

  // Bars
  const barsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  barsGroup.setAttribute('class', 'bars');

  const barSlotW = plotW / bins.length;
  const barGap = 2;
  const barW = Math.max(1, barSlotW - barGap);

  bins.forEach((bin, idx) => {
    const barH = (bin.count / maxCount) * plotH;
    const x = margin.left + idx * barSlotW + barGap / 2;
    const y = margin.top + plotH - barH;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(barW));
    rect.setAttribute('height', String(barH));
    rect.setAttribute('fill', '#38bdf8');
    rect.setAttribute('rx', '2');
    rect.setAttribute('opacity', '0.85');

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${Math.round(bin.start)}-${Math.round(bin.end)}m: ${bin.count} runs`;
    rect.appendChild(title);

    barsGroup.appendChild(rect);
  });
  svg.appendChild(barsGroup);

  // Axes lines
  const axesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  xAxis.setAttribute('x1', String(margin.left));
  xAxis.setAttribute('y1', String(margin.top + plotH));
  xAxis.setAttribute('x2', String(margin.left + plotW));
  xAxis.setAttribute('y2', String(margin.top + plotH));
  xAxis.setAttribute('stroke', '#475569');
  xAxis.setAttribute('stroke-width', '1.5');
  axesGroup.appendChild(xAxis);

  const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  yAxis.setAttribute('x1', String(margin.left));
  yAxis.setAttribute('y1', String(margin.top));
  yAxis.setAttribute('x2', String(margin.left));
  yAxis.setAttribute('y2', String(margin.top + plotH));
  yAxis.setAttribute('stroke', '#475569');
  yAxis.setAttribute('stroke-width', '1.5');
  axesGroup.appendChild(yAxis);

  // X ticks
  const xTicksCount = 4;
  for (let i = 0; i <= xTicksCount; i++) {
    const tickFrac = i / xTicksCount;
    const tickX = margin.left + tickFrac * plotW;
    const tickVal = Math.round(minX + tickFrac * (maxX - minX));

    const tickLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tickLine.setAttribute('x1', String(tickX));
    tickLine.setAttribute('y1', String(margin.top + plotH));
    tickLine.setAttribute('x2', String(tickX));
    tickLine.setAttribute('y2', String(margin.top + plotH + 5));
    tickLine.setAttribute('stroke', '#475569');
    axesGroup.appendChild(tickLine);

    const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tickLabel.setAttribute('x', String(tickX));
    tickLabel.setAttribute('y', String(margin.top + plotH + 16));
    tickLabel.setAttribute('text-anchor', 'middle');
    tickLabel.setAttribute('fill', '#94a3b8');
    tickLabel.setAttribute('font-size', '10');
    tickLabel.textContent = `${tickVal}m`;
    axesGroup.appendChild(tickLabel);
  }

  // Axis Labels
  // X axis label
  const xLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  xLabel.setAttribute('x', String(margin.left + plotW / 2));
  xLabel.setAttribute('y', String(height - 8));
  xLabel.setAttribute('text-anchor', 'middle');
  xLabel.setAttribute('fill', '#94a3b8');
  xLabel.setAttribute('font-size', '11');
  xLabel.setAttribute('font-weight', '600');
  xLabel.textContent = 'total network delay (min)';
  axesGroup.appendChild(xLabel);

  // Y axis label
  const yLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  yLabel.setAttribute('transform', `rotate(-90) translate(-${margin.top + plotH / 2}, 16)`);
  yLabel.setAttribute('text-anchor', 'middle');
  yLabel.setAttribute('fill', '#94a3b8');
  yLabel.setAttribute('font-size', '11');
  yLabel.setAttribute('font-weight', '600');
  yLabel.textContent = 'runs';
  axesGroup.appendChild(yLabel);

  svg.appendChild(axesGroup);

  // Vertical Marker helper
  function drawMarker(val: number, labelText: string, color: string, isAboveOffset: number) {
    const clampedVal = Math.max(minX, Math.min(maxX, val));
    const xPos = margin.left + ((clampedVal - minX) / rangeX) * plotW;

    const markerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    markerGroup.setAttribute('class', 'marker');

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(xPos));
    line.setAttribute('y1', String(margin.top));
    line.setAttribute('x2', String(xPos));
    line.setAttribute('y2', String(margin.top + plotH));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '4 3');
    markerGroup.appendChild(line);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(xPos));
    text.setAttribute('y', String(margin.top - 8 - isAboveOffset));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', color);
    text.setAttribute('font-size', '10');
    text.setAttribute('font-weight', '700');
    text.textContent = `${labelText}: ${val.toFixed(1)}m`;
    markerGroup.appendChild(text);

    svg.appendChild(markerGroup);
  }

  // Draw Mean and 95th Percentile markers
  // Check if they are very close to stagger their labels vertically
  const areClose = Math.abs(p95Val - meanVal) / rangeX < 0.12;
  drawMarker(meanVal, 'Mean', '#38bdf8', areClose ? 10 : 0);
  drawMarker(p95Val, '95th', '#f43f5e', 0);
}

export interface ComparisonHistogramRenderOptions {
  totalsA: number[];
  totalsB: number[];
  labelA?: string;
  labelB?: string;
  meanA: number;
  meanB: number;
  binCount?: number;
}

/**
 * Renders an overlaid comparison histogram into an SVG element with dual semi-transparent
 * bars sharing identical bin boundaries, shared X and Y axes, vertical mean markers, and legend.
 */
export function renderComparisonHistogramSvg(
  svg: SVGSVGElement,
  options: ComparisonHistogramRenderOptions
): void {
  svg.innerHTML = '';
  const {
    totalsA,
    totalsB,
    labelA = 'Run A',
    labelB = 'Run B',
    meanA,
    meanB,
    binCount = 16,
  } = options;

  const width = 640;
  const height = 250;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  if (totalsA.length === 0 && totalsB.length === 0) {
    const emptyText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    emptyText.setAttribute('x', String(width / 2));
    emptyText.setAttribute('y', String(height / 2));
    emptyText.setAttribute('text-anchor', 'middle');
    emptyText.setAttribute('fill', '#94a3b8');
    emptyText.setAttribute('font-size', '13');
    emptyText.textContent = 'No comparison data available';
    svg.appendChild(emptyText);
    return;
  }

  const margin = { top: 40, right: 30, bottom: 42, left: 54 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const shared = sharedHistogramBins(totalsA, totalsB, binCount);
  const maxCountA = Math.max(0, ...shared.binsA.map((b) => b.count));
  const maxCountB = Math.max(0, ...shared.binsB.map((b) => b.count));
  const maxCount = Math.max(maxCountA, maxCountB, 1);

  const minX = shared.min;
  const maxX = shared.max;
  const rangeX = maxX - minX > 0 ? maxX - minX : 1;

  // Background grid lines (3 horizontal lines)
  const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  gridGroup.setAttribute('class', 'grid');
  for (let i = 0; i <= 3; i++) {
    const y = margin.top + (plotH / 3) * i;
    const countVal = Math.round(maxCount * (1 - i / 3));

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(margin.left));
    line.setAttribute('y1', String(y));
    line.setAttribute('x2', String(margin.left + plotW));
    line.setAttribute('y2', String(y));
    line.setAttribute('stroke', '#1e293b');
    line.setAttribute('stroke-width', '1');
    gridGroup.appendChild(line);

    // Y tick label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(margin.left - 8));
    label.setAttribute('y', String(y + 4));
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('fill', '#64748b');
    label.setAttribute('font-size', '10');
    label.textContent = String(countVal);
    gridGroup.appendChild(label);
  }
  svg.appendChild(gridGroup);

  // Group for bars
  const barsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  barsGroup.setAttribute('class', 'comparison-bars');

  const numBins = shared.binsA.length;
  const barSlotW = plotW / Math.max(1, numBins);
  const barGap = 2;
  const barW = Math.max(1, barSlotW - barGap);

  for (let i = 0; i < numBins; i++) {
    const binA = shared.binsA[i];
    const binB = shared.binsB[i];
    const x = margin.left + i * barSlotW + barGap / 2;

    // Bar A (Cyan, 60% opacity)
    if (binA && binA.count > 0) {
      const barHA = (binA.count / maxCount) * plotH;
      const yA = margin.top + plotH - barHA;

      const rectA = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rectA.setAttribute('x', String(x));
      rectA.setAttribute('y', String(yA));
      rectA.setAttribute('width', String(barW));
      rectA.setAttribute('height', String(barHA));
      rectA.setAttribute('fill', '#38bdf8');
      rectA.setAttribute('fill-opacity', '0.6');
      rectA.setAttribute('rx', '1');

      const titleA = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      titleA.textContent = `${labelA}: ${binA.count} runs (${Math.round(binA.start)}-${Math.round(binA.end)}m)`;
      rectA.appendChild(titleA);

      barsGroup.appendChild(rectA);
    }

    // Bar B (Amber, 60% opacity)
    if (binB && binB.count > 0) {
      const barHB = (binB.count / maxCount) * plotH;
      const yB = margin.top + plotH - barHB;

      const rectB = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rectB.setAttribute('x', String(x));
      rectB.setAttribute('y', String(yB));
      rectB.setAttribute('width', String(barW));
      rectB.setAttribute('height', String(barHB));
      rectB.setAttribute('fill', '#f59e0b');
      rectB.setAttribute('fill-opacity', '0.6');
      rectB.setAttribute('rx', '1');

      const titleB = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      titleB.textContent = `${labelB}: ${binB.count} runs (${Math.round(binB.start)}-${Math.round(binB.end)}m)`;
      rectB.appendChild(titleB);

      barsGroup.appendChild(rectB);
    }
  }
  svg.appendChild(barsGroup);

  // Axes lines
  const axesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  xAxis.setAttribute('x1', String(margin.left));
  xAxis.setAttribute('y1', String(margin.top + plotH));
  xAxis.setAttribute('x2', String(margin.left + plotW));
  xAxis.setAttribute('y2', String(margin.top + plotH));
  xAxis.setAttribute('stroke', '#475569');
  xAxis.setAttribute('stroke-width', '1.5');
  axesGroup.appendChild(xAxis);

  const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  yAxis.setAttribute('x1', String(margin.left));
  yAxis.setAttribute('y1', String(margin.top));
  yAxis.setAttribute('x2', String(margin.left));
  yAxis.setAttribute('y2', String(margin.top + plotH));
  yAxis.setAttribute('stroke', '#475569');
  yAxis.setAttribute('stroke-width', '1.5');
  axesGroup.appendChild(yAxis);

  // X ticks
  const xTicksCount = 4;
  for (let i = 0; i <= xTicksCount; i++) {
    const tickFrac = i / xTicksCount;
    const tickX = margin.left + tickFrac * plotW;
    const tickVal = Math.round(minX + tickFrac * (maxX - minX));

    const tickLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tickLine.setAttribute('x1', String(tickX));
    tickLine.setAttribute('y1', String(margin.top + plotH));
    tickLine.setAttribute('x2', String(tickX));
    tickLine.setAttribute('y2', String(margin.top + plotH + 5));
    tickLine.setAttribute('stroke', '#475569');
    axesGroup.appendChild(tickLine);

    const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tickLabel.setAttribute('x', String(tickX));
    tickLabel.setAttribute('y', String(margin.top + plotH + 16));
    tickLabel.setAttribute('text-anchor', 'middle');
    tickLabel.setAttribute('fill', '#94a3b8');
    tickLabel.setAttribute('font-size', '10');
    tickLabel.textContent = `${tickVal}m`;
    axesGroup.appendChild(tickLabel);
  }

  // Axis Labels
  const xLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  xLabel.setAttribute('x', String(margin.left + plotW / 2));
  xLabel.setAttribute('y', String(height - 8));
  xLabel.setAttribute('text-anchor', 'middle');
  xLabel.setAttribute('fill', '#94a3b8');
  xLabel.setAttribute('font-size', '11');
  xLabel.setAttribute('font-weight', '600');
  xLabel.textContent = 'total network delay (min)';
  axesGroup.appendChild(xLabel);

  const yLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  yLabel.setAttribute('transform', `rotate(-90) translate(-${margin.top + plotH / 2}, 16)`);
  yLabel.setAttribute('text-anchor', 'middle');
  yLabel.setAttribute('fill', '#94a3b8');
  yLabel.setAttribute('font-size', '11');
  yLabel.setAttribute('font-weight', '600');
  yLabel.textContent = 'runs';
  axesGroup.appendChild(yLabel);

  svg.appendChild(axesGroup);

  // Mean Markers
  function drawMeanLine(val: number, labelText: string, color: string, isAboveOffset: number) {
    const clampedVal = Math.max(minX, Math.min(maxX, val));
    const xPos = margin.left + ((clampedVal - minX) / rangeX) * plotW;

    const markerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    markerGroup.setAttribute('class', 'mean-marker');

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(xPos));
    line.setAttribute('y1', String(margin.top));
    line.setAttribute('x2', String(xPos));
    line.setAttribute('y2', String(margin.top + plotH));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-dasharray', '4 3');
    markerGroup.appendChild(line);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', String(xPos));
    text.setAttribute('y', String(margin.top - 8 - isAboveOffset));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', color);
    text.setAttribute('font-size', '10');
    text.setAttribute('font-weight', '700');
    text.textContent = `${labelText}: ${val.toFixed(1)}m`;
    markerGroup.appendChild(text);

    svg.appendChild(markerGroup);
  }

  const meansClose = Math.abs(meanA - meanB) / rangeX < 0.12;
  drawMeanLine(meanA, `${labelA} Mean`, '#38bdf8', meansClose ? 10 : 0);
  drawMeanLine(meanB, `${labelB} Mean`, '#f59e0b', 0);

  // Top Legend
  const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  legendGroup.setAttribute('transform', `translate(${width - 190}, 14)`);

  legendGroup.innerHTML = `
    <rect x="0" y="0" width="10" height="10" rx="2" fill="#38bdf8" fill-opacity="0.8"/>
    <text x="14" y="9" fill="#94a3b8" font-size="10">${labelA}</text>
    <rect x="80" y="0" width="10" height="10" rx="2" fill="#f59e0b" fill-opacity="0.8"/>
    <text x="94" y="9" fill="#94a3b8" font-size="10">${labelB}</text>
  `;
  svg.appendChild(legendGroup);
}

