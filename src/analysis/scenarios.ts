import { Network } from '../engine/types';

export interface EdgeOverride {
  from: string;
  to: string;
  p?: number;
  damping?: number;
  slack?: number;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  injection: { nodeId: string; minutes: number };
  modifyNetwork?: (n: Network) => Network; // pure; must not mutate its input
}

export interface CustomScenario {
  id: string;
  name: string;
  description: string;
  injection: {
    nodeId: string;
    minutes: number;
  };
  overrides: EdgeOverride[];
  createdAt: Date | string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'single-late-rake',
    name: 'Single late rake',
    description: '15 min delay at North Terminus (R1) on the Red Line.',
    injection: { nodeId: 'R1', minutes: 15 },
  },
  {
    id: 'junction-failure',
    name: 'Junction failure',
    description: '30 min delay at Central Junction (J1) with compromised transfer resilience and 0 slack.',
    injection: { nodeId: 'J1', minutes: 30 },
    modifyNetwork: (network: Network): Network => ({
      nodes: [...network.nodes],
      edges: network.edges.map((edge) => {
        if (edge.from === 'J1') {
          return {
            ...edge,
            p: Math.min(1, edge.p + 0.15),
            slack: 0,
          };
        }
        return { ...edge };
      }),
    }),
  },
  {
    id: 'peak-hour-disruption',
    name: 'Peak-hour disruption',
    description: '20 min delay at Midtown station (B2), the busiest non-junction station between both main lines.',
    injection: { nodeId: 'B2', minutes: 20 },
  },
];

/**
 * Pure function that applies edge overrides to a network without mutating the input network.
 */
export function applyOverrides(network: Network, overrides: EdgeOverride[]): Network {
  const overrideMap = new Map<string, EdgeOverride>();
  for (const o of overrides) {
    overrideMap.set(`${o.from}->${o.to}`, o);
  }

  return {
    nodes: network.nodes.map((n) => ({ ...n, line: [...n.line] })),
    edges: network.edges.map((e) => {
      const key = `${e.from}->${e.to}`;
      const ov = overrideMap.get(key);
      if (ov) {
        return {
          ...e,
          p: ov.p !== undefined ? ov.p : e.p,
          damping: ov.damping !== undefined ? ov.damping : e.damping,
          slack: ov.slack !== undefined ? ov.slack : e.slack,
        };
      }
      return { ...e };
    }),
  };
}
