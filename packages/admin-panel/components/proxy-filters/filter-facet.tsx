'use client';

import { ReactNode, useEffect, useId, useRef } from 'react';
import { ChevronIcon } from '@/components/gateway-icons';

export function FilterFacet({
  label,
  summary,
  active,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  summary: string;
  active: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const popoverId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <div className={`filter-facet ${active ? 'is-active' : ''} ${open ? 'is-open' : ''}`}>
      <button
        ref={triggerRef}
        className="filter-facet-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => onOpenChange(!open)}
      >
        <span>{label}</span>
        <strong>{summary}</strong>
        <ChevronIcon />
      </button>
      {open && (
        <div className="filter-facet-popover" id={popoverId} role="dialog" aria-label={`${label} filter`}>
          {children}
        </div>
      )}
    </div>
  );
}
