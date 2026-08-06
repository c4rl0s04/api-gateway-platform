import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseSidebarPreference,
  readSidebarPreference,
  SIDEBAR_STORAGE_KEY,
} from '../lib/sidebar-preference.js';

describe('sidebar preference', () => {
  it('accepts only the explicit collapsed state', () => {
    assert.equal(parseSidebarPreference('collapsed'), 'collapsed');
    assert.equal(parseSidebarPreference('expanded'), 'expanded');
    assert.equal(parseSidebarPreference('unknown'), 'expanded');
    assert.equal(parseSidebarPreference(null), 'expanded');
  });

  it('reads a valid stored preference and tolerates unavailable storage', () => {
    assert.equal(readSidebarPreference({ getItem: key => key === SIDEBAR_STORAGE_KEY ? 'collapsed' : null }), 'collapsed');
    assert.equal(readSidebarPreference({ getItem: () => { throw new Error('blocked'); } }), 'expanded');
  });
});
