'use client';

import { FilterFacet } from '@/components/proxy-filters/filter-facet';
import type { CountedOption } from '@/components/proxy-filters/types';

export function SingleSelectFacet({
  label,
  allLabel,
  options,
  selected,
  open,
  onOpenChange,
  onSelect,
}: {
  label: string;
  allLabel: string;
  options: CountedOption[];
  selected: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string | null) => void;
}) {
  const summary = selected
    ? options.find(option => option.value === selected)?.label ?? selected
    : allLabel;

  function select(value: string | null) {
    onSelect(value);
    onOpenChange(false);
  }

  return (
    <FilterFacet label={label} summary={summary} active={selected !== null} open={open} onOpenChange={onOpenChange}>
      <div className="facet-option-list single-option-list" role="radiogroup" aria-label={label}>
        <button type="button" role="radio" aria-checked={selected === null} onClick={() => select(null)}>
          <span><strong>{allLabel}</strong></span>
        </button>
        {options.map(option => (
          <button type="button" role="radio" aria-checked={selected === option.value} onClick={() => select(option.value)} key={option.value}>
            <span><strong>{option.label}</strong>{option.code && <small>{option.code}</small>}</span>
            <small>{option.count}</small>
          </button>
        ))}
      </div>
    </FilterFacet>
  );
}
