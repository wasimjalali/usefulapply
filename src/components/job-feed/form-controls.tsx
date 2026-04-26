'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

// ============================================================================
// ChipField
// ============================================================================

export function ChipField({
  values,
  suggestions,
  placeholder,
  onChange,
}: {
  values: string[];
  suggestions: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const addValue = (rawValue: string) => {
    const normalized = rawValue.trim();
    if (!normalized) return;
    if (values.includes(normalized)) {
      setDraft('');
      return;
    }
    onChange([...values, normalized]);
    setDraft('');
  };

  return (
    <div className="rounded-2xl border border-cream-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(values.filter((item) => item !== value))}
            className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-navy-50 px-3 py-1.5 text-sm text-navy-700 cursor-pointer"
          >
            {value}
            <span className="text-xs text-navy-500">Remove</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addValue(draft);
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-2xl border border-cream-300 bg-white px-3 py-2.5 text-sm text-charcoal outline-none transition-colors focus:border-navy-400"
        />
        <Button variant="outline" type="button" onClick={() => addValue(draft)}>
          Add
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => {
            const selected = values.includes(suggestion);
            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => addValue(suggestion)}
                disabled={selected}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selected
                    ? 'border-cream-200 bg-cream-100 text-warm-gray'
                    : 'border-cream-300 bg-cream-50 text-charcoal hover:border-navy-300 hover:text-navy-600 cursor-pointer'
                }`}
              >
                {suggestion}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ChoiceGrid
// ============================================================================

export function ChoiceGrid({
  value,
  options,
  onChange,
  multiple = false,
  columns = 'two',
}: {
  value: string | string[];
  options: Array<{ value: string; label: string; description?: string }>;
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  columns?: 'two' | 'three';
}) {
  const selectedValues = Array.isArray(value) ? value : [value];
  const gridClassName = columns === 'three' ? 'md:grid-cols-3' : 'md:grid-cols-2';

  return (
    <div className={`grid gap-3 ${gridClassName}`}>
      {options.map((option) => {
        const selected = selectedValues.includes(option.value);

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (multiple) {
                const nextValues = selected
                  ? selectedValues.filter((item) => item !== option.value)
                  : [...selectedValues, option.value];
                onChange(nextValues);
                return;
              }

              onChange(option.value);
            }}
            className={`rounded-2xl border px-4 py-3 text-left transition-colors cursor-pointer ${
              selected
                ? 'border-navy-300 bg-navy-50 shadow-sm'
                : 'border-cream-200 bg-white hover:border-navy-200 hover:bg-navy-50/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-charcoal">{option.label}</p>
                {option.description && (
                  <p className="mt-1 text-xs leading-5 text-warm-gray">{option.description}</p>
                )}
              </div>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                selected
                  ? 'border-navy-600 bg-navy-600 text-white'
                  : 'border-cream-300 bg-white text-transparent'
              }`}>
                ✓
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// SelectField
// ============================================================================

export function SelectField({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string; description?: string }>;
  onChange: (value: string) => void;
  help?: string;
}) {
  const selectedOption = options.find((o) => o.value === value);
  return (
    <label className="block">
      {label && <span className="mb-2 block text-sm font-semibold text-charcoal">{label}</span>}
      {help && <span className="mb-2 block text-xs text-warm-gray">{help}</span>}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-cream-300 bg-white px-3 py-2.5 text-sm text-charcoal shadow-sm outline-none transition-colors focus:border-navy-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {selectedOption?.description && (
        <span className="mt-1.5 block text-xs text-warm-gray">{selectedOption.description}</span>
      )}
    </label>
  );
}

// ============================================================================
// MultiSelectDropdown
// ============================================================================
//
// Accessible multi-select with chips, optional search, and keyboard support.
// Tuned for non-technical users: big hit targets, clear checkmarks,
// Clear-all affordance, chips you can remove individually.

export interface MultiSelectOption {
  value: string;
  label: string;
  description?: string;
}

export function MultiSelectDropdown({
  label,
  help,
  values,
  options,
  onChange,
  placeholder = 'Select one or more options',
  searchable = false,
  maxSelections,
}: {
  label?: string;
  help?: string;
  values: string[];
  options: ReadonlyArray<MultiSelectOption>;
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  maxSelections?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const optionByValue = useMemo(() => {
    const map = new Map<string, MultiSelectOption>();
    for (const option of options) map.set(option.value, option);
    return map;
  }, [options]);

  const filteredOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const query = search.trim().toLowerCase();
    return options.filter((option) =>
      option.label.toLowerCase().includes(query)
      || option.value.toLowerCase().includes(query),
    );
  }, [options, search, searchable]);

  const toggleValue = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((item) => item !== value));
      return;
    }
    if (maxSelections && values.length >= maxSelections) {
      return;
    }
    onChange([...values, value]);
  };

  const chips = values
    .map((value) => optionByValue.get(value))
    .filter((option): option is MultiSelectOption => Boolean(option));

  return (
    <div ref={containerRef} className="relative">
      {label && <span className="mb-2 block text-sm font-semibold text-charcoal">{label}</span>}
      {help && <span className="mb-2 block text-xs text-warm-gray">{help}</span>}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-cream-300 bg-white px-3 py-2.5 text-left text-sm text-charcoal shadow-sm transition-colors hover:border-navy-300 focus:border-navy-400 focus:outline-none cursor-pointer"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={chips.length === 0 ? 'text-warm-gray' : 'text-charcoal'}>
          {chips.length === 0
            ? placeholder
            : chips.length <= 2
              ? chips.map((chip) => chip.label).join(', ')
              : `${chips[0].label}, ${chips[1].label} +${chips.length - 2} more`}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-warm-gray transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.value}
              type="button"
              onClick={() => toggleValue(chip.value)}
              className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-700 transition-colors hover:border-navy-300 cursor-pointer"
            >
              <span>{chip.label}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
          {chips.length > 1 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-medium text-warm-gray hover:text-charcoal cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {isOpen && (
        <div
          role="listbox"
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-cream-200 bg-white p-2 shadow-md"
        >
          {searchable && (
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search…"
              className="mb-2 w-full rounded-lg border border-cream-200 bg-cream-50 px-3 py-2 text-sm outline-none focus:border-navy-300"
              autoFocus
            />
          )}

          {filteredOptions.length === 0 ? (
            <p className="p-3 text-sm text-warm-gray">No matches.</p>
          ) : (
            <ul className="space-y-0.5">
              {filteredOptions.map((option) => {
                const selected = values.includes(option.value);
                const disabled = Boolean(maxSelections && !selected && values.length >= maxSelections);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => toggleValue(option.value)}
                      disabled={disabled}
                      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                        selected ? 'bg-navy-50' : 'hover:bg-cream-50'
                      } ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          selected
                            ? 'border-navy-600 bg-navy-600 text-white'
                            : 'border-cream-400 bg-white'
                        }`}
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-charcoal">{option.label}</span>
                        {option.description && (
                          <span className="mt-0.5 block text-xs text-warm-gray">{option.description}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// GroupedSelectField
// ============================================================================

export function GroupedSelectField({
  label,
  value,
  groups,
  onChange,
  help,
}: {
  label: string;
  value: string;
  groups: ReadonlyArray<{
    region: string;
    zones: ReadonlyArray<{ value: string; label: string }>;
  }>;
  onChange: (value: string) => void;
  help?: string;
}) {
  return (
    <label className="block">
      {label && <span className="mb-2 block text-sm font-semibold text-charcoal">{label}</span>}
      {help && <span className="mb-2 block text-xs text-warm-gray">{help}</span>}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-cream-300 bg-white px-3 py-2.5 text-sm text-charcoal shadow-sm outline-none transition-colors focus:border-navy-400"
      >
        {groups.map((group) => (
          <optgroup key={group.region} label={group.region}>
            {group.zones.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

// ============================================================================
// InputField
// ============================================================================

export function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'number';
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-charcoal">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-cream-300 bg-white px-3 py-2.5 text-sm text-charcoal shadow-sm outline-none transition-colors focus:border-navy-400"
      />
    </label>
  );
}

// ============================================================================
// ToggleRow
// ============================================================================

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="pr-2">
        <p className="text-sm font-semibold text-charcoal">{title}</p>
        <p className="mt-1 text-xs leading-5 text-warm-gray">{description}</p>
      </div>
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <div className="h-6 w-11 rounded-full bg-cream-300 transition-colors peer-checked:bg-navy-600 peer-focus:ring-2 peer-focus:ring-navy-300" />
        <div className="absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
      </label>
    </div>
  );
}

// ============================================================================
// RoleEntryField
// ============================================================================

export function RoleEntryField({
  values,
  suggestions,
  placeholder,
  onChange,
  addLabel = 'Add role',
  suggestionsLabel = 'Suggestions',
  emptyLabel = 'No roles added yet.',
}: {
  values: string[];
  suggestions: string[];
  placeholder: string;
  onChange: (values: string[]) => void;
  addLabel?: string;
  suggestionsLabel?: string;
  emptyLabel?: string;
}) {
  const [draft, setDraft] = useState('');

  const addValue = (rawValue: string) => {
    const normalized = rawValue.trim();
    if (!normalized) return;
    if (values.includes(normalized)) {
      setDraft('');
      return;
    }

    onChange([...values, normalized]);
    setDraft('');
  };

  return (
    <div className="rounded-2xl border border-cream-200 bg-white/96 p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {values.length > 0 ? (
          values.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange(values.filter((item) => item !== value))}
              className="inline-flex items-center gap-2 rounded-full border border-navy-200 bg-navy-50 px-3 py-1.5 text-sm text-navy-700 cursor-pointer"
            >
              {value}
              <span className="text-xs text-navy-500">Remove</span>
            </button>
          ))
        ) : (
          <p className="text-sm text-warm-gray">{emptyLabel}</p>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addValue(draft);
            }
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-2xl border border-cream-300 bg-white px-3 py-2.5 text-sm text-charcoal outline-none transition-colors focus:border-navy-400"
        />
        <Button variant="outline" type="button" onClick={() => addValue(draft)}>
          {addLabel}
        </Button>
      </div>

      {suggestions.length > 0 && (
      <div className="mt-4 border-t border-cream-200 pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">{suggestionsLabel}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => {
            const selected = values.includes(suggestion);

            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => addValue(suggestion)}
                disabled={selected}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  selected
                    ? 'border-cream-200 bg-cream-100 text-warm-gray'
                    : 'border-cream-300 bg-cream-50 text-charcoal hover:border-navy-300 hover:text-navy-600 cursor-pointer'
                }`}
              >
                {suggestion}
              </button>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
}

// ============================================================================
// FieldGroup
// ============================================================================

export function FieldGroup({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-sm font-semibold text-charcoal">{label}</p>
        <p className="mt-1 text-xs leading-5 text-warm-gray">{help}</p>
      </div>
      {children}
    </div>
  );
}

// ============================================================================
// InlineNotice
// ============================================================================

export function InlineNotice({
  tone,
  title,
  children,
}: {
  tone: 'neutral' | 'success' | 'warning';
  title: string;
  children: React.ReactNode;
}) {
  const classes = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
    : tone === 'warning'
      ? 'border-gold-200 bg-gold-50/80 text-charcoal'
      : 'border-navy-100 bg-navy-50/70 text-charcoal';

  return (
    <div className={`rounded-2xl border px-4 py-4 ${classes}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6">{children}</p>
    </div>
  );
}

// ============================================================================
// ActivationChoiceCard
// ============================================================================

export function ActivationChoiceCard({
  title,
  description,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors cursor-pointer ${
        selected
          ? 'border-navy-300 bg-white shadow-sm'
          : 'border-cream-200 bg-cream-50/55 hover:border-navy-200 hover:bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-charcoal">{title}</p>
          <p className="mt-2 text-sm leading-6 text-warm-gray">{description}</p>
        </div>
        <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 rounded-full border ${
          selected ? 'border-navy-600 bg-navy-600' : 'border-cream-300 bg-white'
        }`}>
          {selected ? <span className="m-auto h-2 w-2 rounded-full bg-white" /> : null}
        </span>
      </div>
    </button>
  );
}

// ============================================================================
// WizardReviewRow
// ============================================================================

export function WizardReviewRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-cream-200 pb-4 last:border-b-0 last:pb-0">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warm-gray">{label}</p>
      <p className="text-sm leading-6 text-charcoal">{value}</p>
    </div>
  );
}

// ============================================================================
// SetupSectionHeader
// ============================================================================

export function SetupSectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-500">{eyebrow}</p>
      <h3 className="mt-2 text-lg font-semibold text-charcoal">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-warm-gray">{body}</p>
    </div>
  );
}
