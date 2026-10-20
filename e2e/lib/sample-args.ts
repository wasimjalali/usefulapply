/**
 * Plausible arguments for a tool, built from its published JSON input schema, so a spec can call every tool
 * with input that would pass validation. Names the caller knows better (a real application id, a revision)
 * are given in `known` and win over the generated value.
 */

type Schema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  format?: string;
  minLength?: number;
  minimum?: number;
  minItems?: number;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  default?: unknown;
};

export function sampleValue(schema: Schema, known: Record<string, unknown> = {}, name = ''): unknown {
  if (name in known) return known[name];
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  const branch = schema.anyOf ?? schema.oneOf;
  if (branch?.length) {
    const nonNull = branch.find((candidate) => candidate.type !== 'null') ?? branch[0];
    return sampleValue(nonNull, known, name);
  }
  const type = Array.isArray(schema.type) ? schema.type.find((candidate) => candidate !== 'null') : schema.type;
  switch (type) {
    case 'string':
      if (schema.format === 'uuid') return crypto.randomUUID();
      if (schema.format === 'uri') return 'https://example.test/x';
      return 'x'.repeat(Math.max(schema.minLength ?? 1, 3));
    case 'integer':
    case 'number':
      return schema.minimum !== undefined ? Math.max(schema.minimum, 1) : 1;
    case 'boolean':
      return true;
    case 'array':
      return Array.from({ length: Math.max(schema.minItems ?? 1, 1) }, () => sampleValue(schema.items ?? {}, known));
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const key of schema.required ?? []) out[key] = sampleValue(schema.properties?.[key] ?? {}, known, key);
      return out;
    }
    default:
      return 'x';
  }
}

/** Arguments for a tool: every required property, plus the ones in `known` that the tool accepts. */
export function sampleArgs(inputSchema: unknown, known: Record<string, unknown> = {}): Record<string, unknown> {
  const schema = inputSchema as Schema;
  const args = sampleValue(schema, known) as Record<string, unknown>;
  for (const key of Object.keys(known)) if (schema.properties && key in schema.properties) args[key] = known[key];
  return args;
}
