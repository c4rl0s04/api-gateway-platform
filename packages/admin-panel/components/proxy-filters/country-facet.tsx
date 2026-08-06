'use client';

import { useMemo, useState } from 'react';
import { SearchIcon } from '@/components/gateway-icons';
import { FilterFacet } from '@/components/proxy-filters/filter-facet';
import type { CountedOption } from '@/components/proxy-filters/types';

export function CountryFacet({
  options,
  selected,
  open,
  onOpenChange,
  onApply,
}: {
  options: CountedOption[];
  selected: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (countries: string[]) => void;
}) {
  const [draft, setDraft] = useState(selected);
  const [query, setQuery] = useState('');
  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? options.filter(option => `${option.label} ${option.code}`.toLowerCase().includes(normalized))
      : options;
  }, [options, query]);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setDraft(selected);
      setQuery('');
    }
    onOpenChange(nextOpen);
  }

  function toggleCountry(country: string) {
    setDraft(current => current.includes(country)
      ? current.filter(value => value !== country)
      : [...current, country]);
  }

  const summary = selected.length === 0
    ? 'All countries'
    : selected.length === 1
      ? options.find(option => option.value === selected[0])?.label ?? selected[0].toUpperCase()
      : `${options.find(option => option.value === selected[0])?.label ?? selected[0].toUpperCase()} +${selected.length - 1}`;

  return (
    <FilterFacet label="Country" summary={summary} active={selected.length > 0} open={open} onOpenChange={changeOpen}>
      <div className="facet-search">
        <SearchIcon />
        <label><span className="sr-only">Search countries</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search country" autoFocus /></label>
      </div>
      <div className="facet-option-list">
        {visibleOptions.map(option => (
          <label className="facet-check-option" key={option.value}>
            <input type="checkbox" checked={draft.includes(option.value)} onChange={() => toggleCountry(option.value)} />
            <span><strong>{option.label}</strong><small>{option.code}</small></span>
            <small>{option.count}</small>
          </label>
        ))}
        {visibleOptions.length === 0 && <p className="facet-no-results">No matching countries.</p>}
      </div>
      <div className="facet-actions">
        <button type="button" onClick={() => setDraft([])} disabled={draft.length === 0}>Clear</button>
        <button type="button" className="facet-apply" onClick={() => { onApply(draft); onOpenChange(false); }}>Apply{draft.length > 0 ? ` · ${draft.length}` : ''}</button>
      </div>
    </FilterFacet>
  );
}
