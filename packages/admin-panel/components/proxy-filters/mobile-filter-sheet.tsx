'use client';

import { useId, useState } from 'react';
import { FilterIcon } from '@/components/gateway-icons';
import type {
  CountedOption,
  OrganizationOption,
  StageOption,
} from '@/components/proxy-filters/types';
import type { DeploymentStage } from '@/lib/api-client';
import {
  activeProxyFilterCount,
  type ProxyFilters,
  type ProxyStateFilter,
} from '@/lib/proxy-filters';

export function MobileFilterSheet({
  filters,
  countries,
  stages,
  organizations,
  states,
  onApply,
}: {
  filters: ProxyFilters;
  countries: CountedOption[];
  stages: StageOption[];
  organizations: OrganizationOption[];
  states: CountedOption[];
  onApply: (filters: ProxyFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const sheetId = useId();
  const activeCount = activeProxyFilterCount(filters);

  function openSheet() {
    setDraft(filters);
    setOpen(true);
  }

  function toggleCountry(country: string) {
    setDraft(current => ({
      ...current,
      countries: current.countries.includes(country)
        ? current.countries.filter(value => value !== country)
        : [...current.countries, country],
    }));
  }

  function toggleStage(stage: DeploymentStage) {
    setDraft(current => ({
      ...current,
      stages: current.stages.includes(stage)
        ? current.stages.filter(value => value !== stage)
        : [...current.stages, stage],
    }));
  }

  return (
    <div className="mobile-filter-shell">
      <button
        className={`mobile-filter-trigger ${activeCount > 0 ? 'is-active' : ''}`}
        type="button"
        aria-expanded={open}
        aria-controls={sheetId}
        onClick={() => open ? setOpen(false) : openSheet()}
      >
        <FilterIcon />
        <span>Filters{activeCount > 0 ? ` · ${activeCount}` : ''}</span>
      </button>

      {open && (
        <section className="mobile-filter-sheet" id={sheetId} aria-label="Proxy filters">
          <fieldset>
            <legend>Country</legend>
            <div className="mobile-filter-options country-options">
              {countries.map(country => (
                <label key={country.value}>
                  <input type="checkbox" checked={draft.countries.includes(country.value)} onChange={() => toggleCountry(country.value)} />
                  <span><strong>{country.label}</strong><small>{country.code}</small></span>
                  <small>{country.count}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Stage</legend>
            <div className="mobile-filter-options">
              {stages.map(stage => (
                <label key={stage.value}>
                  <input type="checkbox" checked={draft.stages.includes(stage.value)} onChange={() => toggleStage(stage.value)} />
                  <span><strong>{stage.label}</strong><small>{stage.description}</small></span>
                  <small>{stage.count}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Organization</legend>
            <div className="mobile-filter-options">
              <label><input type="radio" name="mobile-organization" checked={draft.organizationId === null} onChange={() => setDraft(current => ({ ...current, organizationId: null }))} /><span><strong>All organizations</strong></span></label>
              {organizations.map(organization => (
                <label key={organization.id}>
                  <input type="radio" name="mobile-organization" checked={draft.organizationId === organization.id} onChange={() => setDraft(current => ({ ...current, organizationId: organization.id }))} />
                  <span><strong>{organization.name}</strong></span>
                  <small>{organization.count}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>State</legend>
            <div className="mobile-filter-options">
              <label><input type="radio" name="mobile-state" checked={draft.state === 'all'} onChange={() => setDraft(current => ({ ...current, state: 'all' }))} /><span><strong>All states</strong></span></label>
              {states.map(state => (
                <label key={state.value}>
                  <input type="radio" name="mobile-state" checked={draft.state === state.value} onChange={() => setDraft(current => ({ ...current, state: state.value as ProxyStateFilter }))} />
                  <span><strong>{state.label}</strong></span>
                  <small>{state.count}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mobile-filter-actions">
            <button type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="facet-apply" onClick={() => { onApply(draft); setOpen(false); }}>Apply filters</button>
          </div>
        </section>
      )}
    </div>
  );
}
