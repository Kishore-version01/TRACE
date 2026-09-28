import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAnimator } from './animate';
import { getNodeDelayColor, NetworkRenderer } from './render';
import { PropagationEvent } from '../engine/types';

describe('UI Animation and Rendering Guarantees', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getNodeDelayColor is monotonic: higher delays are progressively warmer/redder', () => {
    function parseRgb(colorStr: string): [number, number, number] {
      const match = colorStr.match(/\d+/g);
      if (!match) return [0, 0, 0];
      return [Number(match[0]), Number(match[1]), Number(match[2])];
    }

    // Measure warmth index: Red channel minus Green channel
    let prevWarmth = -Infinity;
    for (let minutes = 0; minutes <= 60; minutes++) {
      const [r, g] = parseRgb(getNodeDelayColor(minutes));
      const warmth = r - g;
      expect(warmth).toBeGreaterThanOrEqual(prevWarmth);
      prevWarmth = warmth;
    }
  });

  it('cancel mid-animation leaves zero leftover color / no stale callbacks execute', () => {
    const delayCalls: Array<{ id: string; minutes: number }> = [];

    const mockRenderer: NetworkRenderer = {
      setNodeDelay: (id, minutes) => {
        delayCalls.push({ id, minutes });
      },
      reset: () => {
        delayCalls.length = 0;
      },
      setSelectedNode: () => {},
      highlightEdge: () => {},
      clearEdgeHighlights: () => {},
      applyHeatmap: () => {},
      clearHeatmap: () => {},
      applyCriticalityRings: () => {},
      clearCriticalityRings: () => {},
      setSelectedEdge: () => {},
      updateNetwork: () => {},
    };

    const animator = createAnimator(mockRenderer);

    const events: PropagationEvent[] = [
      { step: 0, from: null, to: 'J1', minutes: 50 },
      { step: 1, from: 'J1', to: 'R2', minutes: 40 },
      { step: 2, from: 'R2', to: 'R1', minutes: 30 },
      { step: 3, from: 'R1', to: 'R4', minutes: 20 },
    ];

    // Play at 100ms per step (Fast)
    animator.play(events, 100);

    // Step 0 executes synchronously on start
    expect(delayCalls).toEqual([{ id: 'J1', minutes: 50 }]);

    // Advance by 100ms to trigger Step 1
    vi.advanceTimersByTime(100);
    expect(delayCalls.length).toBe(2);
    expect(delayCalls[1]).toEqual({ id: 'R2', minutes: 40 });

    // Mid-animation: cancel and reset!
    animator.cancel();
    mockRenderer.reset();
    expect(delayCalls.length).toBe(0);

    // Advance time far into the future (500ms)
    vi.advanceTimersByTime(500);

    // Ensure NO callbacks fired and NO stale delay updates occurred
    expect(delayCalls.length).toBe(0);
  });

  it('animation is driven by step values: all events in the same step animate together', () => {
    const stepSnapshots: Array<Array<{ id: string; minutes: number }>> = [];
    let currentBatch: Array<{ id: string; minutes: number }> = [];

    const mockRenderer: NetworkRenderer = {
      setNodeDelay: (id, minutes) => {
        currentBatch.push({ id, minutes });
      },
      reset: () => {},
      setSelectedNode: () => {},
      highlightEdge: () => {},
      clearEdgeHighlights: () => {
        if (currentBatch.length > 0) {
          stepSnapshots.push([...currentBatch]);
          currentBatch = [];
        }
      },
      applyHeatmap: () => {},
      clearHeatmap: () => {},
      applyCriticalityRings: () => {},
      clearCriticalityRings: () => {},
      setSelectedEdge: () => {},
      updateNetwork: () => {},
    };

    const animator = createAnimator(mockRenderer);

    const events: PropagationEvent[] = [
      { step: 0, from: null, to: 'J1', minutes: 60 },
      // Step 1 has 3 branches expanding in parallel
      { step: 1, from: 'J1', to: 'R2', minutes: 50 },
      { step: 1, from: 'J1', to: 'R3', minutes: 50 },
      { step: 1, from: 'J1', to: 'B2', minutes: 52 },
      // Step 2 has 2 branches
      { step: 2, from: 'B2', to: 'J2', minutes: 42 },
      { step: 2, from: 'R3', to: 'R4', minutes: 38 },
    ];

    animator.play(events, 100);

    // Step 0 executed
    expect(currentBatch).toEqual([{ id: 'J1', minutes: 60 }]);

    // Advance 100ms -> Step 1 should execute all 3 events together
    vi.advanceTimersByTime(100);
    expect(stepSnapshots[0]).toEqual([{ id: 'J1', minutes: 60 }]);
    expect(currentBatch).toEqual([
      { id: 'R2', minutes: 50 },
      { id: 'R3', minutes: 50 },
      { id: 'B2', minutes: 52 },
    ]);

    // Advance 100ms -> Step 2 should execute both events together
    vi.advanceTimersByTime(100);
    expect(stepSnapshots[1]).toEqual([
      { id: 'R2', minutes: 50 },
      { id: 'R3', minutes: 50 },
      { id: 'B2', minutes: 52 },
    ]);
    expect(currentBatch).toEqual([
      { id: 'J2', minutes: 42 },
      { id: 'R4', minutes: 38 },
    ]);
  });
});
