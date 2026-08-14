import { clientFor } from '../utils/api.js';

export interface PropertyDefinitionsListOptions {
  entityType?: 'contact' | 'company';
  profile?: string;
  json?: boolean;
}

export async function runPropertyDefinitionsList(opts: PropertyDefinitionsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const defs = await client.propertyDefinitions.list(opts.entityType);

  if (opts.json) {
    console.log(JSON.stringify(defs, null, 2));
    return;
  }
  if (!defs.length) {
    console.log('No property definitions found.');
    return;
  }
  for (const def of defs) {
    console.log(`${def.entityType}.${def.key}  (${def.type})  ${def.label ?? ''}`);
  }
}

export interface PropertyDefinitionsUpsertOptions {
  profile?: string;
  json?: boolean;
}

export async function runPropertyDefinitionsUpsert(
  entityType: 'contact' | 'company',
  key: string,
  body: string,
  opts: PropertyDefinitionsUpsertOptions
): Promise<void> {
  const client = await clientFor(opts.profile);
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error('Body must be valid JSON, e.g. \'{"label":"Churn Risk","type":"text"}\'');
    process.exit(1);
  }
  const def = await client.propertyDefinitions.upsert(entityType, key, parsed);

  if (opts.json) {
    console.log(JSON.stringify(def, null, 2));
    return;
  }
  console.log(`Upserted property ${def.entityType}.${def.key}.`);
}
