import type { HttpClient } from '../HttpClient.js';
import type { PropertyDefinition, UpsertPropertyDefinitionBody, PropertyDefinitionEntityType } from '../types.js';

/** Custom-field definitions for contacts/companies — the schema behind their `properties` maps. */
export class PropertyDefinitionsResource {
  constructor(private http: HttpClient) {}

  async list(entityType?: PropertyDefinitionEntityType): Promise<PropertyDefinition[]> {
    const r = await this.http.get<any>('/property-definitions', entityType ? { entityType } : undefined);
    return r.propertyDefinitions ?? [];
  }

  async upsert(entityType: PropertyDefinitionEntityType, key: string, body: UpsertPropertyDefinitionBody): Promise<PropertyDefinition> {
    const r = await this.http.put<any>(`/property-definitions/${entityType}/${key}`, body);
    return r.propertyDefinition;
  }
}
