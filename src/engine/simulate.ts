import { Network, DelayInjection, SimulationSummary } from './types';
import { mulberry32 } from './rng';
import { propagate } from './propagate';

/**
 * Monte Carlo simulation runner for network delay cascades.
 *
 * @param network Rail network definition
 * @param injection Delay injection configuration
 * @param runs Total number of Monte Carlo runs
 * @param seed Initial random seed; run i uses seed + i
 */
export function simulate(
  network: Network,
  injection: DelayInjection,
  runs: number,
  seed: number
): SimulationSummary {
  const totals: number[] = new Array(runs);
  const affectedCounts: number[] = new Array(runs);

  const perNodeSum: Record<string, number> = {};
  const perNodeHits: Record<string, number> = {};

  for (const node of network.nodes) {
    perNodeSum[node.id] = 0;
    perNodeHits[node.id] = 0;
  }

  for (let i = 0; i < runs; i++) {
    const rng = mulberry32(seed + i);
    const delays = propagate(network, injection, rng);

    let runTotal = 0;
    let affected = 0;
    for (const d of delays.values()) {
      runTotal += d;
      if (d >= 1) {
        affected++;
      }
    }
    totals[i] = runTotal;
    affectedCounts[i] = affected;

    for (const node of network.nodes) {
      const d = delays.get(node.id) ?? 0;
      if (d > 0) {
        perNodeSum[node.id] += d;
        perNodeHits[node.id] += 1;
      }
    }
  }

  const perNodeMean: Record<string, number> = {};
  const perNodeHitRate: Record<string, number> = {};

  for (const node of network.nodes) {
    perNodeMean[node.id] = runs > 0 ? perNodeSum[node.id] / runs : 0;
    perNodeHitRate[node.id] = runs > 0 ? perNodeHits[node.id] / runs : 0;
  }

  return {
    totals,
    perNodeMean,
    perNodeHitRate,
    affectedCounts,
  };
}
