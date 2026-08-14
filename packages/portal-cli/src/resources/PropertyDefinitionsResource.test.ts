import { describe, it, expect, vi } from 'vitest';
import { PropertyDefinitionsResource } from './PropertyDefinitionsResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), put: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('PropertyDefinitionsResource', () => {
  it('list() unwraps { propertyDefinitions }, omits query when entityType is not given', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true, propertyDefinitions: [{ id: 'pd1' }], total: 1 }) });
    const result = await new PropertyDefinitionsResource(http).list();
    expect(http.get).toHaveBeenCalledWith('/property-definitions', undefined);
    expect(result).toEqual([{ id: 'pd1' }]);
  });

  it('list(entityType) passes it as a query param', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true, propertyDefinitions: [] }) });
    await new PropertyDefinitionsResource(http).list('company');
    expect(http.get).toHaveBeenCalledWith('/property-definitions', { entityType: 'company' });
  });

  it('upsert() PUTs /property-definitions/:entityType/:key and unwraps { propertyDefinition }', async () => {
    const http = fakeHttp({ put: vi.fn().mockResolvedValue({ ok: true, propertyDefinition: { id: 'pd1', key: 'churnRisk' } }) });
    const result = await new PropertyDefinitionsResource(http).upsert('contact', 'churnRisk', { label: 'Churn Risk', type: 'text' } as any);
    expect(http.put).toHaveBeenCalledWith('/property-definitions/contact/churnRisk', { label: 'Churn Risk', type: 'text' });
    expect(result).toEqual({ id: 'pd1', key: 'churnRisk' });
  });
});
