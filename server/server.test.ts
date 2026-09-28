import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { buildApp } from './index';
import { closeDb } from './db';

describe('Backend API Server', () => {
  let app: FastifyInstance;
  let mongod: MongoMemoryServer;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    app = await buildApp({
      dbUri: uri,
      dbName: 'cascade_test',
      enableRateLimit: false, // avoid rate limiting during automated test suite
    });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await closeDb();
    if (mongod) await mongod.stop();
  });

  it('health reports db "up"', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ ok: true, db: 'up' });
  });

  it('GET /api/network returns SAMPLE_NETWORK', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/network',
    });
    expect(res.statusCode).toBe(200);
    const network = res.json();
    expect(network.nodes.length).toBe(12);
  });

  it('GET /api/scenarios returns scenarios without functions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/scenarios',
    });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list.length).toBe(3);
    for (const item of list) {
      expect(item.id).toBeDefined();
      expect(item.name).toBeDefined();
      expect(item.description).toBeDefined();
      expect(item.injection).toBeDefined();
      expect(item.modifyNetwork).toBeUndefined();
    }
  });

  it('POST valid -> 201 and a document exists; same body twice -> identical stats', async () => {
    const payload = {
      nodeId: 'R1',
      minutes: 15,
      seed: 42,
      runs: 500,
      scenarioId: 'single-late-rake',
    };

    const res1 = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload,
    });
    expect(res1.statusCode).toBe(201);
    const doc1 = res1.json();
    expect(doc1.id).toBeDefined();
    expect(doc1.stats).toBeDefined();
    expect(doc1.totals.length).toBe(500);

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload,
    });
    expect(res2.statusCode).toBe(201);
    const doc2 = res2.json();

    // Two distinct documents
    expect(doc2.id).not.toBe(doc1.id);
    // Identical deterministic stats
    expect(doc2.stats).toEqual(doc1.stats);
    expect(doc2.totals).toEqual(doc1.totals);
  });

  it('400s: unknown nodeId, minutes 0 and 61, runs 123, body key "$where", malformed id', async () => {
    // unknown nodeId
    const r1 = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload: { nodeId: 'UNKNOWN_XYZ', minutes: 10, seed: 1, runs: 500 },
    });
    expect(r1.statusCode).toBe(400);
    expect(r1.json().field).toBe('nodeId');

    // minutes 0
    const r2 = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload: { nodeId: 'R1', minutes: 0, seed: 1, runs: 500 },
    });
    expect(r2.statusCode).toBe(400);
    expect(r2.json().field).toBe('minutes');

    // minutes 61
    const r3 = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload: { nodeId: 'R1', minutes: 61, seed: 1, runs: 500 },
    });
    expect(r3.statusCode).toBe(400);
    expect(r3.json().field).toBe('minutes');

    // runs 123 (must be one of 100, 500, 2000, 5000)
    const r4 = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload: { nodeId: 'R1', minutes: 10, seed: 1, runs: 123 },
    });
    expect(r4.statusCode).toBe(400);
    expect(r4.json().field).toBe('runs');

    // body key "$where"
    const r5 = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload: { nodeId: 'R1', minutes: 10, seed: 1, runs: 500, $where: 'evil()' },
    });
    expect(r5.statusCode).toBe(400);
    expect(r5.json().field).toBe('$where');

    // malformed id on GET
    const r6 = await app.inject({
      method: 'GET',
      url: '/api/simulations/invalid-hex-id',
    });
    expect(r6.statusCode).toBe(400);

    // malformed id on DELETE
    const r7 = await app.inject({
      method: 'DELETE',
      url: '/api/simulations/invalid-hex-id',
    });
    expect(r7.statusCode).toBe(400);
  });

  it('list is newest first and excludes totals; get by id returns full doc; unknown id -> 404', async () => {
    // Insert 2 simulations
    const p1 = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload: { nodeId: 'R1', minutes: 10, seed: 101, runs: 100 },
    });
    const doc1 = p1.json();

    const p2 = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload: { nodeId: 'J1', minutes: 20, seed: 102, runs: 100 },
    });
    const doc2 = p2.json();

    // List simulations
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/simulations?limit=10',
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.length).toBeGreaterThanOrEqual(2);

    // Newest first: doc2 should appear before doc1
    const idx2 = list.findIndex((x: any) => x.id === doc2.id);
    const idx1 = list.findIndex((x: any) => x.id === doc1.id);
    expect(idx2).toBeLessThan(idx1);

    // Summaries exclude totals and perNodeHitRate
    expect(list[0].totals).toBeUndefined();
    expect(list[0].perNodeHitRate).toBeUndefined();
    expect(list[0].stats).toBeDefined();

    // GET by id returns full doc including totals and perNodeHitRate
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/simulations/${doc1.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    const full = getRes.json();
    expect(full.id).toBe(doc1.id);
    expect(full.totals).toBeDefined();
    expect(full.perNodeHitRate).toBeDefined();

    // Unknown valid ObjectId -> 404
    const notFoundRes = await app.inject({
      method: 'GET',
      url: '/api/simulations/507f1f77bcf86cd799439011',
    });
    expect(notFoundRes.statusCode).toBe(404);
  });

  it('delete removes it; second delete -> 404', async () => {
    const postRes = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload: { nodeId: 'B1', minutes: 15, seed: 200, runs: 100 },
    });
    const id = postRes.json().id;

    // First delete -> 204
    const del1 = await app.inject({
      method: 'DELETE',
      url: `/api/simulations/${id}`,
    });
    expect(del1.statusCode).toBe(204);

    // GET now returns 404
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/simulations/${id}`,
    });
    expect(getRes.statusCode).toBe(404);

    // Second delete -> 404
    const del2 = await app.inject({
      method: 'DELETE',
      url: `/api/simulations/${id}`,
    });
    expect(del2.statusCode).toBe(404);
  });

  it('"Junction failure" gives a higher mean than "Single late rake" at the same seed', async () => {
    const seed = 999;
    const runs = 500;

    const rakeRes = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload: {
        nodeId: 'R1',
        minutes: 15,
        seed,
        runs,
        scenarioId: 'single-late-rake',
      },
    });
    const rakeDoc = rakeRes.json();

    const juncRes = await app.inject({
      method: 'POST',
      url: '/api/simulations',
      payload: {
        nodeId: 'J1',
        minutes: 30,
        seed,
        runs,
        scenarioId: 'junction-failure',
      },
    });
    const juncDoc = juncRes.json();

    expect(juncDoc.stats.mean).toBeGreaterThan(rakeDoc.stats.mean);
  });

  describe('Feature 1: Node Criticality Sweep', () => {
    it('returns all 12 nodes sorted descending by meanTotal and caches second call', async () => {
      const payload = {
        minutes: 20,
        seed: 12345,
        runs: 100,
      };

      const res1 = await app.inject({
        method: 'POST',
        url: '/api/analysis/criticality',
        payload,
      });

      expect(res1.statusCode).toBe(200);
      const data1 = res1.json();
      expect(data1.cached).toBe(false);
      expect(data1.results.length).toBe(12);

      // Verify each item structure and descending sort order
      for (let i = 0; i < data1.results.length; i++) {
        const item = data1.results[i];
        expect(typeof item.nodeId).toBe('string');
        expect(typeof item.meanTotal).toBe('number');
        expect(typeof item.meanAffected).toBe('number');
        expect(typeof item.p95).toBe('number');
        if (i > 0) {
          expect(item.meanTotal).toBeLessThanOrEqual(data1.results[i - 1].meanTotal);
        }
      }

      // Second call with same params should be cached
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/analysis/criticality',
        payload,
      });

      expect(res2.statusCode).toBe(200);
      const data2 = res2.json();
      expect(data2.cached).toBe(true);
      expect(data2.results).toEqual(data1.results);
    });

    it('rejects invalid runs (e.g. 2000) or missing fields with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/analysis/criticality',
        payload: {
          minutes: 20,
          seed: 123,
          runs: 2000, // only 100 | 500 allowed
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().field).toBe('runs');
    });
  });

  describe('Feature 2: Compare Runs', () => {
    it('returns full docs for a and b, and accurate delta arithmetic', async () => {
      const rA = await app.inject({
        method: 'POST',
        url: '/api/simulations',
        payload: { nodeId: 'R1', minutes: 10, seed: 111, runs: 100 },
      });
      const docA = rA.json();

      const rB = await app.inject({
        method: 'POST',
        url: '/api/simulations',
        payload: { nodeId: 'J1', minutes: 30, seed: 111, runs: 100 },
      });
      const docB = rB.json();

      const cmpRes = await app.inject({
        method: 'GET',
        url: `/api/simulations/compare?a=${docA.id}&b=${docB.id}`,
      });

      expect(cmpRes.statusCode).toBe(200);
      const comparison = cmpRes.json();
      expect(comparison.a.id).toBe(docA.id);
      expect(comparison.b.id).toBe(docB.id);

      // Verify delta arithmetic: b - a
      expect(comparison.delta.mean).toBeCloseTo(docB.stats.mean - docA.stats.mean, 5);
      expect(comparison.delta.median).toBeCloseTo(docB.stats.median - docA.stats.median, 5);
      expect(comparison.delta.p95).toBeCloseTo(docB.stats.p95 - docA.stats.p95, 5);
      expect(comparison.delta.max).toBeCloseTo(docB.stats.max - docA.stats.max, 5);
      expect(comparison.delta.meanAffected).toBeCloseTo(docB.stats.meanAffected - docA.stats.meanAffected, 5);
      expect(comparison.delta.pNoSpread).toBeCloseTo(docB.stats.pNoSpread - docA.stats.pNoSpread, 5);
    });

    it('returns 400 when a === b, missing params, or malformed ObjectId', async () => {
      // a === b
      const resEqual = await app.inject({
        method: 'GET',
        url: '/api/simulations/compare?a=507f1f77bcf86cd799439011&b=507f1f77bcf86cd799439011',
      });
      expect(resEqual.statusCode).toBe(400);

      // missing b
      const resMissing = await app.inject({
        method: 'GET',
        url: '/api/simulations/compare?a=507f1f77bcf86cd799439011',
      });
      expect(resMissing.statusCode).toBe(400);

      // malformed id
      const resMalformed = await app.inject({
        method: 'GET',
        url: '/api/simulations/compare?a=invalid-id&b=507f1f77bcf86cd799439011',
      });
      expect(resMalformed.statusCode).toBe(400);
    });

    it('returns 404 when one or both IDs do not exist in the db', async () => {
      const res404 = await app.inject({
        method: 'GET',
        url: '/api/simulations/compare?a=507f1f77bcf86cd799439011&b=507f1f77bcf86cd799439022',
      });
      expect(res404.statusCode).toBe(404);
    });
  });

  describe('Feature 3: Custom Scenarios CRUD & Simulation', () => {
    let customId: string;

    it('POST /api/custom-scenarios creates scenario; duplicate name -> 409', async () => {
      const payload = {
        name: 'High Friction Red Corridor',
        description: 'Increase delay transfer along red line',
        injection: { nodeId: 'R1', minutes: 25 },
        overrides: [
          { from: 'R1', to: 'R2', p: 0.95, damping: 0.9, slack: 0 },
        ],
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/custom-scenarios',
        payload,
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.id).toBeDefined();
      expect(data.name).toBe(payload.name);
      expect(data.overrides.length).toBe(1);
      customId = data.id;

      // Duplicate name -> 409
      const dupRes = await app.inject({
        method: 'POST',
        url: '/api/custom-scenarios',
        payload,
      });
      expect(dupRes.statusCode).toBe(409);
    });

    it('validates invalid edge overrides and limit of 20 overrides', async () => {
      // Non-existent edge
      const badEdgeRes = await app.inject({
        method: 'POST',
        url: '/api/custom-scenarios',
        payload: {
          name: 'Non Existent Edge',
          injection: { nodeId: 'R1', minutes: 10 },
          overrides: [{ from: 'NONEXISTENT_A', to: 'NONEXISTENT_B', p: 0.5 }],
        },
      });
      expect(badEdgeRes.statusCode).toBe(400);

      // Overrides > 20
      const manyOverrides = Array.from({ length: 21 }, () => ({
        from: 'R1',
        to: 'R2',
        p: 0.5,
      }));
      const tooManyRes = await app.inject({
        method: 'POST',
        url: '/api/custom-scenarios',
        payload: {
          name: 'Too Many Overrides',
          injection: { nodeId: 'R1', minutes: 10 },
          overrides: manyOverrides,
        },
      });
      expect(tooManyRes.statusCode).toBe(400);
    });

    it('GET, PUT, and DELETE work for custom scenarios', async () => {
      // List
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/custom-scenarios',
      });
      expect(listRes.statusCode).toBe(200);
      const list = listRes.json();
      expect(list.some((s: any) => s.id === customId)).toBe(true);

      // Get by id
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/custom-scenarios/${customId}`,
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().name).toBe('High Friction Red Corridor');

      // PUT update
      const putRes = await app.inject({
        method: 'PUT',
        url: `/api/custom-scenarios/${customId}`,
        payload: {
          name: 'High Friction Red Corridor Updated',
          description: 'Updated description',
          injection: { nodeId: 'R2', minutes: 20 },
          overrides: [
            { from: 'R1', to: 'R2', p: 1.0, damping: 1.0, slack: 0 },
          ],
        },
      });
      expect(putRes.statusCode).toBe(200);
      expect(putRes.json().name).toBe('High Friction Red Corridor Updated');
    });

    it('POST /api/simulations with customScenarioId applies overrides and increases delay propagation', async () => {
      // Base simulation with R1 -> R2
      const seed = 777;
      const runs = 500;

      const baseRes = await app.inject({
        method: 'POST',
        url: '/api/simulations',
        payload: {
          nodeId: 'R1',
          minutes: 20,
          seed,
          runs,
        },
      });
      const baseDoc = baseRes.json();

      // Custom scenario simulation (where R1->R2 has p=1, damping=1, slack=0)
      const customSimRes = await app.inject({
        method: 'POST',
        url: '/api/simulations',
        payload: {
          nodeId: 'R1',
          minutes: 20,
          seed,
          runs,
          customScenarioId: customId,
        },
      });
      expect(customSimRes.statusCode).toBe(201);
      const customDoc = customSimRes.json();

      // Overriding R1->R2 to 100% transmission with no slack produces greater or equal cascade
      expect(customDoc.stats.mean).toBeGreaterThanOrEqual(baseDoc.stats.mean);
    });

    it('DELETE removes custom scenario, subsequent GET returns 404', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/custom-scenarios/${customId}`,
      });
      expect(delRes.statusCode).toBe(204);

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/custom-scenarios/${customId}`,
      });
      expect(getRes.statusCode).toBe(404);
    });
  });
});

