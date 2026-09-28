export interface SimulationParamsPayload {
  nodeId: string;
  minutes: number;
  seed: number;
  runs: number;
  scenarioId?: string | null;
  customScenarioId?: string | null;
}

export interface SimulationStatsPayload {
  mean: number;
  median: number;
  p95: number;
  max: number;
  meanAffected: number;
  pNoSpread: number;
}

export interface SimulationSummaryItem {
  id: string;
  createdAt: string;
  params: SimulationParamsPayload;
  stats: SimulationStatsPayload;
}

export interface FullSimulationItem extends SimulationSummaryItem {
  totals: number[];
  perNodeHitRate: Record<string, number>;
}

export interface HealthResponse {
  ok: boolean;
  db: 'up' | 'down';
}

export interface NodeCriticalityResult {
  nodeId: string;
  meanTotal: number;
  meanAffected: number;
  p95: number;
}

export interface CriticalityResponse {
  results: NodeCriticalityResult[];
  cached: boolean;
}

export interface CriticalityParamsPayload {
  minutes: number;
  seed: number;
  runs: number;
  scenarioId?: string | null;
}

export interface SimulationDelta {
  mean: number;
  median: number;
  p95: number;
  max: number;
  meanAffected: number;
  pNoSpread: number;
}

export interface CompareSimulationsResponse {
  a: FullSimulationItem;
  b: FullSimulationItem;
  delta: SimulationDelta;
}

export interface EdgeOverrideItem {
  from: string;
  to: string;
  p?: number;
  damping?: number;
  slack?: number;
}

export interface CustomScenarioPayload {
  name: string;
  description?: string;
  injection: {
    nodeId: string;
    minutes: number;
  };
  overrides: EdgeOverrideItem[];
}

export interface CustomScenarioItem extends CustomScenarioPayload {
  id: string;
  createdAt: string;
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    throw new Error(`Health check failed: HTTP ${res.status}`);
  }
  return await res.json();
}

export async function createSimulation(
  payload: SimulationParamsPayload
): Promise<FullSimulationItem> {
  const res = await fetch('/api/simulations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Simulation request failed' }));
    throw new Error(err.error || `HTTP error ${res.status}`);
  }

  return await res.json();
}

export async function fetchSimulations(limit: number = 20): Promise<SimulationSummaryItem[]> {
  const res = await fetch(`/api/simulations?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch history: HTTP ${res.status}`);
  }
  return await res.json();
}

export async function fetchSimulationById(id: string): Promise<FullSimulationItem> {
  const res = await fetch(`/api/simulations/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch simulation ${id}: HTTP ${res.status}`);
  }
  return await res.json();
}

export async function deleteSimulationById(id: string): Promise<void> {
  const res = await fetch(`/api/simulations/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete simulation: HTTP ${res.status}`);
  }
}

export async function fetchCriticality(
  payload: CriticalityParamsPayload
): Promise<CriticalityResponse> {
  const res = await fetch('/api/analysis/criticality', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Criticality analysis failed' }));
    throw new Error(err.error || `HTTP error ${res.status}`);
  }

  return await res.json();
}

export async function compareSimulations(
  idA: string,
  idB: string
): Promise<CompareSimulationsResponse> {
  const res = await fetch(`/api/simulations/compare?a=${idA}&b=${idB}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Comparison failed' }));
    throw new Error(err.error || `HTTP error ${res.status}`);
  }
  return await res.json();
}

export async function fetchCustomScenarios(): Promise<CustomScenarioItem[]> {
  const res = await fetch('/api/custom-scenarios');
  if (!res.ok) {
    throw new Error(`Failed to fetch custom scenarios: HTTP ${res.status}`);
  }
  return await res.json();
}

export async function createCustomScenario(
  payload: CustomScenarioPayload
): Promise<CustomScenarioItem> {
  const res = await fetch('/api/custom-scenarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create custom scenario' }));
    throw new Error(err.error || `HTTP error ${res.status}`);
  }

  return await res.json();
}

export async function updateCustomScenario(
  id: string,
  payload: CustomScenarioPayload
): Promise<CustomScenarioItem> {
  const res = await fetch(`/api/custom-scenarios/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update custom scenario' }));
    throw new Error(err.error || `HTTP error ${res.status}`);
  }

  return await res.json();
}

export async function deleteCustomScenario(id: string): Promise<void> {
  const res = await fetch(`/api/custom-scenarios/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete custom scenario: HTTP ${res.status}`);
  }
}

