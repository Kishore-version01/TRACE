export type NodeKind = 'station' | 'junction';

export interface Node {
  id: string;
  name: string;
  kind: NodeKind;
  line: string[];
}

export interface Edge {
  from: string;
  to: string;
  p: number; // probability the delay is transmitted along this edge (0..1)
  damping: number; // fraction of delay retained when transmitted (0..1)
  slack: number; // minutes of buffer that absorb delay on this edge (>= 0)
}

export interface Network {
  nodes: Node[];
  edges: Edge[];
}

export interface DelayInjection {
  nodeId: string;
  minutes: number;
}

export interface SimulationSummary {
  totals: number[];
  perNodeMean: Record<string, number>;
  perNodeHitRate: Record<string, number>;
  affectedCounts: number[];
}

export interface PropagationEvent {
  step: number;
  from: string | null;
  to: string;
  minutes: number;
}
