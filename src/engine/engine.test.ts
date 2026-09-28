import { describe, it, expect } from 'vitest';
import { Network } from './types';
import { mulberry32 } from './rng';
import { SAMPLE_NETWORK } from './network';
import { propagate, propagateWithEvents } from './propagate';
import { simulate } from './simulate';

describe('Propagation Engine', () => {
  it('same seed -> identical output', () => {
    const injection = { nodeId: 'J1', minutes: 45 };
    const seed = 123456;
    const runs = 100;

    const res1 = simulate(SAMPLE_NETWORK, injection, runs, seed);
    const res2 = simulate(SAMPLE_NETWORK, injection, runs, seed);

    expect(res1.totals).toEqual(res2.totals);
    expect(res1.perNodeMean).toEqual(res2.perNodeMean);
    expect(res1.perNodeHitRate).toEqual(res2.perNodeHitRate);
  });

  it('zero-minute injection delays nothing', () => {
    const rng = mulberry32(42);
    const result = propagate(SAMPLE_NETWORK, { nodeId: 'J1', minutes: 0 }, rng);
    expect(result.size).toBe(0);

    const sim = simulate(SAMPLE_NETWORK, { nodeId: 'J1', minutes: 0 }, 10, 42);
    expect(sim.totals.every((total) => total === 0)).toBe(true);
    for (const node of SAMPLE_NETWORK.nodes) {
      expect(sim.perNodeMean[node.id]).toBe(0);
      expect(sim.perNodeHitRate[node.id]).toBe(0);
    }
  });

  it('p=0 on all edges -> only the injected node is delayed', () => {
    const customNetwork: Network = {
      nodes: [
        { id: 'S1', name: 'Station 1', kind: 'station', line: ['L1'] },
        { id: 'S2', name: 'Station 2', kind: 'station', line: ['L1'] },
        { id: 'S3', name: 'Station 3', kind: 'station', line: ['L1'] },
      ],
      edges: [
        { from: 'S1', to: 'S2', p: 0, damping: 1, slack: 0 },
        { from: 'S2', to: 'S3', p: 0, damping: 1, slack: 0 },
      ],
    };

    const rng = mulberry32(100);
    const result = propagate(customNetwork, { nodeId: 'S1', minutes: 30 }, rng);

    expect(result.size).toBe(1);
    expect(result.get('S1')).toBe(30);
    expect(result.has('S2')).toBe(false);
    expect(result.has('S3')).toBe(false);
  });

  it('p=1, damping=1, slack=0 on a line -> delay reaches every reachable node at full value', () => {
    const lineNetwork: Network = {
      nodes: [
        { id: 'N1', name: 'Node 1', kind: 'station', line: ['L1'] },
        { id: 'N2', name: 'Node 2', kind: 'station', line: ['L1'] },
        { id: 'N3', name: 'Node 3', kind: 'station', line: ['L1'] },
        { id: 'N4', name: 'Node 4', kind: 'station', line: ['L1'] },
      ],
      edges: [
        { from: 'N1', to: 'N2', p: 1, damping: 1, slack: 0 },
        { from: 'N2', to: 'N3', p: 1, damping: 1, slack: 0 },
        { from: 'N3', to: 'N4', p: 1, damping: 1, slack: 0 },
      ],
    };

    const rng = mulberry32(42);
    const injectedDelay = 50;
    const result = propagate(lineNetwork, { nodeId: 'N1', minutes: injectedDelay }, rng);

    expect(result.get('N1')).toBe(50);
    expect(result.get('N2')).toBe(50);
    expect(result.get('N3')).toBe(50);
    expect(result.get('N4')).toBe(50);
  });

  it('slack larger than the delay blocks propagation', () => {
    const net: Network = {
      nodes: [
        { id: 'A', name: 'Station A', kind: 'station', line: ['L1'] },
        { id: 'B', name: 'Station B', kind: 'station', line: ['L1'] },
      ],
      edges: [{ from: 'A', to: 'B', p: 1, damping: 1, slack: 30 }],
    };

    const rng = mulberry32(42);
    // Injected delay of 20 is smaller than slack of 30: max(0, 20 - 30) = 0
    const result = propagate(net, { nodeId: 'A', minutes: 20 }, rng);

    expect(result.get('A')).toBe(20);
    expect(result.has('B')).toBe(false);
  });

  it('no node ever exceeds the injected delay', () => {
    const initialDelay = 45;
    for (let s = 1; s <= 50; s++) {
      const rng = mulberry32(s);
      const result = propagate(SAMPLE_NETWORK, { nodeId: 'J1', minutes: initialDelay }, rng);
      for (const [, delay] of result.entries()) {
        expect(delay).toBeLessThanOrEqual(initialDelay);
      }
    }
  });

  it('terminates on the cyclic sample network', () => {
    const injection = { nodeId: 'J1', minutes: 90 };
    const rng = mulberry32(999);
    // SAMPLE_NETWORK contains cycles (bidirectional edges and loop on Red line)
    const result = propagate(SAMPLE_NETWORK, injection, rng);
    expect(result.size).toBeGreaterThan(0);
    expect(result.has('J1')).toBe(true);
  });

  it('500 runs on SAMPLE_NETWORK completes in under 200 ms', () => {
    const start = performance.now();
    const res = simulate(SAMPLE_NETWORK, { nodeId: 'J1', minutes: 60 }, 500, 42);
    const duration = performance.now() - start;

    expect(res.totals.length).toBe(500);
    expect(duration).toBeLessThan(200);
  });

  describe('propagateWithEvents', () => {
    it('identical delays for the same seed compared to propagate()', () => {
      const injection = { nodeId: 'J1', minutes: 35 };
      for (let s = 1; s <= 20; s++) {
        const rng1 = mulberry32(s);
        const rng2 = mulberry32(s);
        const delaysFromPropagate = propagate(SAMPLE_NETWORK, injection, rng1);
        const { delays: delaysFromEvents } = propagateWithEvents(SAMPLE_NETWORK, injection, rng2);

        expect(Array.from(delaysFromEvents.entries())).toEqual(
          Array.from(delaysFromPropagate.entries())
        );
      }
    });

    it('events are ordered by non-decreasing step', () => {
      const injection = { nodeId: 'J2', minutes: 50 };
      for (let s = 1; s <= 20; s++) {
        const rng = mulberry32(s);
        const { events } = propagateWithEvents(SAMPLE_NETWORK, injection, rng);

        for (let i = 1; i < events.length; i++) {
          expect(events[i].step).toBeGreaterThanOrEqual(events[i - 1].step);
        }
      }
    });

    it("every event's minutes equals the delay it assigned", () => {
      const injection = { nodeId: 'J1', minutes: 40 };
      for (let s = 1; s <= 20; s++) {
        const rng = mulberry32(s);
        const { delays, events } = propagateWithEvents(SAMPLE_NETWORK, injection, rng);

        // Track delays as events are played
        const simulatedDelays = new Map<string, number>();
        for (const ev of events) {
          // The event assigns ev.minutes to node ev.to
          simulatedDelays.set(ev.to, ev.minutes);
        }

        // Final simulated delays must match the returned final delays
        expect(Array.from(simulatedDelays.entries())).toEqual(Array.from(delays.entries()));
      }
    });
  });

  describe('UI & Animation Guarantees', () => {
    it('running the same seed twice produces identical event sequences and delays', () => {
      for (const node of SAMPLE_NETWORK.nodes) {
        const injection = { nodeId: node.id, minutes: 40 };
        const seed = 777;
        const run1 = propagateWithEvents(SAMPLE_NETWORK, injection, mulberry32(seed));
        const run2 = propagateWithEvents(SAMPLE_NETWORK, injection, mulberry32(seed));

        expect(run1.events).toEqual(run2.events);
        expect(Array.from(run1.delays.entries())).toEqual(Array.from(run2.delays.entries()));
      }
    });

    it('delay never grows along any path at 60 minutes injection (downstream <= upstream)', () => {
      for (const node of SAMPLE_NETWORK.nodes) {
        const injection = { nodeId: node.id, minutes: 60 };
        for (let s = 1; s <= 10; s++) {
          const { events } = propagateWithEvents(SAMPLE_NETWORK, injection, mulberry32(s));
          const nodeDelayAtStep = new Map<string, number>();

          for (const ev of events) {
            if (ev.from !== null) {
              const upstreamDelay = nodeDelayAtStep.get(ev.from) ?? 0;
              // Downstream delay cannot exceed upstream delay
              expect(ev.minutes).toBeLessThanOrEqual(upstreamDelay);
            }
            nodeDelayAtStep.set(ev.to, ev.minutes);
          }
        }
      }
    });

    it('simulate() returns identical affectedCounts for the same seed', () => {
      const injection = { nodeId: 'J1', minutes: 30 };
      const res1 = simulate(SAMPLE_NETWORK, injection, 50, 42);
      const res2 = simulate(SAMPLE_NETWORK, injection, 50, 42);

      expect(res1.affectedCounts).toBeDefined();
      expect(res1.affectedCounts).toEqual(res2.affectedCounts);
      expect(res1.affectedCounts.length).toBe(50);
    });

    it('affectedCounts[i] >= 1 whenever injected minutes >= 1, and 0 when 0 min', () => {
      const injection = { nodeId: 'R1', minutes: 15 };
      const res = simulate(SAMPLE_NETWORK, injection, 50, 99);

      for (const count of res.affectedCounts) {
        expect(count).toBeGreaterThanOrEqual(1);
        expect(count).toBeLessThanOrEqual(SAMPLE_NETWORK.nodes.length);
      }

      const zeroRes = simulate(SAMPLE_NETWORK, { nodeId: 'R1', minutes: 0 }, 20, 99);
      for (const count of zeroRes.affectedCounts) {
        expect(count).toBe(0);
      }
    });
  });
});
