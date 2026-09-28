import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { SAMPLE_NETWORK } from '../src/engine/network';
import { Network } from '../src/engine/types';
import { simulate } from '../src/engine/simulate';
import { SCENARIOS, applyOverrides } from '../src/analysis/scenarios';
import { mean, median, percentile } from '../src/analysis/stats';
import {
  getDb,
  insertSimulation,
  listSimulations,
  getSimulation,
  deleteSimulation,
  getCriticalityAnalysis,
  saveCriticalityAnalysis,
  createCustomScenario,
  listCustomScenarios,
  getCustomScenario,
  updateCustomScenario,
  deleteCustomScenario,
} from './db';
import {
  validateSimulationBody,
  validateCriticalityBody,
  validateCustomScenarioBody,
  isValidObjectId,
} from './validate';

export const routes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /api/health -> { ok: true, db: "up" | "down" }
  app.get('/api/health', async () => {
    try {
      const db = getDb();
      await db.command({ ping: 1 });
      return { ok: true, db: 'up' };
    } catch {
      return { ok: true, db: 'down' };
    }
  });

  // GET /api/network -> SAMPLE_NETWORK
  app.get('/api/network', async () => {
    return SAMPLE_NETWORK;
  });

  // GET /api/scenarios -> id, name, description, injection (no functions)
  app.get('/api/scenarios', async () => {
    return SCENARIOS.map(({ id, name, description, injection }) => ({
      id,
      name,
      description,
      injection,
    }));
  });

  // POST /api/simulations -> run simulation, store, return 201
  app.post('/api/simulations', async (request, reply) => {
    const validation = validateSimulationBody(request.body);
    if (!validation.success) {
      return reply.status(400).send({
        error: validation.error,
        field: validation.field,
      });
    }

    const { nodeId, minutes, seed, runs, scenarioId, customScenarioId } = validation.data;

    // Build base network copy
    let net: Network = {
      nodes: SAMPLE_NETWORK.nodes.map((n) => ({ ...n, line: [...n.line] })),
      edges: SAMPLE_NETWORK.edges.map((e) => ({ ...e })),
    };

    if (customScenarioId) {
      const customScenario = await getCustomScenario(customScenarioId);
      if (!customScenario) {
        return reply.status(404).send({
          error: 'Custom scenario not found',
          field: 'customScenarioId',
        });
      }
      net = applyOverrides(net, customScenario.overrides);
    } else if (scenarioId) {
      const scenario = SCENARIOS.find((s) => s.id === scenarioId);
      if (scenario?.modifyNetwork) {
        net = scenario.modifyNetwork(net);
      }
    }

    const simRes = simulate(net, { nodeId, minutes }, runs, seed);

    const meanVal = mean(simRes.totals);
    const medianVal = median(simRes.totals);
    const p95Val = percentile(simRes.totals, 0.95);
    const maxVal = Math.max(...simRes.totals, 0);
    const meanAffected = mean(simRes.affectedCounts);
    const noSpreadCount = simRes.affectedCounts.filter((c) => c === 1).length;
    const pNoSpread = runs > 0 ? noSpreadCount / runs : 0;

    const inserted = await insertSimulation({
      params: {
        nodeId,
        minutes,
        seed,
        runs,
        scenarioId: customScenarioId || scenarioId || null,
      },
      stats: {
        mean: meanVal,
        median: medianVal,
        p95: p95Val,
        max: maxVal,
        meanAffected,
        pNoSpread,
      },
      totals: simRes.totals,
      perNodeHitRate: simRes.perNodeHitRate,
    });

    return reply.status(201).send(inserted);
  });

  // GET /api/simulations/compare?a=<id>&b=<id>
  app.get('/api/simulations/compare', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const { a, b } = query;

    if (!a || !isValidObjectId(a)) {
      return reply.status(400).send({
        error: 'Query parameter "a" must be a valid ObjectId',
        field: 'a',
      });
    }

    if (!b || !isValidObjectId(b)) {
      return reply.status(400).send({
        error: 'Query parameter "b" must be a valid ObjectId',
        field: 'b',
      });
    }

    if (a === b) {
      return reply.status(400).send({
        error: 'Cannot compare a simulation to itself: a and b must differ',
        field: 'b',
      });
    }

    const docA = await getSimulation(a);
    const docB = await getSimulation(b);

    if (!docA || !docB) {
      return reply.status(404).send({
        error: 'One or both simulation records not found',
      });
    }

    const delta = {
      mean: docB.stats.mean - docA.stats.mean,
      median: docB.stats.median - docA.stats.median,
      p95: docB.stats.p95 - docA.stats.p95,
      max: docB.stats.max - docA.stats.max,
      meanAffected: docB.stats.meanAffected - docA.stats.meanAffected,
      pNoSpread: docB.stats.pNoSpread - docA.stats.pNoSpread,
    };

    return {
      a: docA,
      b: docB,
      delta,
    };
  });

  // GET /api/simulations -> summaries only, newest first, ?limit default 20, max 100
  app.get('/api/simulations', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const limit = query?.limit ? parseInt(query.limit, 10) : 20;
    const safeLimit = isNaN(limit) ? 20 : limit;

    return await listSimulations(safeLimit);
  });

  // GET /api/simulations/:id -> full document
  app.get('/api/simulations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!isValidObjectId(id)) {
      return reply.status(400).send({
        error: 'Invalid ObjectId parameter',
        field: 'id',
      });
    }

    const doc = await getSimulation(id);
    if (!doc) {
      return reply.status(404).send({
        error: 'Simulation not found',
      });
    }

    return doc;
  });

  // DELETE /api/simulations/:id -> 204, 404 if missing, 400 if invalid ObjectId
  app.delete('/api/simulations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!isValidObjectId(id)) {
      return reply.status(400).send({
        error: 'Invalid ObjectId parameter',
        field: 'id',
      });
    }

    const deleted = await deleteSimulation(id);
    if (!deleted) {
      return reply.status(404).send({
        error: 'Simulation not found',
      });
    }

    return reply.status(204).send();
  });

  // POST /api/analysis/criticality -> node criticality sweep
  app.post('/api/analysis/criticality', async (request, reply) => {
    const validation = validateCriticalityBody(request.body);
    if (!validation.success) {
      return reply.status(400).send({
        error: validation.error,
        field: validation.field,
      });
    }

    const { minutes, seed, runs, scenarioId } = validation.data;
    const cacheParams = {
      minutes,
      seed,
      runs,
      scenarioId: scenarioId ?? null,
    };

    const cached = await getCriticalityAnalysis(cacheParams);
    if (cached) {
      return {
        results: cached,
        cached: true,
      };
    }

    // Prepare network
    let net: Network = {
      nodes: SAMPLE_NETWORK.nodes.map((n) => ({ ...n, line: [...n.line] })),
      edges: SAMPLE_NETWORK.edges.map((e) => ({ ...e })),
    };

    if (scenarioId) {
      const scenario = SCENARIOS.find((s) => s.id === scenarioId);
      if (scenario?.modifyNetwork) {
        net = scenario.modifyNetwork(net);
      } else if (isValidObjectId(scenarioId)) {
        const custom = await getCustomScenario(scenarioId);
        if (custom) {
          net = applyOverrides(net, custom.overrides);
        }
      }
    }

    const results = net.nodes.map((node, nodeIndex) => {
      const nodeSeed = seed + nodeIndex * 100000;
      const simRes = simulate(net, { nodeId: node.id, minutes }, runs, nodeSeed);
      return {
        nodeId: node.id,
        meanTotal: mean(simRes.totals),
        meanAffected: mean(simRes.affectedCounts),
        p95: percentile(simRes.totals, 0.95),
      };
    });

    // Sort descending by meanTotal
    results.sort((a, b) => b.meanTotal - a.meanTotal);

    await saveCriticalityAnalysis(cacheParams, results);

    return {
      results,
      cached: false,
    };
  });

  // ---------------- Custom Scenarios Endpoints ----------------

  // GET /api/custom-scenarios
  app.get('/api/custom-scenarios', async () => {
    return await listCustomScenarios();
  });

  // POST /api/custom-scenarios
  app.post('/api/custom-scenarios', async (request, reply) => {
    const validation = validateCustomScenarioBody(request.body);
    if (!validation.success) {
      return reply.status(400).send({
        error: validation.error,
        field: validation.field,
      });
    }

    try {
      const created = await createCustomScenario(validation.data);
      return reply.status(201).send(created);
    } catch (err: any) {
      if (err.code === 11000) {
        return reply.status(409).send({
          error: 'A custom scenario with this name already exists',
          field: 'name',
        });
      }
      throw err;
    }
  });

  // GET /api/custom-scenarios/:id
  app.get('/api/custom-scenarios/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!isValidObjectId(id)) {
      return reply.status(400).send({
        error: 'Invalid ObjectId parameter',
        field: 'id',
      });
    }

    const doc = await getCustomScenario(id);
    if (!doc) {
      return reply.status(404).send({
        error: 'Custom scenario not found',
      });
    }

    return doc;
  });

  // PUT /api/custom-scenarios/:id
  app.put('/api/custom-scenarios/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!isValidObjectId(id)) {
      return reply.status(400).send({
        error: 'Invalid ObjectId parameter',
        field: 'id',
      });
    }

    const validation = validateCustomScenarioBody(request.body);
    if (!validation.success) {
      return reply.status(400).send({
        error: validation.error,
        field: validation.field,
      });
    }

    try {
      const updated = await updateCustomScenario(id, validation.data);
      if (!updated) {
        return reply.status(404).send({
          error: 'Custom scenario not found',
        });
      }
      return updated;
    } catch (err: any) {
      if (err.code === 11000) {
        return reply.status(409).send({
          error: 'A custom scenario with this name already exists',
          field: 'name',
        });
      }
      throw err;
    }
  });

  // DELETE /api/custom-scenarios/:id
  app.delete('/api/custom-scenarios/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!isValidObjectId(id)) {
      return reply.status(400).send({
        error: 'Invalid ObjectId parameter',
        field: 'id',
      });
    }

    const deleted = await deleteCustomScenario(id);
    if (!deleted) {
      return reply.status(404).send({
        error: 'Custom scenario not found',
      });
    }

    return reply.status(204).send();
  });
};
