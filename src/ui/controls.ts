import { SCENARIOS } from '../analysis/scenarios';

export interface RunParams {
  nodeId: string;
  minutes: number;
  seed: number;
  stepDurationMs: number;
}

export interface MonteCarloParams {
  nodeId: string;
  minutes: number;
  seed: number;
  runs: number;
}

export interface ReadoutData {
  totalMinutes: number;
  affectedCount: number;
  totalNodes: number;
  worstNode: { id: string; name: string; minutes: number } | null;
}

export interface MonteCarloStats {
  runs: number;
  meanDelay: number;
  medianDelay: number;
  p95Delay: number;
  maxDelay: number;
  meanAffected: number;
  noSpreadProb: number; // fraction where affectedCounts === 1
}

export interface ControlsCallbacks {
  onRun: (params: RunParams) => void;
  onRunMonteCarlo: (params: MonteCarloParams) => void;
  onReset: () => void;
  onScenarioChange: (scenarioId: string) => void;
  onClearHeatmap: () => void;
  onFindCriticalNodes?: () => void;
  onToggleScenarioEditor?: () => void;
}

export interface ControlsController {
  setSelectedNode(node: { id: string; name: string } | null): void;
  setDelayMinutes(minutes: number): void;
  setScenario(id: string): void;
  updateReadout(data: ReadoutData): void;
  updateMonteCarloStats(stats: MonteCarloStats): void;
  resetReadout(totalNodes?: number): void;
  resetMonteCarloStats(): void;
  setHeatmapActive(active: boolean): void;
  setMonteCarloBusy(busy: boolean): void;
  setCriticalityBusy(busy: boolean): void;
  setBackendStatus(online: boolean): void;
  getSelectedNodeId(): string | null;
  getDelayMinutes(): number;
  getSeed(): number;
  getRuns(): number;
  updateScenarioOptions(customScenarios: Array<{ id: string; name: string }>): void;
}

export function setupControls(
  container: HTMLElement,
  callbacks: ControlsCallbacks,
  totalNodesCount: number = 12
): ControlsController {
  container.innerHTML = `
    <div class="controls-grid">
      <!-- Row 1: Configurations -->
      <div class="control-row">
        <div class="control-item">
          <label for="select-scenario" class="control-label">Scenario Preset</label>
          <select id="select-scenario">
            <option value="custom">Default Network (Manual)</option>
            <optgroup label="Preset Scenarios">
              ${SCENARIOS.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}
            </optgroup>
            <optgroup label="Custom Scenarios" id="optgroup-custom-scenarios">
            </optgroup>
          </select>
        </div>

        <div class="control-item selection-group">
          <span class="control-label">Injection Node</span>
          <span id="selected-node-label" class="val-badge empty">Select a node</span>
        </div>

        <div class="control-item">
          <label for="input-delay" class="control-label">Delay (1-60 min)</label>
          <input type="number" id="input-delay" min="1" max="60" value="10" />
        </div>

        <div class="control-item seed-group">
          <label for="input-seed" class="control-label">Seed</label>
          <div class="input-with-button">
            <input type="number" id="input-seed" value="42" />
            <button type="button" id="btn-randomize" class="btn small" title="Randomize seed">🎲</button>
          </div>
        </div>

        <div class="control-item speed-group">
          <span class="control-label">Speed</span>
          <div class="segmented-control">
            <button type="button" id="btn-speed-normal" class="btn-seg active">Normal (400ms)</button>
            <button type="button" id="btn-speed-fast" class="btn-seg">Fast (100ms)</button>
          </div>
        </div>

        <div class="control-item runs-group">
          <label for="select-runs" class="control-label">MC Runs</label>
          <select id="select-runs">
            <option value="100">100</option>
            <option value="500" selected>500</option>
            <option value="2000">2000</option>
          </select>
        </div>
      </div>

      <!-- Row 2: Action Buttons -->
      <div class="actions-row">
        <button type="button" id="btn-run" class="btn primary" disabled>Run Single Cascade</button>
        <button type="button" id="btn-mc" class="btn accent" disabled>Run Monte Carlo</button>
        <button type="button" id="btn-criticality" class="btn secondary">Find critical nodes</button>
        <button type="button" id="btn-scenario-editor" class="btn secondary">Scenario Editor</button>
        <button type="button" id="btn-reset" class="btn secondary">Reset</button>
        <button type="button" id="btn-clear-heatmap" class="btn secondary" style="display: none;">Clear Heatmap</button>
      </div>
    </div>

    <!-- Live Readouts Panel -->
    <div class="readout-panel">
      <div class="readout-card">
        <span class="readout-label">Single Run Total</span>
        <span id="readout-total" class="readout-val">0 min</span>
      </div>
      <div class="readout-card">
        <span class="readout-label">Nodes Affected</span>
        <span id="readout-count" class="readout-val">0 / ${totalNodesCount}</span>
      </div>
      <div class="readout-card">
        <span class="readout-label">Worst-Hit Node</span>
        <span id="readout-worst" class="readout-val">None</span>
      </div>
    </div>

    <!-- Monte Carlo Statistics Panel -->
    <div id="mc-stats-panel" class="mc-stats-panel" style="display: none;">
      <h3 class="panel-subtitle">Monte Carlo Distribution Statistics</h3>
      <div class="mc-stats-grid">
        <div class="stat-pill"><span class="stat-label">Runs:</span> <span id="stat-runs" class="stat-value">-</span></div>
        <div class="stat-pill"><span class="stat-label">Mean Total Delay:</span> <span id="stat-mean" class="stat-value">-</span></div>
        <div class="stat-pill"><span class="stat-label">Median Delay:</span> <span id="stat-median" class="stat-value">-</span></div>
        <div class="stat-pill"><span class="stat-label">95th Percentile:</span> <span id="stat-p95" class="stat-value">-</span></div>
        <div class="stat-pill"><span class="stat-label">Max Delay:</span> <span id="stat-max" class="stat-value">-</span></div>
        <div class="stat-pill"><span class="stat-label">Mean Nodes Hit:</span> <span id="stat-affected" class="stat-value">-</span></div>
        <div class="stat-pill highlight"><span class="stat-label">Containment (No Spread):</span> <span id="stat-nospread" class="stat-value">-</span></div>
      </div>
    </div>
  `;

  const scenarioSelect = container.querySelector<HTMLSelectElement>('#select-scenario')!;
  const nodeLabel = container.querySelector<HTMLSpanElement>('#selected-node-label')!;
  const delayInput = container.querySelector<HTMLInputElement>('#input-delay')!;
  const seedInput = container.querySelector<HTMLInputElement>('#input-seed')!;
  const randomizeBtn = container.querySelector<HTMLButtonElement>('#btn-randomize')!;
  const speedNormalBtn = container.querySelector<HTMLButtonElement>('#btn-speed-normal')!;
  const speedFastBtn = container.querySelector<HTMLButtonElement>('#btn-speed-fast')!;
  const runsSelect = container.querySelector<HTMLSelectElement>('#select-runs')!;
  const runBtn = container.querySelector<HTMLButtonElement>('#btn-run')!;
  const mcBtn = container.querySelector<HTMLButtonElement>('#btn-mc')!;
  const criticalityBtn = container.querySelector<HTMLButtonElement>('#btn-criticality')!;
  const scenarioEditorBtn = container.querySelector<HTMLButtonElement>('#btn-scenario-editor')!;
  const resetBtn = container.querySelector<HTMLButtonElement>('#btn-reset')!;
  const clearHeatmapBtn = container.querySelector<HTMLButtonElement>('#btn-clear-heatmap')!;
  const customScenariosOptGroup = container.querySelector<HTMLOptGroupElement>('#optgroup-custom-scenarios')!;

  const readoutTotal = container.querySelector<HTMLSpanElement>('#readout-total')!;
  const readoutCount = container.querySelector<HTMLSpanElement>('#readout-count')!;
  const readoutWorst = container.querySelector<HTMLSpanElement>('#readout-worst')!;

  const mcStatsPanel = container.querySelector<HTMLDivElement>('#mc-stats-panel')!;
  const statRuns = container.querySelector<HTMLSpanElement>('#stat-runs')!;
  const statMean = container.querySelector<HTMLSpanElement>('#stat-mean')!;
  const statMedian = container.querySelector<HTMLSpanElement>('#stat-median')!;
  const statP95 = container.querySelector<HTMLSpanElement>('#stat-p95')!;
  const statMax = container.querySelector<HTMLSpanElement>('#stat-max')!;
  const statAffected = container.querySelector<HTMLSpanElement>('#stat-affected')!;
  const statNoSpread = container.querySelector<HTMLSpanElement>('#stat-nospread')!;

  let selectedId: string | null = null;
  let currentSpeedMs = 400;

  speedNormalBtn.addEventListener('click', () => {
    currentSpeedMs = 400;
    speedNormalBtn.classList.add('active');
    speedFastBtn.classList.remove('active');
  });

  speedFastBtn.addEventListener('click', () => {
    currentSpeedMs = 100;
    speedFastBtn.classList.add('active');
    speedNormalBtn.classList.remove('active');
  });

  let seedState = (Date.now() ^ 0x9e3779b9) >>> 0;
  randomizeBtn.addEventListener('click', () => {
    seedState = (seedState * 1664525 + 1013904223) >>> 0;
    const newSeed = (seedState % 100000) + 1;
    seedInput.value = String(newSeed);
  });

  scenarioSelect.addEventListener('change', () => {
    callbacks.onScenarioChange(scenarioSelect.value);
  });

  criticalityBtn.addEventListener('click', () => {
    callbacks.onFindCriticalNodes?.();
  });

  scenarioEditorBtn.addEventListener('click', () => {
    callbacks.onToggleScenarioEditor?.();
  });

  runBtn.addEventListener('click', () => {
    if (!selectedId) return;

    let minutes = Number(delayInput.value) || 10;
    if (minutes < 1) minutes = 1;
    if (minutes > 60) minutes = 60;
    delayInput.value = String(minutes);

    const seed = Number(seedInput.value) || 42;

    callbacks.onRun({
      nodeId: selectedId,
      minutes,
      seed,
      stepDurationMs: currentSpeedMs,
    });
  });

  mcBtn.addEventListener('click', () => {
    if (!selectedId) return;

    let minutes = Number(delayInput.value) || 10;
    if (minutes < 1) minutes = 1;
    if (minutes > 60) minutes = 60;
    delayInput.value = String(minutes);

    const seed = Number(seedInput.value) || 42;
    const runs = Number(runsSelect.value) || 500;

    callbacks.onRunMonteCarlo({
      nodeId: selectedId,
      minutes,
      seed,
      runs,
    });
  });

  resetBtn.addEventListener('click', () => {
    callbacks.onReset();
  });

  clearHeatmapBtn.addEventListener('click', () => {
    callbacks.onClearHeatmap();
  });

  let isBackendOnline = true;

  function setSelectedNode(node: { id: string; name: string } | null): void {
    if (!node) {
      selectedId = null;
      nodeLabel.textContent = 'Select a node';
      nodeLabel.classList.add('empty');
      runBtn.disabled = true;
      mcBtn.disabled = true;
    } else {
      selectedId = node.id;
      nodeLabel.textContent = `${node.name} (${node.id})`;
      nodeLabel.classList.remove('empty');
      runBtn.disabled = false;
      mcBtn.disabled = !isBackendOnline;
    }
  }

  function setDelayMinutes(minutes: number): void {
    delayInput.value = String(minutes);
  }

  function setScenario(id: string): void {
    scenarioSelect.value = id;
  }

  function updateReadout(data: ReadoutData): void {
    readoutTotal.textContent = `${Math.round(data.totalMinutes)} min`;
    readoutCount.textContent = `${data.affectedCount} / ${data.totalNodes}`;
    if (data.worstNode && data.worstNode.minutes >= 1) {
      readoutWorst.textContent = `${data.worstNode.name} (${data.worstNode.id}): ${Math.round(data.worstNode.minutes)} min`;
    } else {
      readoutWorst.textContent = 'None';
    }
  }

  function resetReadout(totalNodes: number = totalNodesCount): void {
    readoutTotal.textContent = '0 min';
    readoutCount.textContent = `0 / ${totalNodes}`;
    readoutWorst.textContent = 'None';
  }

  function updateMonteCarloStats(stats: MonteCarloStats): void {
    mcStatsPanel.style.display = '';
    statRuns.textContent = String(stats.runs);
    statMean.textContent = `${stats.meanDelay.toFixed(1)}m`;
    statMedian.textContent = `${stats.medianDelay.toFixed(1)}m`;
    statP95.textContent = `${stats.p95Delay.toFixed(1)}m`;
    statMax.textContent = `${stats.maxDelay.toFixed(1)}m`;
    statAffected.textContent = `${stats.meanAffected.toFixed(1)} / ${totalNodesCount}`;
    statNoSpread.textContent = `${(stats.noSpreadProb * 100).toFixed(1)}%`;
  }

  function resetMonteCarloStats(): void {
    mcStatsPanel.style.display = 'none';
    statRuns.textContent = '-';
    statMean.textContent = '-';
    statMedian.textContent = '-';
    statP95.textContent = '-';
    statMax.textContent = '-';
    statAffected.textContent = '-';
    statNoSpread.textContent = '-';
  }

  function setHeatmapActive(active: boolean): void {
    clearHeatmapBtn.style.display = active ? '' : 'none';
  }

  function setMonteCarloBusy(busy: boolean): void {
    mcBtn.disabled = busy;
    mcBtn.textContent = busy ? 'Simulating...' : 'Run Monte Carlo';
  }

  function setCriticalityBusy(busy: boolean): void {
    criticalityBtn.disabled = busy;
    criticalityBtn.textContent = busy ? 'Analyzing...' : 'Find critical nodes';
  }

  function setBackendStatus(online: boolean): void {
    isBackendOnline = online;
    if (!online) {
      mcBtn.disabled = true;
      criticalityBtn.disabled = true;
      mcBtn.textContent = 'Run Monte Carlo';
      criticalityBtn.textContent = 'Find critical nodes';
    } else {
      criticalityBtn.disabled = false;
      mcBtn.disabled = !selectedId;
    }
  }

  function getDelayMinutes(): number {
    let m = Number(delayInput.value) || 10;
    if (m < 1) m = 1;
    if (m > 60) m = 60;
    return m;
  }

  function getSeed(): number {
    return Number(seedInput.value) || 42;
  }

  function getRuns(): number {
    return Number(runsSelect.value) || 500;
  }

  function updateScenarioOptions(customScenarios: Array<{ id: string; name: string }>): void {
    const curVal = scenarioSelect.value;
    if (customScenariosOptGroup) {
      customScenariosOptGroup.innerHTML = customScenarios
        .map((s) => `<option value="${s.id}">${s.name}</option>`)
        .join('');
    }
    // Restore selection if still present, otherwise default to curVal
    if (Array.from(scenarioSelect.options).some((o) => o.value === curVal)) {
      scenarioSelect.value = curVal;
    }
  }

  return {
    setSelectedNode,
    setDelayMinutes,
    setScenario,
    updateReadout,
    updateMonteCarloStats,
    resetReadout,
    resetMonteCarloStats,
    setHeatmapActive,
    setMonteCarloBusy,
    setCriticalityBusy,
    setBackendStatus,
    getSelectedNodeId: () => selectedId,
    getDelayMinutes,
    getSeed,
    getRuns,
    updateScenarioOptions,
  };
}

