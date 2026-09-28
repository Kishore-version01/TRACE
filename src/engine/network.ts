import { Network, Node, Edge } from './types';

const nodes: Node[] = [
  // Red Line Stations
  { id: 'R1', name: 'North Terminus', kind: 'station', line: ['Red'] },
  { id: 'R2', name: 'North Park', kind: 'station', line: ['Red'] },
  { id: 'R3', name: 'South Gate', kind: 'station', line: ['Red'] },
  { id: 'R4', name: 'South Terminus', kind: 'station', line: ['Red'] },

  // Junctions
  { id: 'J1', name: 'Central Junction', kind: 'junction', line: ['Red', 'Blue'] },
  { id: 'J2', name: 'West Junction', kind: 'junction', line: ['Blue', 'Green'] },

  // Blue Line Stations
  { id: 'B1', name: 'East Port', kind: 'station', line: ['Blue'] },
  { id: 'B2', name: 'Midtown', kind: 'station', line: ['Blue'] },
  { id: 'B3', name: 'Bay Area', kind: 'station', line: ['Blue'] },

  // Green Line Stations
  { id: 'G1', name: 'Highland', kind: 'station', line: ['Green'] },
  { id: 'G2', name: 'Cross Valley', kind: 'station', line: ['Green'] },
  { id: 'G3', name: 'Eastwood', kind: 'station', line: ['Green'] },
];

// Helper to create bidirectional edge pairs with appropriate realistic values
function makeBiEdges(
  fromNode: Node,
  toNode: Node,
  stationParams: { p: number; damping: number; slack: number } = { p: 0.65, damping: 0.8, slack: 3 }
): Edge[] {
  const fromIsJunction = fromNode.kind === 'junction';
  const toIsJunction = toNode.kind === 'junction';

  // Junction outgoing edges spread delay more: higher p, lower slack
  const forward: Edge = {
    from: fromNode.id,
    to: toNode.id,
    p: fromIsJunction ? 0.88 : stationParams.p,
    damping: fromIsJunction ? 0.92 : stationParams.damping,
    slack: fromIsJunction ? 1 : stationParams.slack,
  };

  const backward: Edge = {
    from: toNode.id,
    to: fromNode.id,
    p: toIsJunction ? 0.88 : stationParams.p,
    damping: toIsJunction ? 0.92 : stationParams.damping,
    slack: toIsJunction ? 1 : stationParams.slack,
  };

  return [forward, backward];
}

const nodeMap = new Map(nodes.map((n) => [n.id, n]));
const getNode = (id: string) => nodeMap.get(id)!;

const edges: Edge[] = [
  // Red Line bidirectional edges
  ...makeBiEdges(getNode('R1'), getNode('R2'), { p: 0.6, damping: 0.82, slack: 3 }),
  ...makeBiEdges(getNode('R2'), getNode('J1'), { p: 0.7, damping: 0.85, slack: 2 }),
  ...makeBiEdges(getNode('J1'), getNode('R3'), { p: 0.7, damping: 0.85, slack: 2 }),
  ...makeBiEdges(getNode('R3'), getNode('R4'), { p: 0.6, damping: 0.8, slack: 4 }),
  // Loop cycle on Red line connecting R4 back to R1
  ...makeBiEdges(getNode('R4'), getNode('R1'), { p: 0.55, damping: 0.78, slack: 4 }),

  // Blue Line bidirectional edges
  ...makeBiEdges(getNode('B1'), getNode('J1'), { p: 0.65, damping: 0.85, slack: 3 }),
  ...makeBiEdges(getNode('J1'), getNode('B2'), { p: 0.75, damping: 0.88, slack: 2 }),
  ...makeBiEdges(getNode('B2'), getNode('J2'), { p: 0.75, damping: 0.88, slack: 2 }),
  ...makeBiEdges(getNode('J2'), getNode('B3'), { p: 0.6, damping: 0.82, slack: 3 }),

  // Green Line bidirectional edges
  ...makeBiEdges(getNode('G1'), getNode('J2'), { p: 0.6, damping: 0.82, slack: 3 }),
  ...makeBiEdges(getNode('J2'), getNode('G2'), { p: 0.7, damping: 0.85, slack: 2 }),
  ...makeBiEdges(getNode('G2'), getNode('G3'), { p: 0.55, damping: 0.8, slack: 4 }),
];

export const SAMPLE_NETWORK: Network = {
  nodes,
  edges,
};
