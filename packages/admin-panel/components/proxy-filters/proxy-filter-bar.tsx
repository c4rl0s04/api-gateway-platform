'use client';

import { useEffect, useRef, useState } from 'react';
import { CloseIcon, SearchIcon } from '@/components/gateway-icons';
import { CountryFacet } from '@/components/proxy-filters/country-facet';
import { MobileFilterSheet } from '@/components/proxy-filters/mobile-filter-sheet';
import { SingleSelectFacet } from '@/components/proxy-filters/single-select-facet';
import { StageFacet } from '@/components/proxy-filters/stage-facet';
import type {
  CountedOption,
  OrganizationOption,
  StageOption,
} from '@/components/proxy-filters/types';
import { deploymentRegionLabel } from '@/lib/deployment-regions';
import {
  activeProxyFilterCount,
  defaultProxyFilters,
  type ProxyFilters,
  type ProxyStateFilter,
} from '@/lib/proxy-filters';

type FacetName = 'country' | 'stage' | 'organization' | 'state';

export function ProxyFilterBar({
  filters,
  countryOptions,
  stageOptions,
  organizationOptions,
  stateOptions,
  onCommit,
  onSearchChange,
}: {
  filters: ProxyFilters;
  countryOptions: CountedOption[];
  stageOptions: StageOption[];
  organizationOptions: OrganizationOption[];
  stateOptions: CountedOption[];
  onCommit: (filters: ProxyFilters) => void;
  onSearchChange: (query: string) => void;
}) {
  const [openFacet, setOpenFacet] = useState<FacetName | null>(null);
  const [query, setQuery] = useState(filters.query);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeCount = activeProxyFilterCount(filters);

  useEffect(() => setQuery(filters.query), [filters.query]);

  useEffect(() => {
    if (query === filters.query) return;
    const timeout = window.setTimeout(() => onSearchChange(query), 250);
    return () => window.clearTimeout(timeout);
  }, [filters.query, onSearchChange, query]);

  useEffect(() => {
    if (!openFacet) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenFacet(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenFacet(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openFacet]);

  function changeFacet(name: FacetName, open: boolean) {
    setOpenFacet(open ? name : null);
  }

  function removeCountry(country: string) {
    onCommit({ ...filters, countries: filters.countries.filter(value => value !== country) });
  }

  function removeStage(stage: ProxyFilters['stages'][number]) {
    onCommit({ ...filters, stages: filters.stages.filter(value => value !== stage) });
  }

  const organizationName = organizationOptions.find(option => option.id === filters.organizationId)?.name;
  const stateLabel = stateOptions.find(option => option.value === filters.state)?.label;

  return (
    <div className="proxy-filter-system" ref={rootRef}>
      <div className="proxy-filter-rail">
        <label className="proxy-search">
          <SearchIcon />
          <span className="sr-only">Search proxies</span>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name, route, or ID" />
        </label>

        <div className="desktop-filter-facets">
          <CountryFacet
            options={countryOptions}
            selected={filters.countries}
            open={openFacet === 'country'}
            onOpenChange={open => changeFacet('country', open)}
            onApply={countries => onCommit({ ...filters, countries })}
          />
          <StageFacet
            options={stageOptions}
            selected={filters.stages}
            open={openFacet === 'stage'}
            onOpenChange={open => changeFacet('stage', open)}
            onApply={stages => onCommit({ ...filters, stages })}
          />
          <SingleSelectFacet
            label="Organization"
            allLabel="All organizations"
            options={organizationOptions.map(option => ({ value: option.id, label: option.name, count: option.count }))}
            selected={filters.organizationId}
            open={openFacet === 'organization'}
            onOpenChange={open => changeFacet('organization', open)}
            onSelect={organizationId => onCommit({ ...filters, organizationId })}
          />
          <SingleSelectFacet
            label="State"
            allLabel="All states"
            options={stateOptions}
            selected={filters.state === 'all' ? null : filters.state}
            open={openFacet === 'state'}
            onOpenChange={open => changeFacet('state', open)}
            onSelect={state => onCommit({ ...filters, state: (state ?? 'all') as ProxyStateFilter })}
          />
        </div>

        <MobileFilterSheet
          filters={filters}
          countries={countryOptions}
          stages={stageOptions}
          organizations={organizationOptions}
          states={stateOptions}
          onApply={onCommit}
        />
      </div>

      {activeCount > 0 && (
        <div className="active-filter-row" aria-label="Active proxy filters">
          {filters.countries.map(country => (
            <button type="button" onClick={() => removeCountry(country)} aria-label={`Remove ${deploymentRegionLabel(country)} country filter`} key={`country-${country}`}>
              <span>Country</span>{deploymentRegionLabel(country)}<CloseIcon />
            </button>
          ))}
          {filters.stages.map(stage => (
            <button type="button" onClick={() => removeStage(stage)} aria-label={`Remove ${stage.toUpperCase()} stage filter`} key={`stage-${stage}`}>
              <span>Stage</span>{stage.toUpperCase()}<CloseIcon />
            </button>
          ))}
          {filters.organizationId && (
            <button type="button" onClick={() => onCommit({ ...filters, organizationId: null })} aria-label={`Remove ${organizationName ?? 'organization'} filter`}>
              <span>Organization</span>{organizationName ?? filters.organizationId}<CloseIcon />
            </button>
          )}
          {filters.state !== 'all' && (
            <button type="button" onClick={() => onCommit({ ...filters, state: 'all' })} aria-label={`Remove ${stateLabel ?? filters.state} state filter`}>
              <span>State</span>{stateLabel ?? filters.state}<CloseIcon />
            </button>
          )}
          <button className="clear-filter-command" type="button" onClick={() => onCommit(defaultProxyFilters)}>Clear filters</button>
        </div>
      )}
    </div>
  );
}
