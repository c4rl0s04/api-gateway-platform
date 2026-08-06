'use client';

import { useState } from 'react';
import { FilterFacet } from '@/components/proxy-filters/filter-facet';
import type { StageOption } from '@/components/proxy-filters/types';
import type { DeploymentStage } from '@/lib/api-client';

export function StageFacet({
  options,
  selected,
  open,
  onOpenChange,
  onApply,
}: {
  options: StageOption[];
  selected: DeploymentStage[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (stages: DeploymentStage[]) => void;
}) {
  const [draft, setDraft] = useState(selected);

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) setDraft(selected);
    onOpenChange(nextOpen);
  }

  function toggleStage(stage: DeploymentStage) {
    setDraft(current => current.includes(stage)
      ? current.filter(value => value !== stage)
      : [...current, stage]);
  }

  const summary = selected.length === 0
    ? 'All stages'
    : selected.map(stage => stage.toUpperCase()).join(', ');

  return (
    <FilterFacet label="Stage" summary={summary} active={selected.length > 0} open={open} onOpenChange={changeOpen}>
      <div className="facet-option-list stage-option-list">
        {options.map(option => (
          <label className="facet-check-option stage-check-option" key={option.value}>
            <input type="checkbox" checked={draft.includes(option.value)} onChange={() => toggleStage(option.value)} />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
            <small>{option.count}</small>
          </label>
        ))}
      </div>
      <div className="facet-actions">
        <button type="button" onClick={() => setDraft([])} disabled={draft.length === 0}>Clear</button>
        <button type="button" className="facet-apply" onClick={() => { onApply(draft); onOpenChange(false); }}>Apply{draft.length > 0 ? ` · ${draft.length}` : ''}</button>
      </div>
    </FilterFacet>
  );
}
