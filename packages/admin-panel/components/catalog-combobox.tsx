'use client';

import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface CatalogOption {
  value: string;
  label: string;
  description?: string;
  group?: string;
  keywords?: string[];
}

export function filterCatalogOptions(
  options: CatalogOption[],
  query: string,
): CatalogOption[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return options;
  return options.filter(option => [
    option.label,
    option.description ?? '',
    option.group ?? '',
    ...(option.keywords ?? []),
  ].join(' ').toLocaleLowerCase().includes(normalized));
}

export function CatalogCombobox({
  label,
  value,
  options,
  onChange,
  disabled = false,
  searchPlaceholder = 'Search options',
}: {
  label: string;
  value: string;
  options: CatalogOption[];
  onChange(value: string): void;
  disabled?: boolean;
  searchPlaceholder?: string;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find(option => option.value === value);
  const filtered = useMemo(
    () => filterCatalogOptions(options, query),
    [options, query],
  );

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const selectedIndex = filtered.findIndex(option => option.value === value);
    setActiveIndex(Math.max(0, selectedIndex));
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (option: CatalogOption) => {
    onChange(option.value);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="catalog-combobox" ref={rootRef}>
      <span className="catalog-combobox-label" id={`${id}-label`}>{label}</span>
      <button
        type="button"
        className="catalog-combobox-trigger"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span id={`${id}-value`}>
          <strong>{selected?.label ?? 'Select an option'}</strong>
          {selected?.description && <small>{selected.description}</small>}
        </span>
        <ChevronsUpDown aria-hidden="true" />
      </button>
      {open && (
        <div className="catalog-combobox-popover">
          <div className="catalog-combobox-search">
            <Search aria-hidden="true" />
            <input
              ref={searchRef}
              role="combobox"
              aria-label={`Search ${label.toLowerCase()}`}
              aria-controls={`${id}-listbox`}
              aria-expanded="true"
              aria-activedescendant={filtered[activeIndex]
                ? `${id}-option-${filtered[activeIndex].value}`
                : undefined}
              placeholder={searchPlaceholder}
              value={query}
              onChange={event => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setOpen(false);
                } else if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActiveIndex(index => Math.min(filtered.length - 1, index + 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActiveIndex(index => Math.max(0, index - 1));
                } else if (event.key === 'Enter' && filtered[activeIndex]) {
                  event.preventDefault();
                  choose(filtered[activeIndex]);
                }
              }}
            />
          </div>
          <div className="catalog-combobox-options" id={`${id}-listbox`} role="listbox">
            {filtered.map((option, index) => {
              const previousGroup = filtered[index - 1]?.group;
              return (
                <div className="catalog-combobox-option-wrap" key={option.value}>
                  {option.group && option.group !== previousGroup && (
                    <span className="catalog-combobox-group">{option.group}</span>
                  )}
                  <button
                    type="button"
                    id={`${id}-option-${option.value}`}
                    role="option"
                    aria-selected={option.value === value}
                    data-active={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(option)}
                  >
                    <span>
                      <strong>{option.label}</strong>
                      {option.description && <small>{option.description}</small>}
                    </span>
                    {option.value === value && <Check aria-hidden="true" />}
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="catalog-combobox-empty">No matching options.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
