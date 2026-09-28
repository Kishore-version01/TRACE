import { MongoClient, Db, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { EdgeOverride } from '../src/analysis/scenarios';

dotenv.config();

export interface SimulationParams {
  nodeId: string;
  minutes: number;
  seed: number;
  runs: number;
  scenarioId: string | null;
}

export interface SimulationStats {
  mean: number;
  median: number;
  p95: number;
  max: number;
  meanAffected: number;
  pNoSpread: number;
}

export interface SimulationDoc {
  _id?: ObjectId;
  createdAt: Date;
  params: SimulationParams;
  stats: SimulationStats;
  totals: number[];
  perNodeHitRate: Record<string, number>;
}

export interface SimulationSummaryDoc {
  id: string;
  createdAt: Date;
  params: SimulationParams;
  stats: SimulationStats;
}

export interface FullSimulationResponse extends SimulationSummaryDoc {
  totals: number[];
  perNodeHitRate: Record<string, number>;
}

export interface NodeCriticalityResult {
  nodeId: string;
  meanTotal: number;
  meanAffected: number;
  p95: number;
}

export interface CriticalityParams {
  minutes: number;
  seed: number;
  runs: number;
  scenarioId: string | null;
}

export interface CriticalityDoc {
  _id?: ObjectId;
  params: CriticalityParams;
  results: NodeCriticalityResult[];
  createdAt: Date;
}

export interface CustomScenarioDoc {
  _id?: ObjectId;
  name: string;
  description: string;
  injection: {
    nodeId: string;
    minutes: number;
  };
  overrides: EdgeOverride[];
  createdAt: Date;
}

export interface CustomScenarioResponse {
  id: string;
  name: string;
  description: string;
  injection: {
    nodeId: string;
    minutes: number;
  };
  overrides: EdgeOverride[];
  createdAt: Date;
}

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connect(
  customUri?: string,
  customDbName?: string
): Promise<Db> {
  const uri = customUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const dbName = customDbName || process.env.DB_NAME || 'trace';

  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
    await ensureIndexes();
  }
  return db!;
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connect() first.');
  }
  return db;
}

export function getClient(): MongoClient | null {
  return client;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

export async function ensureIndexes(): Promise<void> {
  const database = getDb();

  // Simulations collection
  const simCol = database.collection('simulations');
  await simCol.createIndex({ createdAt: -1 });
  await simCol.createIndex({ 'params.scenarioId': 1 });

  // Analyses collection
  const analysesCol = database.collection('analyses');
  await analysesCol.createIndex(
    {
      'params.minutes': 1,
      'params.seed': 1,
      'params.runs': 1,
      'params.scenarioId': 1,
    },
    { unique: true }
  );

  // Custom Scenarios collection
  const scenariosCol = database.collection('scenarios');
  await scenariosCol.createIndex({ name: 1 }, { unique: true });
}

// ---------------- Simulations CRUD ----------------

export async function insertSimulation(
  sim: Omit<SimulationDoc, '_id' | 'createdAt'>
): Promise<FullSimulationResponse> {
  const database = getDb();
  const col = database.collection<SimulationDoc>('simulations');

  const doc: SimulationDoc = {
    ...sim,
    createdAt: new Date(),
  };

  const res = await col.insertOne(doc as any);
  return {
    id: res.insertedId.toString(),
    createdAt: doc.createdAt,
    params: doc.params,
    stats: doc.stats,
    totals: doc.totals,
    perNodeHitRate: doc.perNodeHitRate,
  };
}

export async function listSimulations(limit: number = 20): Promise<SimulationSummaryDoc[]> {
  const database = getDb();
  const col = database.collection<SimulationDoc>('simulations');

  const safeLimit = Math.max(1, Math.min(100, limit));

  const docs = await col
    .find({}, { projection: { totals: 0, perNodeHitRate: 0 } })
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .toArray();

  return docs.map((d) => ({
    id: d._id!.toString(),
    createdAt: d.createdAt,
    params: d.params,
    stats: d.stats,
  }));
}

export async function getSimulation(id: string): Promise<FullSimulationResponse | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  const database = getDb();
  const col = database.collection<SimulationDoc>('simulations');
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) {
    return null;
  }

  return {
    id: doc._id!.toString(),
    createdAt: doc.createdAt,
    params: doc.params,
    stats: doc.stats,
    totals: doc.totals,
    perNodeHitRate: doc.perNodeHitRate,
  };
}

export async function deleteSimulation(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) {
    return false;
  }

  const database = getDb();
  const col = database.collection<SimulationDoc>('simulations');
  const res = await col.deleteOne({ _id: new ObjectId(id) });
  return res.deletedCount === 1;
}

// ---------------- Criticality Analyses Cache ----------------

export async function getCriticalityAnalysis(
  params: CriticalityParams
): Promise<NodeCriticalityResult[] | null> {
  const database = getDb();
  const col = database.collection<CriticalityDoc>('analyses');
  const found = await col.findOne({
    'params.minutes': params.minutes,
    'params.seed': params.seed,
    'params.runs': params.runs,
    'params.scenarioId': params.scenarioId,
  });
  return found ? found.results : null;
}

export async function saveCriticalityAnalysis(
  params: CriticalityParams,
  results: NodeCriticalityResult[]
): Promise<void> {
  const database = getDb();
  const col = database.collection<CriticalityDoc>('analyses');
  await col.updateOne(
    {
      'params.minutes': params.minutes,
      'params.seed': params.seed,
      'params.runs': params.runs,
      'params.scenarioId': params.scenarioId,
    },
    {
      $set: {
        params,
        results,
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
}

// ---------------- Custom Scenarios CRUD ----------------

export async function createCustomScenario(
  data: Omit<CustomScenarioDoc, '_id' | 'createdAt'>
): Promise<CustomScenarioResponse> {
  const database = getDb();
  const col = database.collection<CustomScenarioDoc>('scenarios');

  const doc: CustomScenarioDoc = {
    ...data,
    createdAt: new Date(),
  };

  const res = await col.insertOne(doc as any);
  return {
    id: res.insertedId.toString(),
    name: doc.name,
    description: doc.description,
    injection: doc.injection,
    overrides: doc.overrides,
    createdAt: doc.createdAt,
  };
}

export async function listCustomScenarios(): Promise<CustomScenarioResponse[]> {
  const database = getDb();
  const col = database.collection<CustomScenarioDoc>('scenarios');
  const docs = await col.find({}).sort({ createdAt: -1 }).toArray();
  return docs.map((d) => ({
    id: d._id!.toString(),
    name: d.name,
    description: d.description,
    injection: d.injection,
    overrides: d.overrides,
    createdAt: d.createdAt,
  }));
}

export async function getCustomScenario(id: string): Promise<CustomScenarioResponse | null> {
  if (!ObjectId.isValid(id)) return null;

  const database = getDb();
  const col = database.collection<CustomScenarioDoc>('scenarios');
  const doc = await col.findOne({ _id: new ObjectId(id) });
  if (!doc) return null;

  return {
    id: doc._id!.toString(),
    name: doc.name,
    description: doc.description,
    injection: doc.injection,
    overrides: doc.overrides,
    createdAt: doc.createdAt,
  };
}

export async function updateCustomScenario(
  id: string,
  data: Omit<CustomScenarioDoc, '_id' | 'createdAt'>
): Promise<CustomScenarioResponse | null> {
  if (!ObjectId.isValid(id)) return null;

  const database = getDb();
  const col = database.collection<CustomScenarioDoc>('scenarios');

  const res = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    {
      $set: {
        name: data.name,
        description: data.description,
        injection: data.injection,
        overrides: data.overrides,
      },
    },
    { returnDocument: 'after' }
  );

  if (!res) return null;

  return {
    id: res._id!.toString(),
    name: res.name,
    description: res.description,
    injection: res.injection,
    overrides: res.overrides,
    createdAt: res.createdAt,
  };
}

export async function deleteCustomScenario(id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;

  const database = getDb();
  const col = database.collection<CustomScenarioDoc>('scenarios');
  const res = await col.deleteOne({ _id: new ObjectId(id) });
  return res.deletedCount === 1;
}

// Clean shutdown on SIGINT
process.on('SIGINT', async () => {
  await closeDb();
  process.exit(0);
});
