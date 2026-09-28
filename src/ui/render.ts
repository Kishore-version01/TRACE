import { Network, Node } from '../engine/types';
import { NETWORK_LAYOUT } from './layout';

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpRgb(rgb1: [number, number, number], rgb2: [number, number, number], t: number): string {
  const r = lerp(rgb1[0], rgb2[0], t);
  const g = lerp(rgb1[1], rgb2[1], t);
  const b = lerp(rgb1[2], rgb2[2], t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Smoothly interpolates node fill color based on delay in minutes:
 * 0 min: green, 1-5: yellow-green, 6-15: amber, 16+: red.
 */
export function getNodeDelayColor(minutes: number): string {
  if (minutes <= 0) {
    return 'rgb(34, 197, 94)'; // green
  }

  const green: [number, number, number] = [34, 197, 94];
  const yellowGreen: [number, number, number] = [132, 204, 22]; // lime/yellow-green
  const amber: [number, number, number] = [245, 158, 11]; // amber
  const red: [number, number, number] = [239, 68, 68]; // red

  if (minutes <= 5) {
    const t = minutes / 5;
    return lerpRgb(green, yellowGreen, t);
  } else if (minutes <= 15) {
    const t = (minutes - 5) / 10;
    return lerpRgb(yellowGreen, amber, t);
  } else {
    const t = Math.min(1, (minutes - 15) / 15);
    return lerpRgb(amber, red, t);
  }
}

/**
 * Interpolates color for hit rate in [0, 1]:
 * 0 = dark neutral (#1e293b) -> 0.5 = amber -> 1.0 = red (#ef4444).
 */
export function getHeatmapColor(rate: number): string {
  const dark: [number, number, number] = [30, 41, 59];
  const amber: [number, number, number] = [245, 158, 11];
  const red: [number, number, number] = [239, 68, 68];

  const clamped = Math.max(0, Math.min(1, rate));
  if (clamped <= 0.5) {
    return lerpRgb(dark, amber, clamped * 2);
  } else {
    return lerpRgb(amber, red, (clamped - 0.5) * 2);
  }
}

export interface NetworkRenderer {
  setNodeDelay(id: string, minutes: number): void;
  reset(): void;
  setSelectedNode(id: string | null): void;
  highlightEdge(from: string, to: string): void;
  clearEdgeHighlights(): void;
  applyHeatmap(hitRates: Record<string, number>): void;
  clearHeatmap(): void;
  applyCriticalityRings(results: { nodeId: string; meanTotal: number }[]): void;
  clearCriticalityRings(): void;
  setSelectedEdge(from: string | null, to: string | null): void;
  updateNetwork(network: Network): void;
}

export function createNetworkRenderer(
  svg: SVGSVGElement,
  initialNetwork: Network,
  onNodeClick: (nodeId: string) => void,
  onEdgeClick?: (from: string, to: string) => void
): NetworkRenderer {
  let currentNetwork = initialNetwork;
  let selectedNodeId: string | null = null;
  let selectedEdgeKey: string | null = null;
  let currentHitRates: Record<string, number> | null = null;

  const nodeMap = new Map<string, Node>();
  const edgeElements = new Map<string, SVGLineElement>();
  const nodeCircles = new Map<string, SVGCircleElement>();
  const nodeDelayBadges = new Map<string, SVGGElement>();
  const nodeDelayTexts = new Map<string, SVGTextElement>();
  const nodeTooltips = new Map<string, SVGTitleElement>();

  let selectionRing: SVGCircleElement;
  let criticalityGroup: SVGGElement;
  let heatmapLegend: SVGGElement;

  function renderAll() {
    svg.innerHTML = '';
    svg.setAttribute('viewBox', '0 0 1000 600');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    nodeMap.clear();
    edgeElements.clear();
    nodeCircles.clear();
    nodeDelayBadges.clear();
    nodeDelayTexts.clear();
    nodeTooltips.clear();

    for (const n of currentNetwork.nodes) {
      nodeMap.set(n.id, n);
    }

    // SVG Definitions for arrowheads
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#475569" />
      </marker>
      <marker id="arrow-active" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f43f5e" />
      </marker>
      <marker id="arrow-selected" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#a855f7" />
      </marker>
    `;
    svg.appendChild(defs);

    // Group for edges
    const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    edgesGroup.setAttribute('class', 'network-edges');
    svg.appendChild(edgesGroup);

    // Render edges with directional offset
    for (const edge of currentNetwork.edges) {
      const p1 = NETWORK_LAYOUT[edge.from];
      const p2 = NETWORK_LAYOUT[edge.to];
      if (!p1 || !p2) continue;

      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      const rFrom = fromNode?.kind === 'junction' ? 25 : 18;
      const rTo = toNode?.kind === 'junction' ? 25 : 18;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) continue;

      const ux = dx / dist;
      const uy = dy / dist;
      const nx = -uy;
      const ny = ux;

      const offset = 5;
      const x1 = p1.x + nx * offset + ux * (rFrom + 2);
      const y1 = p1.y + ny * offset + uy * (rFrom + 2);
      const x2 = p2.x + nx * offset - ux * (rTo + 6);
      const y2 = p2.y + ny * offset - uy * (rTo + 6);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('stroke', '#475569');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', 'url(#arrow)');
      line.setAttribute('data-from', edge.from);
      line.setAttribute('data-to', edge.to);
      line.style.cursor = onEdgeClick ? 'pointer' : 'default';

      if (onEdgeClick) {
        line.addEventListener('click', (e) => {
          e.stopPropagation();
          onEdgeClick(edge.from, edge.to);
        });
      }

      edgesGroup.appendChild(line);
      edgeElements.set(`${edge.from}->${edge.to}`, line);
    }

    // Group for criticality highlight rings
    criticalityGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    criticalityGroup.setAttribute('class', 'criticality-rings');
    svg.appendChild(criticalityGroup);

    // Group for selection ring
    const selectionGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    selectionRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    selectionRing.setAttribute('class', 'selection-ring');
    selectionRing.setAttribute('fill', 'none');
    selectionRing.setAttribute('stroke', '#38bdf8');
    selectionRing.setAttribute('stroke-width', '3');
    selectionRing.setAttribute('stroke-dasharray', '5 3');
    selectionRing.style.display = 'none';
    selectionGroup.appendChild(selectionRing);
    svg.appendChild(selectionGroup);

    // Group for nodes
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    nodesGroup.setAttribute('class', 'network-nodes');
    svg.appendChild(nodesGroup);

    for (const node of currentNetwork.nodes) {
      const pos = NETWORK_LAYOUT[node.id];
      if (!pos) continue;

      const isJunction = node.kind === 'junction';
      const radius = isJunction ? 25 : 18;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `node-group node-${node.id}`);
      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => onNodeClick(node.id));

      // Tooltip title
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${node.name} (${node.id})`;
      g.appendChild(title);
      nodeTooltips.set(node.id, title);

      // Outer circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', String(radius));
      circle.setAttribute('fill', getNodeDelayColor(0));
      circle.setAttribute('stroke', isJunction ? '#f8fafc' : '#0f172a');
      circle.setAttribute('stroke-width', isJunction ? '2.5' : '2');
      g.appendChild(circle);
      nodeCircles.set(node.id, circle);

      // Node ID text inside circle
      const idText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      idText.setAttribute('text-anchor', 'middle');
      idText.setAttribute('dominant-baseline', 'central');
      idText.setAttribute('fill', '#0f172a');
      idText.setAttribute('font-weight', '700');
      idText.setAttribute('font-size', isJunction ? '13' : '11');
      idText.textContent = node.id;
      g.appendChild(idText);

      // Node name label outside circle
      const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      nameText.setAttribute('text-anchor', 'middle');
      const labelY = pos.y > 350 ? radius + 15 : -(radius + 8);
      nameText.setAttribute('y', String(labelY));
      nameText.setAttribute('fill', '#94a3b8');
      nameText.setAttribute('font-size', '11');
      nameText.setAttribute('font-weight', isJunction ? '600' : '400');
      nameText.textContent = node.name;
      g.appendChild(nameText);

      // Badge (for delays or hit rates)
      const badgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const badgeY = pos.y > 350 ? -(radius + 18) : radius + 8;
      badgeGroup.setAttribute('transform', `translate(0, ${badgeY})`);
      badgeGroup.style.display = 'none';

      const badgeRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      badgeRect.setAttribute('x', '-22');
      badgeRect.setAttribute('y', '-9');
      badgeRect.setAttribute('width', '44');
      badgeRect.setAttribute('height', '18');
      badgeRect.setAttribute('rx', '4');
      badgeRect.setAttribute('fill', '#0f172a');
      badgeRect.setAttribute('stroke', '#ef4444');
      badgeRect.setAttribute('stroke-width', '1.5');
      badgeGroup.appendChild(badgeRect);

      const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      badgeText.setAttribute('text-anchor', 'middle');
      badgeText.setAttribute('dominant-baseline', 'central');
      badgeText.setAttribute('fill', '#fca5a5');
      badgeText.setAttribute('font-size', '10');
      badgeText.setAttribute('font-weight', '700');
      badgeGroup.appendChild(badgeText);

      g.appendChild(badgeGroup);
      nodeDelayBadges.set(node.id, badgeGroup);
      nodeDelayTexts.set(node.id, badgeText);

      nodesGroup.appendChild(g);
    }

    // Heatmap Legend in SVG
    heatmapLegend = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    heatmapLegend.setAttribute('class', 'heatmap-legend');
    heatmapLegend.setAttribute('transform', 'translate(760, 20)');
    heatmapLegend.style.display = 'none';

    heatmapLegend.innerHTML = `
      <rect x="0" y="0" width="210" height="42" rx="4" fill="#090d16" stroke="#27354f" stroke-width="1"/>
      <text x="10" y="16" fill="#94a3b8" font-size="10" font-weight="600">HIT RATE HEATMAP</text>
      <rect x="10" y="24" width="60" height="8" rx="2" fill="#1e293b"/>
      <rect x="74" y="24" width="60" height="8" rx="2" fill="#f59e0b"/>
      <rect x="138" y="24" width="60" height="8" rx="2" fill="#ef4444"/>
      <text x="10" y="39" fill="#64748b" font-size="9">0%</text>
      <text x="104" y="39" fill="#64748b" font-size="9" text-anchor="middle">50%</text>
      <text x="198" y="39" fill="#64748b" font-size="9" text-anchor="end">100%</text>
    `;
    svg.appendChild(heatmapLegend);

    if (selectedNodeId) {
      setSelectedNode(selectedNodeId);
    }
  }

  renderAll();

  function setNodeDelay(id: string, minutes: number): void {
    const circle = nodeCircles.get(id);
    if (circle) {
      circle.setAttribute('fill', getNodeDelayColor(minutes));
    }
    const badge = nodeDelayBadges.get(id);
    const badgeText = nodeDelayTexts.get(id);
    if (badge && badgeText) {
      if (minutes >= 1) {
        badge.style.display = '';
        badgeText.textContent = `${Math.round(minutes)}m`;
      } else {
        badge.style.display = 'none';
        badgeText.textContent = '';
      }
    }
  }

  function reset(): void {
    currentHitRates = null;
    if (heatmapLegend) {
      heatmapLegend.style.display = 'none';
    }
    for (const node of currentNetwork.nodes) {
      setNodeDelay(node.id, 0);
      const title = nodeTooltips.get(node.id);
      if (title) {
        title.textContent = `${node.name} (${node.id})`;
      }
    }
    clearEdgeHighlights();
  }

  function setSelectedNode(id: string | null): void {
    selectedNodeId = id;
    if (!id || !selectionRing) {
      if (selectionRing) selectionRing.style.display = 'none';
      return;
    }
    const pos = NETWORK_LAYOUT[id];
    const node = nodeMap.get(id);
    if (!pos || !node) {
      selectionRing.style.display = 'none';
      return;
    }
    const radius = node.kind === 'junction' ? 25 : 18;
    selectionRing.setAttribute('cx', String(pos.x));
    selectionRing.setAttribute('cy', String(pos.y));
    selectionRing.setAttribute('r', String(radius + 7));
    selectionRing.style.display = '';
  }

  function highlightEdge(from: string, to: string): void {
    const key = `${from}->${to}`;
    const line = edgeElements.get(key);
    if (line) {
      line.setAttribute('stroke', '#f43f5e');
      line.setAttribute('stroke-width', '3.5');
      line.setAttribute('marker-end', 'url(#arrow-active)');
    }
  }

  function clearEdgeHighlights(): void {
    for (const line of edgeElements.values()) {
      line.setAttribute('stroke', '#475569');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', 'url(#arrow)');
    }
  }

  function applyHeatmap(hitRates: Record<string, number>): void {
    currentHitRates = hitRates;
    if (heatmapLegend) {
      heatmapLegend.style.display = '';
    }
    clearEdgeHighlights();

    for (const node of currentNetwork.nodes) {
      const rate = hitRates[node.id] ?? 0;
      const color = getHeatmapColor(rate);
      const circle = nodeCircles.get(node.id);
      if (circle) {
        circle.setAttribute('fill', color);
      }

      const percent = Math.round(rate * 100);
      const badge = nodeDelayBadges.get(node.id);
      const badgeText = nodeDelayTexts.get(node.id);
      if (badge && badgeText) {
        badge.style.display = '';
        badgeText.textContent = `${percent}%`;
      }

      const title = nodeTooltips.get(node.id);
      if (title) {
        title.textContent = `${node.name} (${node.id}) - Hit Rate: ${(rate * 100).toFixed(1)}%`;
      }
    }
  }

  function clearHeatmap(): void {
    reset();
    if (selectedNodeId) {
      setSelectedNode(selectedNodeId);
    }
  }

  function applyCriticalityRings(results: { nodeId: string; meanTotal: number }[]): void {
    if (!criticalityGroup) return;
    criticalityGroup.innerHTML = '';
    const maxMean = Math.max(1, ...results.map((r) => r.meanTotal));

    for (const res of results) {
      const pos = NETWORK_LAYOUT[res.nodeId];
      const node = nodeMap.get(res.nodeId);
      if (!pos || !node) continue;

      const baseR = node.kind === 'junction' ? 25 : 18;
      // Scale extra ring radius proportional to meanTotal
      const extraR = (res.meanTotal / maxMean) * 22;
      const ringRadius = baseR + 5 + extraR;

      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', String(pos.x));
      ring.setAttribute('cy', String(pos.y));
      ring.setAttribute('r', String(ringRadius));
      ring.setAttribute('fill', 'rgba(244, 63, 94, 0.16)');
      ring.setAttribute('stroke', '#f43f5e');
      ring.setAttribute('stroke-width', '2.5');
      ring.setAttribute('stroke-dasharray', '5 3');
      ring.style.pointerEvents = 'none';

      criticalityGroup.appendChild(ring);
    }
  }

  function clearCriticalityRings(): void {
    if (criticalityGroup) {
      criticalityGroup.innerHTML = '';
    }
  }

  function setSelectedEdge(from: string | null, to: string | null): void {
    if (selectedEdgeKey) {
      const prevLine = edgeElements.get(selectedEdgeKey);
      if (prevLine) {
        prevLine.setAttribute('stroke', '#475569');
        prevLine.setAttribute('stroke-width', '2');
        prevLine.setAttribute('marker-end', 'url(#arrow)');
      }
    }

    if (!from || !to) {
      selectedEdgeKey = null;
      return;
    }

    selectedEdgeKey = `${from}->${to}`;
    const line = edgeElements.get(selectedEdgeKey);
    if (line) {
      line.setAttribute('stroke', '#a855f7');
      line.setAttribute('stroke-width', '3.5');
      line.setAttribute('marker-end', 'url(#arrow-selected)');
    }
  }

  function updateNetwork(newNetwork: Network): void {
    currentNetwork = newNetwork;
    renderAll();
    if (currentHitRates) {
      applyHeatmap(currentHitRates);
    }
  }

  return {
    setNodeDelay,
    reset,
    setSelectedNode,
    highlightEdge,
    clearEdgeHighlights,
    applyHeatmap,
    clearHeatmap,
    applyCriticalityRings,
    clearCriticalityRings,
    setSelectedEdge,
    updateNetwork,
  };
}

