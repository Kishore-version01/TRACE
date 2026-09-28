import { Network, DelayInjection, Edge, PropagationEvent } from './types';
import { RNG } from './rng';

export type { PropagationEvent };

export interface PropagationWithEventsResult {
  delays: Map<string, number>;
  events: PropagationEvent[];
}

/**
 * Propagates delay through a network from a single injection point and emits BFS step events.
 *
 * Rules:
 * 1. The injected node starts with the given delay (step 0, from = null).
 * 2. For each outgoing edge of a delayed node: with probability p, the downstream delay is
 *    max(0, delay * damping - slack).
 * 3. A node keeps the MAX delay it has received, never the sum.
 * 4. Only re-process a node if its delay increases. Ignore delays below 1 minute.
 * 5. Must terminate on cyclic graphs. Delay must never increase along any path.
 * 6. Edges out of a "junction" node are evaluated normally.
 * Each edge is rolled at most once per run per source-node delay value.
 */
export function propagateWithEvents(
  network: Network,
  injection: DelayInjection,
  rng: RNG
): PropagationWithEventsResult {
  const delays = new Map<string, number>();
  const events: PropagationEvent[] = [];

  // Rule 4: Ignore delays below 1 minute
  if (injection.minutes < 1) {
    return { delays, events };
  }

  // Pre-index outgoing edges by source node
  const outgoing = new Map<string, Edge[]>();
  for (const edge of network.edges) {
    let list = outgoing.get(edge.from);
    if (!list) {
      list = [];
      outgoing.set(edge.from, list);
    }
    list.push(edge);
  }

  // Injected node starts with given delay at step 0
  delays.set(injection.nodeId, injection.minutes);
  events.push({
    step: 0,
    from: null,
    to: injection.nodeId,
    minutes: injection.minutes,
  });

  const lastProcessedDelay = new Map<string, number>();
  const queue: Array<{ nodeId: string; depth: number }> = [
    { nodeId: injection.nodeId, depth: 0 },
  ];
  let head = 0;

  while (head < queue.length) {
    const { nodeId: u, depth } = queue[head++];
    const currentDelay = delays.get(u) ?? 0;

    if (currentDelay < 1) continue;

    // Rule 4: Only re-process a node if its delay increases
    const lastDelay = lastProcessedDelay.get(u) ?? 0;
    if (currentDelay <= lastDelay) continue;

    // Record the delay value with which this node's outgoing edges are evaluated
    lastProcessedDelay.set(u, currentDelay);

    const edges = outgoing.get(u);
    if (!edges) continue;

    for (const edge of edges) {
      // Each edge is rolled at most once per run per source-node delay value
      if (rng() < edge.p) {
        let downstream = currentDelay * edge.damping - edge.slack;
        if (downstream < 0) downstream = 0;

        // Rule 5: Delay must never increase along any path
        if (downstream > currentDelay) {
          downstream = currentDelay;
        }

        // Rule 4: Ignore delays below 1 minute
        if (downstream < 1) continue;

        // Rule 3: Node keeps the MAX delay it has received, never the sum
        const currentTargetDelay = delays.get(edge.to) ?? 0;
        if (downstream > currentTargetDelay) {
          delays.set(edge.to, downstream);
          events.push({
            step: depth + 1,
            from: u,
            to: edge.to,
            minutes: downstream,
          });
          queue.push({ nodeId: edge.to, depth: depth + 1 });
        }
      }
    }
  }

  return { delays, events };
}

/**
 * Propagate delay through a network from a single injection point.
 * Returns the final delay per node.
 */
export function propagate(
  network: Network,
  injection: DelayInjection,
  rng: RNG
): Map<string, number> {
  return propagateWithEvents(network, injection, rng).delays;
}
