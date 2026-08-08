import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filterCatalogOptions, type CatalogOption } from '../components/catalog-combobox.js';

const options: CatalogOption[] = [
  {
    value: 'banking-es',
    label: 'ES Banking',
    description: 'Bank Corp',
    group: 'Business proxies',
    keywords: ['es', '/es/banking/v1'],
  },
  {
    value: 'oauth',
    label: 'Platform OAuth',
    description: 'Managed token service',
    group: 'Platform services',
  },
];

describe('catalog combobox filtering', () => {
  it('matches labels, descriptions, groups, and technical keywords', () => {
    assert.deepEqual(filterCatalogOptions(options, 'bank corp').map(item => item.value), ['banking-es']);
    assert.deepEqual(filterCatalogOptions(options, '/es/banking').map(item => item.value), ['banking-es']);
    assert.deepEqual(filterCatalogOptions(options, 'platform services').map(item => item.value), ['oauth']);
  });

  it('preserves source order and returns all options for an empty query', () => {
    assert.deepEqual(filterCatalogOptions(options, '  '), options);
  });
});
