import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { SAMPLE_NETWORK } from '../src/engine/network';
import { SCENARIOS } from '../src/analysis/scenarios';

const validNodeIds = new Set(SAMPLE_NETWORK.nodes.map((n) => n.id));
const validScenarioIds = new Set(SCENARIOS.map((s) => s.id));
const existingEdgeKeys = new Set(SAMPLE_NETWORK.edges.map((e) => `${e.from}->${e.to}`));

// ---------------- Simulations Validation ----------------

export const SimulationInputSchema = z
  .object({
    nodeId: z
      .string()
      .refine((id) => validNodeIds.has(id), {
        message: 'nodeId must exist in SAMPLE_NETWORK',
      }),
    minutes: z
      .number()
      .int('minutes must be an integer')
      .min(1, 'minutes must be between 1 and 60')
      .max(60, 'minutes must be between 1 and 60'),
    seed: z
      .number()
      .int('seed must be an integer'),
    runs: z
      .number()
      .refine((r) => [100, 500, 2000, 5000].includes(r as any), {
        message: 'runs must be one of 100, 500, 2000, 5000',
      }),
    scenarioId: z
      .string()
      .nullable()
      .optional()
      .refine((id) => id == null || validScenarioIds.has(id), {
        message: 'scenarioId must exist in SCENARIOS',
      }),
    customScenarioId: z
      .string()
      .nullable()
      .optional()
      .refine((id) => id == null || ObjectId.isValid(id), {
        message: 'customScenarioId must be a valid ObjectId',
      }),
  })
  .refine((data) => !(data.scenarioId && data.customScenarioId), {
    message: 'Cannot provide both scenarioId and customScenarioId',
    path: ['customScenarioId'],
  });

export type SimulationInput = z.infer<typeof SimulationInputSchema>;

// ---------------- Criticality Validation ----------------

export const CriticalityInputSchema = z.object({
  minutes: z
    .number()
    .int('minutes must be an integer')
    .min(1, 'minutes must be between 1 and 60')
    .max(60, 'minutes must be between 1 and 60'),
  seed: z
    .number()
    .int('seed must be an integer'),
  runs: z
    .number()
    .refine((r) => [100, 500].includes(r as any), {
      message: 'runs must be one of 100, 500',
    }),
  scenarioId: z
    .string()
    .nullable()
    .optional()
    .refine((id) => id == null || validScenarioIds.has(id) || ObjectId.isValid(id), {
      message: 'scenarioId must exist in SCENARIOS or be a valid ObjectId',
    }),
});

export type CriticalityInput = z.infer<typeof CriticalityInputSchema>;

// ---------------- Custom Scenarios Validation ----------------

export const EdgeOverrideSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    p: z.number().min(0).max(1).optional(),
    damping: z.number().min(0).max(1).optional(),
    slack: z.number().min(0).max(30).optional(),
  })
  .strict()
  .refine((edge) => existingEdgeKeys.has(`${edge.from}->${edge.to}`), {
    message: 'Override refers to a non-existent edge in the network',
    path: ['from'],
  });

export const CustomScenarioSchema = z
  .object({
    name: z
      .string()
      .min(1, 'name must be between 1 and 60 characters')
      .max(60, 'name must be between 1 and 60 characters'),
    description: z.string().default(''),
    injection: z
      .object({
        nodeId: z.string().refine((id) => validNodeIds.has(id), {
          message: 'injection.nodeId must exist in SAMPLE_NETWORK',
        }),
        minutes: z
          .number()
          .int('injection.minutes must be an integer')
          .min(1, 'injection.minutes must be between 1 and 60')
          .max(60, 'injection.minutes must be between 1 and 60'),
      })
      .strict(),
    overrides: z
      .array(EdgeOverrideSchema)
      .max(20, 'At most 20 edge overrides are permitted'),
  })
  .strict();

export type CustomScenarioInput = z.infer<typeof CustomScenarioSchema>;

// ---------------- Helpers ----------------

export function hasDollarKey(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (key.startsWith('$')) {
      return key;
    }
    const val = (obj as Record<string, unknown>)[key];
    if (val && typeof val === 'object') {
      const nested = hasDollarKey(val);
      if (nested) return nested;
    }
  }
  return null;
}

export function validateSimulationBody(
  body: unknown
): { success: true; data: SimulationInput } | { success: false; error: string; field: string } {
  const dollarKey = hasDollarKey(body);
  if (dollarKey) {
    return {
      success: false,
      error: `Keys starting with '$' are not allowed: ${dollarKey}`,
      field: dollarKey,
    };
  }

  const result = SimulationInputSchema.safeParse(body);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const field = firstIssue.path.join('.') || 'body';
    return {
      success: false,
      error: firstIssue.message,
      field,
    };
  }

  return { success: true, data: result.data };
}

export function validateCriticalityBody(
  body: unknown
): { success: true; data: CriticalityInput } | { success: false; error: string; field: string } {
  const dollarKey = hasDollarKey(body);
  if (dollarKey) {
    return {
      success: false,
      error: `Keys starting with '$' are not allowed: ${dollarKey}`,
      field: dollarKey,
    };
  }

  const result = CriticalityInputSchema.safeParse(body);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const field = firstIssue.path.join('.') || 'body';
    return {
      success: false,
      error: firstIssue.message,
      field,
    };
  }

  return { success: true, data: result.data };
}

export function validateCustomScenarioBody(
  body: unknown
): { success: true; data: CustomScenarioInput } | { success: false; error: string; field: string } {
  const dollarKey = hasDollarKey(body);
  if (dollarKey) {
    return {
      success: false,
      error: `Keys starting with '$' are not allowed: ${dollarKey}`,
      field: dollarKey,
    };
  }

  const result = CustomScenarioSchema.safeParse(body);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const field = firstIssue.path.join('.') || 'body';
    return {
      success: false,
      error: firstIssue.message,
      field,
    };
  }

  return { success: true, data: result.data };
}

export function isValidObjectId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return ObjectId.isValid(id) && new ObjectId(id).toString() === id;
}
