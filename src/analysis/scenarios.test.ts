import { describe, it, expect } from 'vitest';
import { SCENARIOS, applyOverrides } from './scenarios';
import { SAMPLE_NETWORK } from '../engine/network';

describe('Scenarios Presets', () => {
  it('contains exactly the 3 specified scenarios', () => {
    expect(SCENARIOS.length).toBe(3);
    const names = SCENARIOS.map((s) => s.name);
    expect(names).toContain('Single late rake');
    expect(names).toContain('Junction failure');
    expect(names).toContain('Peak-hour disruption');
  });

  it("every scenario's nodeId exists in SAMPLE_NETWORK", () => {
    const validNodeIds = new Set(SAMPLE_NETWORK.nodes.map((n) => n.id));

    for (const scenario of SCENARIOS) {
      expect(validNodeIds.has(scenario.injection.nodeId)).toBe(true);
    }
  });

  it('modifyNetwork does not mutate the original network and raises p with slack 0', () => {
    const junctionScenario = SCENARIOS.find((s) => s.id === 'junction-failure')!;
    expect(junctionScenario.modifyNetwork).toBeDefined();

    // Deep clone original network edges to verify immutability
    const originalEdges = SAMPLE_NETWORK.edges.map((e) => ({ ...e }));

    const modified = junctionScenario.modifyNetwork!(SAMPLE_NETWORK);

    // Verify original network edges remain untouched
    expect(SAMPLE_NETWORK.edges).toEqual(originalEdges);

    // Verify modified network has modified J1 edges
    const j1OriginalEdges = SAMPLE_NETWORK.edges.filter((e) => e.from === 'J1');
    const j1ModifiedEdges = modified.edges.filter((e) => e.from === 'J1');

    for (let i = 0; i < j1ModifiedEdges.length; i++) {
      expect(j1ModifiedEdges[i].p).toBe(Math.min(1, j1OriginalEdges[i].p + 0.15));
      expect(j1ModifiedEdges[i].slack).toBe(0);
    }
  });

  it('applyOverrides does not mutate its input and updates specific edges correctly', () => {
    const originalEdges = SAMPLE_NETWORK.edges.map((e) => ({ ...e }));

    const overrides = [
      { from: 'R1', to: 'R2', p: 0.99, slack: 0 },
      { from: 'B2', to: 'J2', damping: 0.5 },
    ];

    const modified = applyOverrides(SAMPLE_NETWORK, overrides);

    // Verify original network is untouched
    expect(SAMPLE_NETWORK.edges).toEqual(originalEdges);

    // Verify overridden edges
    const r1r2 = modified.edges.find((e) => e.from === 'R1' && e.to === 'R2')!;
    expect(r1r2.p).toBe(0.99);
    expect(r1r2.slack).toBe(0);

    const b2j2 = modified.edges.find((e) => e.from === 'B2' && e.to === 'J2')!;
    expect(b2j2.damping).toBe(0.5);

    // Non-overridden edges retain original values
    const g1j2 = modified.edges.find((e) => e.from === 'G1' && e.to === 'J2')!;
    const originalG1j2 = SAMPLE_NETWORK.edges.find((e) => e.from === 'G1' && e.to === 'J2')!;
    expect(g1j2).toEqual(originalG1j2);
  });
});
