import { PropagationEvent } from '../engine/types';
import { NetworkRenderer } from './render';

export interface Animator {
  play(events: PropagationEvent[], stepDurationMs?: number, onComplete?: () => void): void;
  skipToEnd(): void;
  cancel(): void;
  isPlaying(): boolean;
}

export function createAnimator(renderer: NetworkRenderer): Animator {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let animGeneration = 0;
  let activeEvents: PropagationEvent[] = [];
  let onCompleteCb: (() => void) | null = null;
  let playing = false;

  function clearTimer() {
    if (timerId !== null) {
      globalThis.clearTimeout(timerId);
      timerId = null;
    }
  }

  function cancel() {
    // Invalidate any current or queued animation step
    animGeneration++;
    clearTimer();
    renderer.clearEdgeHighlights();
    playing = false;
    activeEvents = [];
    onCompleteCb = null;
  }

  function skipToEnd() {
    if (!playing) return;
    const currentGen = animGeneration;
    clearTimer();
    renderer.clearEdgeHighlights();

    // Immediately apply all remaining events in step order
    for (const ev of activeEvents) {
      renderer.setNodeDelay(ev.to, ev.minutes);
    }

    playing = false;
    activeEvents = [];
    const cb = onCompleteCb;
    onCompleteCb = null;
    if (currentGen === animGeneration) {
      cb?.();
    }
  }

  function play(
    events: PropagationEvent[],
    stepDurationMs: number = 400,
    onComplete?: () => void
  ) {
    cancel();

    const currentGen = ++animGeneration;
    activeEvents = events;
    onCompleteCb = onComplete || null;

    // Group all events strictly by their step value (BFS depth wave)
    const stepsMap = new Map<number, PropagationEvent[]>();
    for (const ev of events) {
      let list = stepsMap.get(ev.step);
      if (!list) {
        list = [];
        stepsMap.set(ev.step, list);
      }
      list.push(ev);
    }

    const stepKeys = Array.from(stepsMap.keys()).sort((a, b) => a - b);
    let currentStepIdx = 0;

    if (stepKeys.length === 0) {
      onComplete?.();
      return;
    }

    playing = true;

    function step() {
      // Stale check: if cancelled or new animation started, abort immediately
      if (currentGen !== animGeneration || !playing) {
        return;
      }

      if (currentStepIdx >= stepKeys.length) {
        renderer.clearEdgeHighlights();
        playing = false;
        activeEvents = [];
        const cb = onCompleteCb;
        onCompleteCb = null;
        cb?.();
        return;
      }

      renderer.clearEdgeHighlights();
      const currentEvents = stepsMap.get(stepKeys[currentStepIdx]) ?? [];

      // All events with the same step animate together in one wave
      for (const ev of currentEvents) {
        renderer.setNodeDelay(ev.to, ev.minutes);
        if (ev.from) {
          renderer.highlightEdge(ev.from, ev.to);
        }
      }

      currentStepIdx++;
      timerId = globalThis.setTimeout(step, stepDurationMs);
    }

    step();
  }

  return {
    play,
    skipToEnd,
    cancel,
    isPlaying: () => playing,
  };
}
