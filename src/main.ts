import { SAMPLE_NETWORK } from './engine/network';
import { Network } from './engine/types';
import { propagateWithEvents } from './engine/propagate';
import { mulberry32 } from './engine/rng';
import { createNetworkRenderer } from './ui/render';
import { createAnimator } from './ui/animate';
import { setupControls, RunParams, MonteCarloParams } from './ui/controls';
import { SCENARIOS, applyOverrides } from './analysis/scenarios';
import { renderHistogramSvg, renderComparisonHistogramSvg } from './analysis/histogram';
import {
  checkHealth,
  createSimulation,
  fetchSimulations,
  fetchSimulationById,
  deleteSimulationById,
  fetchCriticality,
  compareSimulations,
  fetchCustomScenarios,
  createCustomScenario,
  updateCustomScenario,
  deleteCustomScenario,
  SimulationSummaryItem,
  CustomScenarioItem,
  EdgeOverrideItem,
  NodeCriticalityResult,
} from './ui/api';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header>
    <h1>TRACE</h1>
    <p>Train Ripple & Anomaly Cascade Engine</p>
  </header>
  <div id="controls-container" class="card"></div>

  <!-- Feature 3: Scenario Editor Panel -->
  <div id="scenario-editor-card" class="card scenario-editor-card" style="display: none;">
    <div class="compare-header">
      <h2 id="scenario-editor-title">Scenario Editor</h2>
      <button type="button" id="btn-close-scenario-editor" class="btn secondary small">✕ Close</button>
    </div>
    <div class="scenario-editor-grid">
      <div class="editor-field">
        <label for="input-custom-name" class="control-label">Scenario Name *</label>
        <input type="text" id="input-custom-name" placeholder="e.g., Downtown Bottleneck" maxlength="60" />
      </div>
      <div class="editor-field">
        <label for="input-custom-desc" class="control-label">Description</label>
        <input type="text" id="input-custom-desc" placeholder="e.g., Heavy congestion on central junctions" />
      </div>
      <div class="editor-field">
        <label for="select-custom-inj-node" class="control-label">Injection Node</label>
        <select id="select-custom-inj-node">
          ${SAMPLE_NETWORK.nodes.map((n) => `<option value="${n.id}">${n.name} (${n.id})</option>`).join('')}
        </select>
      </div>
      <div class="editor-field">
        <label for="input-custom-inj-minutes" class="control-label">Injection Delay (1-60m)</label>
        <input type="number" id="input-custom-inj-minutes" min="1" max="60" value="15" />
      </div>
    </div>

    <!-- Edge Override Subsection -->
    <div class="overrides-section">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <span class="control-label">Edge Overrides (Click edge on map or select below, max 20)</span>
        <span id="overrides-count-badge" class="val-badge" style="font-size: 0.75rem; padding: 2px 8px;">0 / 20 overrides</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: flex-end;">
        <div class="editor-field">
          <label for="select-edge" class="control-label">Edge</label>
          <select id="select-edge">
            ${SAMPLE_NETWORK.edges.map((e) => `<option value="${e.from}->${e.to}">${e.from} → ${e.to}</option>`).join('')}
          </select>
        </div>
        <div class="editor-field">
          <label for="input-edge-p" class="control-label">p (0.00 - 1.00)</label>
          <input type="number" id="input-edge-p" min="0" max="1" step="0.05" value="0.90" />
        </div>
        <div class="editor-field">
          <label for="input-edge-damping" class="control-label">damping (0.00 - 1.00)</label>
          <input type="number" id="input-edge-damping" min="0" max="1" step="0.05" value="0.80" />
        </div>
        <div class="editor-field">
          <label for="input-edge-slack" class="control-label">slack (0 - 30 min)</label>
          <input type="number" id="input-edge-slack" min="0" max="30" step="1" value="0" />
        </div>
        <button type="button" id="btn-add-override" class="btn secondary small">Add / Update Override</button>
      </div>
      <div id="overrides-list" class="overrides-list">
        <span style="color: var(--text-muted); font-size: 0.8rem;">No overrides added yet.</span>
      </div>
    </div>

    <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
      <button type="button" id="btn-save-scenario" class="btn primary">Save Scenario</button>
      <button type="button" id="btn-clear-scenario-form" class="btn secondary">Clear Form</button>
      <span id="scenario-editor-msg" style="font-size: 0.85rem;"></span>
    </div>

    <!-- Custom Scenarios Saved List -->
    <div class="custom-scenarios-list-section">
      <span class="control-label">Saved Custom Scenarios</span>
      <div id="custom-scenarios-container">
        <div class="history-empty" style="padding: 0.5rem 0;">Loading custom scenarios...</div>
      </div>
    </div>
  </div>

  <div class="card svg-wrapper">
    <svg id="network-svg"></svg>
  </div>

  <!-- Feature 1: Criticality Ranking Panel -->
  <div id="criticality-card" class="card criticality-card" style="display: none;">
    <div class="criticality-header">
      <h2>
        Top 5 Critical Nodes (Delay Cascade Vulnerability)
        <span id="criticality-cached-badge" class="val-badge" style="font-size: 0.75rem; padding: 2px 6px; display: none;">Cached</span>
      </h2>
      <button type="button" id="btn-clear-criticality" class="btn secondary small">✕ Clear Highlights</button>
    </div>
    <div id="criticality-list" class="criticality-list"></div>
  </div>

  <div id="histogram-card" class="card histogram-card">
    <h2>Total Delay Distribution</h2>
    <svg id="histogram-svg"></svg>
  </div>

  <!-- Feature 2: Run Comparison Panel -->
  <div id="compare-card" class="card compare-card" style="display: none;">
    <div class="compare-header">
      <h2>Simulation Run Comparison</h2>
      <button type="button" id="btn-close-compare" class="btn secondary small">✕ Close Comparison</button>
    </div>
    <div id="compare-legend-badges" class="compare-legend-badges"></div>
    <svg id="compare-histogram-svg"></svg>
    <div class="delta-table-wrapper">
      <table class="delta-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Run A</th>
            <th>Run B</th>
            <th>Delta (B − A)</th>
          </tr>
        </thead>
        <tbody id="delta-table-body"></tbody>
      </table>
    </div>
  </div>

  <!-- Simulation History Table -->
  <div id="history-card" class="card history-card">
    <div class="history-header">
      <h2>Simulation History</h2>
      <div class="history-actions-bar">
        <button type="button" id="btn-compare-runs" class="btn primary small" disabled>Compare Runs (0/2)</button>
        <span id="api-status-badge" class="api-status-badge">Checking API...</span>
      </div>
    </div>
    <div id="api-error-banner" class="api-error-banner" style="display: none;"></div>
    <div id="history-table-container" class="history-table-wrapper">
      <div class="history-empty">Loading simulation history...</div>
    </div>
  </div>

  <footer class="prototype-footer">
    Prototype. Propagation probabilities are illustrative, not calibrated against real running data.
  </footer>
`;

let activeNetwork: Network = SAMPLE_NETWORK;
let currentScenarioId: string = 'custom';
let loadedCustomScenarios: CustomScenarioItem[] = [];
let editingCustomScenarioId: string | null = null;
let currentDraftOverrides: EdgeOverrideItem[] = [];
let checkedRunIds = new Set<string>();

const nodeMap = new Map(SAMPLE_NETWORK.nodes.map((n) => [n.id, n]));

const svg = document.querySelector<SVGSVGElement>('#network-svg')!;
const histogramSvg = document.querySelector<SVGSVGElement>('#histogram-svg')!;
const compareHistogramSvg = document.querySelector<SVGSVGElement>('#compare-histogram-svg')!;
const controlsContainer = document.querySelector<HTMLDivElement>('#controls-container')!;
const apiStatusBadge = document.querySelector<HTMLSpanElement>('#api-status-badge')!;
const apiErrorBanner = document.querySelector<HTMLDivElement>('#api-error-banner')!;
const historyTableContainer = document.querySelector<HTMLDivElement>('#history-table-container')!;

// Feature Elements
const criticalityCard = document.querySelector<HTMLDivElement>('#criticality-card')!;
const criticalityList = document.querySelector<HTMLDivElement>('#criticality-list')!;
const criticalityCachedBadge = document.querySelector<HTMLSpanElement>('#criticality-cached-badge')!;
const clearCriticalityBtn = document.querySelector<HTMLButtonElement>('#btn-clear-criticality')!;

const compareCard = document.querySelector<HTMLDivElement>('#compare-card')!;
const compareLegendBadges = document.querySelector<HTMLDivElement>('#compare-legend-badges')!;
const deltaTableBody = document.querySelector<HTMLTableSectionElement>('#delta-table-body')!;
const closeCompareBtn = document.querySelector<HTMLButtonElement>('#btn-close-compare')!;
const compareRunsBtn = document.querySelector<HTMLButtonElement>('#btn-compare-runs')!;

const scenarioEditorCard = document.querySelector<HTMLDivElement>('#scenario-editor-card')!;
const closeScenarioEditorBtn = document.querySelector<HTMLButtonElement>('#btn-close-scenario-editor')!;
const scenarioEditorTitle = document.querySelector<HTMLHeadingElement>('#scenario-editor-title')!;
const inputCustomName = document.querySelector<HTMLInputElement>('#input-custom-name')!;
const inputCustomDesc = document.querySelector<HTMLInputElement>('#input-custom-desc')!;
const selectCustomInjNode = document.querySelector<HTMLSelectElement>('#select-custom-inj-node')!;
const inputCustomInjMinutes = document.querySelector<HTMLInputElement>('#input-custom-inj-minutes')!;
const selectEdge = document.querySelector<HTMLSelectElement>('#select-edge')!;
const inputEdgeP = document.querySelector<HTMLInputElement>('#input-edge-p')!;
const inputEdgeDamping = document.querySelector<HTMLInputElement>('#input-edge-damping')!;
const inputEdgeSlack = document.querySelector<HTMLInputElement>('#input-edge-slack')!;
const btnAddOverride = document.querySelector<HTMLButtonElement>('#btn-add-override')!;
const overridesList = document.querySelector<HTMLDivElement>('#overrides-list')!;
const overridesCountBadge = document.querySelector<HTMLSpanElement>('#overrides-count-badge')!;
const btnSaveScenario = document.querySelector<HTMLButtonElement>('#btn-save-scenario')!;
const btnClearScenarioForm = document.querySelector<HTMLButtonElement>('#btn-clear-scenario-form')!;
const scenarioEditorMsg = document.querySelector<HTMLSpanElement>('#scenario-editor-msg')!;
const customScenariosContainer = document.querySelector<HTMLDivElement>('#custom-scenarios-container')!;

let selectedNodeId: string | null = null;
let activeRowId: string | null = null;
let isBackendOnline = false;

function handleNodeClick(nodeId: string) {
  animator.cancel();
  renderer.clearHeatmap();
  controls.setHeatmapActive(false);
  renderer.reset();
  controls.resetReadout();

  selectedNodeId = nodeId;
  const node = nodeMap.get(nodeId) || null;
  renderer.setSelectedNode(nodeId);
  controls.setSelectedNode(node ? { id: node.id, name: node.name } : null);
}

function handleEdgeClick(from: string, to: string) {
  // Open scenario editor if closed and select edge
  scenarioEditorCard.style.display = '';
  selectEdge.value = `${from}->${to}`;
  renderer.setSelectedEdge(from, to);

  // Pre-fill inputs with draft override or default edge
  const existingOverride = currentDraftOverrides.find((o) => o.from === from && o.to === to);
  if (existingOverride) {
    if (existingOverride.p !== undefined) inputEdgeP.value = String(existingOverride.p);
    if (existingOverride.damping !== undefined) inputEdgeDamping.value = String(existingOverride.damping);
    if (existingOverride.slack !== undefined) inputEdgeSlack.value = String(existingOverride.slack);
  } else {
    const netEdge = activeNetwork.edges.find((e) => e.from === from && e.to === to);
    if (netEdge) {
      inputEdgeP.value = String(netEdge.p);
      inputEdgeDamping.value = String(netEdge.damping);
      inputEdgeSlack.value = String(netEdge.slack);
    }
  }
}

const renderer = createNetworkRenderer(svg, activeNetwork, handleNodeClick, handleEdgeClick);
const animator = createAnimator(renderer);

function handleRun(params: RunParams) {
  // Single animated run stays client-side
  animator.cancel();
  renderer.clearHeatmap();
  controls.setHeatmapActive(false);
  renderer.reset();
  controls.resetReadout();

  const rng = mulberry32(params.seed);
  const { delays, events } = propagateWithEvents(
    activeNetwork,
    { nodeId: params.nodeId, minutes: params.minutes },
    rng
  );

  let totalMinutes = 0;
  let affectedCount = 0;
  let worstNode: { id: string; name: string; minutes: number } | null = null;

  for (const node of activeNetwork.nodes) {
    const d = delays.get(node.id) ?? 0;
    if (d >= 1) {
      totalMinutes += d;
      affectedCount++;
      if (!worstNode || d > worstNode.minutes) {
        worstNode = { id: node.id, name: node.name, minutes: d };
      }
    }
  }

  animator.play(events, params.stepDurationMs, () => {
    controls.updateReadout({
      totalMinutes,
      affectedCount,
      totalNodes: activeNetwork.nodes.length,
      worstNode,
    });
  });
}

async function handleRunMonteCarlo(params: MonteCarloParams) {
  if (!isBackendOnline) {
    showApiError('Cannot run Monte Carlo: backend API is offline.');
    return;
  }

  animator.cancel();
  controls.setMonteCarloBusy(true);

  try {
    let scenarioIdParam: string | null = null;
    let customScenarioIdParam: string | null = null;

    if (currentScenarioId.startsWith('custom:')) {
      customScenarioIdParam = currentScenarioId.replace('custom:', '');
    } else if (currentScenarioId !== 'custom') {
      scenarioIdParam = currentScenarioId;
    }

    const result = await createSimulation({
      nodeId: params.nodeId,
      minutes: params.minutes,
      seed: params.seed,
      runs: params.runs,
      scenarioId: scenarioIdParam,
      customScenarioId: customScenarioIdParam,
    });

    // Update stats readout from server result
    controls.updateMonteCarloStats({
      runs: result.params.runs,
      meanDelay: result.stats.mean,
      medianDelay: result.stats.median,
      p95Delay: result.stats.p95,
      maxDelay: result.stats.max,
      meanAffected: result.stats.meanAffected,
      noSpreadProb: result.stats.pNoSpread,
    });

    // Render histogram from server results
    renderHistogramSvg(histogramSvg, {
      totals: result.totals,
      meanVal: result.stats.mean,
      p95Val: result.stats.p95,
    });

    // Render heatmap from server hit rates
    renderer.applyHeatmap(result.perNodeHitRate);
    controls.setHeatmapActive(true);

    activeRowId = result.id;
    await loadHistory();
  } catch (err: any) {
    showApiError(`Monte Carlo simulation failed: ${err.message}`);
  } finally {
    controls.setMonteCarloBusy(false);
  }
}

function handleScenarioChange(scenarioId: string) {
  animator.cancel();
  renderer.clearHeatmap();
  controls.setHeatmapActive(false);
  renderer.reset();
  controls.resetReadout();

  currentScenarioId = scenarioId;

  if (scenarioId === 'custom') {
    activeNetwork = SAMPLE_NETWORK;
    renderer.updateNetwork(activeNetwork);
    return;
  }

  if (scenarioId.startsWith('custom:')) {
    const customId = scenarioId.replace('custom:', '');
    const customScenario = loadedCustomScenarios.find((s) => s.id === customId);
    if (customScenario) {
      activeNetwork = applyOverrides(SAMPLE_NETWORK, customScenario.overrides);
      renderer.updateNetwork(activeNetwork);

      selectedNodeId = customScenario.injection.nodeId;
      const node = nodeMap.get(selectedNodeId) || null;
      renderer.setSelectedNode(selectedNodeId);
      controls.setSelectedNode(node ? { id: node.id, name: node.name } : null);
      controls.setDelayMinutes(customScenario.injection.minutes);
    }
    return;
  }

  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) return;

  activeNetwork = scenario.modifyNetwork ? scenario.modifyNetwork(SAMPLE_NETWORK) : SAMPLE_NETWORK;
  renderer.updateNetwork(activeNetwork);

  selectedNodeId = scenario.injection.nodeId;
  const node = nodeMap.get(selectedNodeId) || null;
  renderer.setSelectedNode(selectedNodeId);
  controls.setSelectedNode(node ? { id: node.id, name: node.name } : null);
  controls.setDelayMinutes(scenario.injection.minutes);
}

function handleReset() {
  animator.cancel();
  renderer.clearHeatmap();
  controls.setHeatmapActive(false);
  renderer.clearCriticalityRings();
  criticalityCard.style.display = 'none';
  renderer.reset();
  controls.resetReadout();
  controls.resetMonteCarloStats();
  histogramSvg.innerHTML = '';
  activeRowId = null;

  const rows = historyTableContainer.querySelectorAll('.history-row');
  rows.forEach((r) => r.classList.remove('active'));

  if (selectedNodeId) {
    renderer.setSelectedNode(selectedNodeId);
  }
}

function handleClearHeatmap() {
  renderer.clearHeatmap();
  controls.setHeatmapActive(false);
  if (selectedNodeId) {
    renderer.setSelectedNode(selectedNodeId);
  }
}

// ---------------- Feature 1: Criticality Sweep ----------------

async function handleFindCriticalNodes() {
  if (!isBackendOnline) {
    showApiError('Cannot run criticality sweep: backend API is offline.');
    return;
  }

  controls.setCriticalityBusy(true);
  clearApiError();

  try {
    const minutes = controls.getDelayMinutes();
    const seed = controls.getSeed();
    const rawRuns = controls.getRuns();
    const runs = rawRuns === 100 ? 100 : 500;

    let scenarioIdParam: string | null = null;
    if (currentScenarioId.startsWith('custom:')) {
      scenarioIdParam = currentScenarioId.replace('custom:', '');
    } else if (currentScenarioId !== 'custom') {
      scenarioIdParam = currentScenarioId;
    }

    const resp = await fetchCriticality({
      minutes,
      seed,
      runs,
      scenarioId: scenarioIdParam,
    });

    // Render scaled rings on network map
    renderer.applyCriticalityRings(resp.results);

    // Render top 5 ranked list
    renderCriticalityPanel(resp.results.slice(0, 5), resp.cached);
  } catch (err: any) {
    showApiError(`Criticality analysis failed: ${err.message}`);
  } finally {
    controls.setCriticalityBusy(false);
  }
}

function renderCriticalityPanel(top5: NodeCriticalityResult[], cached: boolean) {
  criticalityCard.style.display = '';
  criticalityCachedBadge.style.display = cached ? '' : 'none';

  criticalityList.innerHTML = top5
    .map((item, idx) => {
      const node = nodeMap.get(item.nodeId);
      const name = node ? node.name : item.nodeId;
      return `
        <div class="criticality-item">
          <span class="criticality-rank">${idx + 1}</span>
          <div class="criticality-info">
            <span class="criticality-title">${name} (${item.nodeId})</span>
            <span class="criticality-sub">Mean: ${item.meanTotal.toFixed(1)}m · Hit: ${item.meanAffected.toFixed(1)} nodes · P95: ${item.p95.toFixed(1)}m</span>
          </div>
        </div>
      `;
    })
    .join('');
}

clearCriticalityBtn.addEventListener('click', () => {
  renderer.clearCriticalityRings();
  criticalityCard.style.display = 'none';
});

// ---------------- Feature 2: Compare Runs ----------------

function updateCompareButtonState() {
  const count = checkedRunIds.size;
  compareRunsBtn.disabled = count !== 2;
  compareRunsBtn.textContent = count === 2 ? 'Compare Selected (2)' : `Compare Runs (${count}/2)`;
}

compareRunsBtn.addEventListener('click', async () => {
  if (checkedRunIds.size !== 2) return;
  const ids = Array.from(checkedRunIds);
  await handleCompareRuns(ids[0], ids[1]);
});

closeCompareBtn.addEventListener('click', () => {
  compareCard.style.display = 'none';
});

async function handleCompareRuns(idA: string, idB: string) {
  try {
    const comparison = await compareSimulations(idA, idB);
    const { a, b, delta } = comparison;

    compareCard.style.display = '';

    const scenarioNameA = a.params.scenarioId
      ? SCENARIOS.find((s) => s.id === a.params.scenarioId)?.name || 'Custom Preset'
      : 'Default Network';
    const scenarioNameB = b.params.scenarioId
      ? SCENARIOS.find((s) => s.id === b.params.scenarioId)?.name || 'Custom Preset'
      : 'Default Network';

    compareLegendBadges.innerHTML = `
      <div class="badge-run-a">Run A: ${a.params.nodeId} (${a.params.minutes}m) · ${scenarioNameA} · ${a.params.runs} runs · Seed ${a.params.seed}</div>
      <div class="badge-run-b">Run B: ${b.params.nodeId} (${b.params.minutes}m) · ${scenarioNameB} · ${b.params.runs} runs · Seed ${b.params.seed}</div>
    `;

    renderComparisonHistogramSvg(compareHistogramSvg, {
      totalsA: a.totals,
      totalsB: b.totals,
      labelA: `Run A (${a.params.nodeId})`,
      labelB: `Run B (${b.params.nodeId})`,
      meanA: a.stats.mean,
      meanB: b.stats.mean,
    });

    function formatDelta(val: number, unit: string = 'm', invertGood: boolean = false): string {
      const sign = val > 0 ? '+' : '';
      const formatted = `${sign}${val.toFixed(1)}${unit}`;
      let pillClass = 'neutral';
      if (Math.abs(val) > 0.01) {
        if (!invertGood) {
          pillClass = val > 0 ? 'positive' : 'negative';
        } else {
          pillClass = val > 0 ? 'negative' : 'positive';
        }
      }
      return `<span class="delta-pill ${pillClass}">${formatted}</span>`;
    }

    deltaTableBody.innerHTML = `
      <tr>
        <td><strong>Mean Total Delay</strong></td>
        <td>${a.stats.mean.toFixed(1)} min</td>
        <td>${b.stats.mean.toFixed(1)} min</td>
        <td>${formatDelta(delta.mean)}</td>
      </tr>
      <tr>
        <td><strong>Median Delay</strong></td>
        <td>${a.stats.median.toFixed(1)} min</td>
        <td>${b.stats.median.toFixed(1)} min</td>
        <td>${formatDelta(delta.median)}</td>
      </tr>
      <tr>
        <td><strong>95th Percentile Delay</strong></td>
        <td>${a.stats.p95.toFixed(1)} min</td>
        <td>${b.stats.p95.toFixed(1)} min</td>
        <td>${formatDelta(delta.p95)}</td>
      </tr>
      <tr>
        <td><strong>Max Delay</strong></td>
        <td>${a.stats.max.toFixed(1)} min</td>
        <td>${b.stats.max.toFixed(1)} min</td>
        <td>${formatDelta(delta.max)}</td>
      </tr>
      <tr>
        <td><strong>Mean Nodes Affected</strong></td>
        <td>${a.stats.meanAffected.toFixed(1)} / 12</td>
        <td>${b.stats.meanAffected.toFixed(1)} / 12</td>
        <td>${formatDelta(delta.meanAffected, '')}</td>
      </tr>
      <tr>
        <td><strong>Containment (No Spread)</strong></td>
        <td>${(a.stats.pNoSpread * 100).toFixed(1)}%</td>
        <td>${(b.stats.pNoSpread * 100).toFixed(1)}%</td>
        <td>${formatDelta(delta.pNoSpread * 100, '%', true)}</td>
      </tr>
    `;

    compareCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err: any) {
    showApiError(`Failed to compare runs: ${err.message}`);
  }
}

// ---------------- Feature 3: Scenario Editor & Custom Scenarios ----------------

function updateOverridesListUI() {
  overridesCountBadge.textContent = `${currentDraftOverrides.length} / 20 overrides`;

  if (currentDraftOverrides.length === 0) {
    overridesList.innerHTML =
      '<span style="color: var(--text-muted); font-size: 0.8rem;">No overrides added yet.</span>';
    return;
  }

  overridesList.innerHTML = '';
  currentDraftOverrides.forEach((ov, idx) => {
    const pill = document.createElement('div');
    pill.className = 'override-pill';

    const parts = [];
    if (ov.p !== undefined) parts.push(`p=${ov.p}`);
    if (ov.damping !== undefined) parts.push(`damp=${ov.damping}`);
    if (ov.slack !== undefined) parts.push(`slack=${ov.slack}m`);

    pill.innerHTML = `
      <strong>${ov.from} → ${ov.to}</strong>: ${parts.join(', ')}
      <button type="button" class="btn-remove-override" title="Remove override">✕</button>
    `;

    const removeBtn = pill.querySelector<HTMLButtonElement>('.btn-remove-override')!;
    removeBtn.addEventListener('click', () => {
      currentDraftOverrides.splice(idx, 1);
      updateOverridesListUI();
    });

    overridesList.appendChild(pill);
  });
}

btnAddOverride.addEventListener('click', () => {
  const edgeVal = selectEdge.value;
  const [from, to] = edgeVal.split('->');
  const p = Math.max(0, Math.min(1, Number(inputEdgeP.value) || 0));
  const damping = Math.max(0, Math.min(1, Number(inputEdgeDamping.value) || 0));
  const slack = Math.max(0, Math.min(30, Number(inputEdgeSlack.value) || 0));

  const existingIdx = currentDraftOverrides.findIndex((o) => o.from === from && o.to === to);
  if (existingIdx >= 0) {
    currentDraftOverrides[existingIdx] = { from, to, p, damping, slack };
  } else {
    if (currentDraftOverrides.length >= 20) {
      scenarioEditorMsg.textContent = 'Maximum 20 overrides reached.';
      scenarioEditorMsg.style.color = '#ef4444';
      return;
    }
    currentDraftOverrides.push({ from, to, p, damping, slack });
  }

  scenarioEditorMsg.textContent = '';
  updateOverridesListUI();
});

selectEdge.addEventListener('change', () => {
  const [from, to] = selectEdge.value.split('->');
  renderer.setSelectedEdge(from, to);

  const existing = currentDraftOverrides.find((o) => o.from === from && o.to === to);
  if (existing) {
    if (existing.p !== undefined) inputEdgeP.value = String(existing.p);
    if (existing.damping !== undefined) inputEdgeDamping.value = String(existing.damping);
    if (existing.slack !== undefined) inputEdgeSlack.value = String(existing.slack);
  } else {
    const netEdge = activeNetwork.edges.find((e) => e.from === from && e.to === to);
    if (netEdge) {
      inputEdgeP.value = String(netEdge.p);
      inputEdgeDamping.value = String(netEdge.damping);
      inputEdgeSlack.value = String(netEdge.slack);
    }
  }
});

btnSaveScenario.addEventListener('click', async () => {
  const name = inputCustomName.value.trim();
  if (!name) {
    scenarioEditorMsg.textContent = 'Please enter a scenario name.';
    scenarioEditorMsg.style.color = '#ef4444';
    return;
  }

  const description = inputCustomDesc.value.trim();
  const nodeId = selectCustomInjNode.value;
  const minutes = Math.max(1, Math.min(60, Number(inputCustomInjMinutes.value) || 15));

  const payload = {
    name,
    description,
    injection: { nodeId, minutes },
    overrides: currentDraftOverrides,
  };

  btnSaveScenario.disabled = true;
  scenarioEditorMsg.textContent = 'Saving...';
  scenarioEditorMsg.style.color = '#94a3b8';

  try {
    let saved: CustomScenarioItem;
    if (editingCustomScenarioId) {
      saved = await updateCustomScenario(editingCustomScenarioId, payload);
    } else {
      saved = await createCustomScenario(payload);
    }

    scenarioEditorMsg.textContent = 'Scenario saved successfully!';
    scenarioEditorMsg.style.color = '#34d399';

    await loadCustomScenarios();

    // Select this scenario in controls
    controls.setScenario(`custom:${saved.id}`);
    handleScenarioChange(`custom:${saved.id}`);
  } catch (err: any) {
    scenarioEditorMsg.textContent = `Error: ${err.message}`;
    scenarioEditorMsg.style.color = '#ef4444';
  } finally {
    btnSaveScenario.disabled = false;
  }
});

btnClearScenarioForm.addEventListener('click', () => {
  resetScenarioEditorForm();
});

closeScenarioEditorBtn.addEventListener('click', () => {
  scenarioEditorCard.style.display = 'none';
  renderer.setSelectedEdge(null, null);
});

function resetScenarioEditorForm() {
  editingCustomScenarioId = null;
  scenarioEditorTitle.textContent = 'Scenario Editor';
  btnSaveScenario.textContent = 'Save Scenario';
  inputCustomName.value = '';
  inputCustomDesc.value = '';
  inputCustomInjMinutes.value = '15';
  currentDraftOverrides = [];
  updateOverridesListUI();
  scenarioEditorMsg.textContent = '';
  renderer.setSelectedEdge(null, null);
}

async function loadCustomScenarios() {
  if (!isBackendOnline) return;

  try {
    loadedCustomScenarios = await fetchCustomScenarios();
    controls.updateScenarioOptions(
      loadedCustomScenarios.map((s) => ({ id: `custom:${s.id}`, name: s.name }))
    );
    renderCustomScenariosList(loadedCustomScenarios);
  } catch (err: any) {
    customScenariosContainer.innerHTML = `<div class="history-empty">Failed to load custom scenarios: ${err.message}</div>`;
  }
}

function renderCustomScenariosList(items: CustomScenarioItem[]) {
  if (items.length === 0) {
    customScenariosContainer.innerHTML =
      '<div class="history-empty" style="padding: 0.5rem 0;">No custom scenarios created yet.</div>';
    return;
  }

  customScenariosContainer.innerHTML = '';
  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'custom-scenario-item';

    row.innerHTML = `
      <div>
        <strong>${item.name}</strong>
        <span style="color: var(--text-muted); font-size: 0.8rem; margin-left: 0.5rem;">(${item.overrides.length} overrides · Inj: ${item.injection.nodeId} ${item.injection.minutes}m)</span>
        ${item.description ? `<p style="color: var(--text-muted); font-size: 0.75rem; margin-top: 2px;">${item.description}</p>` : ''}
      </div>
      <div class="actions">
        <button type="button" class="btn secondary small btn-edit-custom">Edit</button>
        <button type="button" class="btn secondary small btn-delete-custom" title="Delete custom scenario">✕</button>
      </div>
    `;

    const editBtn = row.querySelector<HTMLButtonElement>('.btn-edit-custom')!;
    editBtn.addEventListener('click', () => {
      editingCustomScenarioId = item.id;
      scenarioEditorTitle.textContent = `Edit Scenario: ${item.name}`;
      btnSaveScenario.textContent = 'Update Scenario';
      inputCustomName.value = item.name;
      inputCustomDesc.value = item.description || '';
      selectCustomInjNode.value = item.injection.nodeId;
      inputCustomInjMinutes.value = String(item.injection.minutes);
      currentDraftOverrides = [...item.overrides];
      updateOverridesListUI();
      scenarioEditorCard.style.display = '';
      scenarioEditorCard.scrollIntoView({ behavior: 'smooth' });
    });

    const delBtn = row.querySelector<HTMLButtonElement>('.btn-delete-custom')!;
    delBtn.addEventListener('click', async () => {
      try {
        await deleteCustomScenario(item.id);
        if (editingCustomScenarioId === item.id) {
          resetScenarioEditorForm();
        }
        if (currentScenarioId === `custom:${item.id}`) {
          controls.setScenario('custom');
          handleScenarioChange('custom');
        }
        await loadCustomScenarios();
      } catch (err: any) {
        showApiError(`Failed to delete scenario: ${err.message}`);
      }
    });

    customScenariosContainer.appendChild(row);
  });
}

function showApiError(msg: string) {
  apiErrorBanner.textContent = msg;
  apiErrorBanner.style.display = '';
}

function clearApiError() {
  apiErrorBanner.textContent = '';
  apiErrorBanner.style.display = 'none';
}

async function loadHistory() {
  if (!isBackendOnline) {
    historyTableContainer.innerHTML =
      '<div class="history-empty">History unavailable while backend is offline.</div>';
    return;
  }

  try {
    const list = await fetchSimulations(20);
    renderHistoryTable(list);
  } catch (err: any) {
    historyTableContainer.innerHTML = `<div class="history-empty">Failed to load history: ${err.message}</div>`;
  }
}

function renderHistoryTable(items: SimulationSummaryItem[]) {
  if (items.length === 0) {
    historyTableContainer.innerHTML =
      '<div class="history-empty">No simulations saved yet. Run a Monte Carlo simulation above.</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'history-table';

  table.innerHTML = `
    <thead>
      <tr>
        <th style="width: 32px;"></th>
        <th>Scenario</th>
        <th>Node</th>
        <th>Delay</th>
        <th>Runs</th>
        <th>Mean Delay</th>
        <th>P95 Delay</th>
        <th>Time</th>
        <th></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody')!;

  for (const item of items) {
    const tr = document.createElement('tr');
    tr.className = `history-row${item.id === activeRowId ? ' active' : ''}`;
    tr.dataset.id = item.id;

    let scenarioName = 'Default Network';
    if (item.params.scenarioId) {
      const preset = SCENARIOS.find((s) => s.id === item.params.scenarioId);
      if (preset) {
        scenarioName = preset.name;
      } else {
        const custom = loadedCustomScenarios.find((s) => s.id === item.params.scenarioId);
        scenarioName = custom ? custom.name : 'Custom Preset';
      }
    }

    const timeFormatted = new Date(item.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const isChecked = checkedRunIds.has(item.id);

    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="compare-checkbox" data-id="${item.id}" ${isChecked ? 'checked' : ''} />
      </td>
      <td><strong>${scenarioName}</strong></td>
      <td>${item.params.nodeId}</td>
      <td>${item.params.minutes}m</td>
      <td>${item.params.runs}</td>
      <td>${item.stats.mean.toFixed(1)}m</td>
      <td>${item.stats.p95.toFixed(1)}m</td>
      <td style="color: var(--text-muted);">${timeFormatted}</td>
      <td style="text-align: right;">
        <button class="btn-delete-row" title="Delete record">✕</button>
      </td>
    `;

    const checkbox = tr.querySelector<HTMLInputElement>('.compare-checkbox')!;
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        if (checkedRunIds.size >= 2) {
          // Uncheck oldest or keep max 2
          const first = checkedRunIds.values().next().value;
          if (first) {
            checkedRunIds.delete(first);
            const firstCheckbox = historyTableContainer.querySelector<HTMLInputElement>(
              `.compare-checkbox[data-id="${first}"]`
            );
            if (firstCheckbox) firstCheckbox.checked = false;
          }
        }
        checkedRunIds.add(item.id);
      } else {
        checkedRunIds.delete(item.id);
      }
      updateCompareButtonState();
    });

    // Row click -> fetch by ID and render WITHOUT re-running
    tr.addEventListener('click', async () => {
      try {
        const full = await fetchSimulationById(item.id);
        activeRowId = full.id;

        // Synchronize scenario and parameters
        if (full.params.scenarioId) {
          const isPreset = SCENARIOS.some((s) => s.id === full.params.scenarioId);
          const scKey = isPreset ? full.params.scenarioId : `custom:${full.params.scenarioId}`;
          controls.setScenario(scKey);
          handleScenarioChange(scKey);
        } else {
          controls.setScenario('custom');
          handleScenarioChange('custom');
        }

        selectedNodeId = full.params.nodeId;
        const node = nodeMap.get(selectedNodeId);
        renderer.setSelectedNode(selectedNodeId);
        controls.setSelectedNode(node ? { id: node.id, name: node.name } : null);
        controls.setDelayMinutes(full.params.minutes);

        // Update stats readout
        controls.updateMonteCarloStats({
          runs: full.params.runs,
          meanDelay: full.stats.mean,
          medianDelay: full.stats.median,
          p95Delay: full.stats.p95,
          maxDelay: full.stats.max,
          meanAffected: full.stats.meanAffected,
          noSpreadProb: full.stats.pNoSpread,
        });

        // Re-render histogram
        renderHistogramSvg(histogramSvg, {
          totals: full.totals,
          meanVal: full.stats.mean,
          p95Val: full.stats.p95,
        });

        // Re-render heatmap
        renderer.applyHeatmap(full.perNodeHitRate);
        controls.setHeatmapActive(true);

        // Update active class on table rows
        historyTableContainer
          .querySelectorAll('.history-row')
          .forEach((r) => r.classList.remove('active'));
        tr.classList.add('active');
      } catch (err: any) {
        showApiError(`Failed to load simulation: ${err.message}`);
      }
    });

    // Delete button
    const deleteBtn = tr.querySelector<HTMLButtonElement>('.btn-delete-row')!;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await deleteSimulationById(item.id);
        checkedRunIds.delete(item.id);
        updateCompareButtonState();
        if (activeRowId === item.id) {
          activeRowId = null;
        }
        await loadHistory();
      } catch (err: any) {
        showApiError(`Failed to delete record: ${err.message}`);
      }
    });

    tbody.appendChild(tr);
  }

  historyTableContainer.innerHTML = '';
  historyTableContainer.appendChild(table);
  updateCompareButtonState();
}

async function initBackend() {
  try {
    const health = await checkHealth();
    if (health.ok && health.db === 'up') {
      isBackendOnline = true;
      apiStatusBadge.textContent = 'API & DB Online';
      apiStatusBadge.className = 'api-status-badge online';
      clearApiError();
      controls.setBackendStatus(true);
      await loadCustomScenarios();
      await loadHistory();
    } else {
      throw new Error(`Database status: ${health.db}`);
    }
  } catch {
    isBackendOnline = false;
    apiStatusBadge.textContent = 'Backend Offline';
    apiStatusBadge.className = 'api-status-badge offline';
    showApiError(
      'Backend API is not reachable. Ensure the server is running (npm run dev). Monte Carlo simulations, Criticality sweeps, and History are disabled.'
    );
    controls.setBackendStatus(false);
    historyTableContainer.innerHTML =
      '<div class="history-empty">History unavailable while backend is offline. Retrying automatically...</div>';
    // Auto-retry connection every 3 seconds
    setTimeout(initBackend, 3000);
  }
}

const controls = setupControls(
  controlsContainer,
  {
    onRun: handleRun,
    onRunMonteCarlo: handleRunMonteCarlo,
    onReset: handleReset,
    onScenarioChange: handleScenarioChange,
    onClearHeatmap: handleClearHeatmap,
    onFindCriticalNodes: handleFindCriticalNodes,
    onToggleScenarioEditor: () => {
      const isHidden = scenarioEditorCard.style.display === 'none';
      scenarioEditorCard.style.display = isHidden ? '' : 'none';
      if (isHidden) {
        scenarioEditorCard.scrollIntoView({ behavior: 'smooth' });
      }
    },
  },
  activeNetwork.nodes.length
);

initBackend();
