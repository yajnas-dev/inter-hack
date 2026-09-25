import { useEffect, useState } from 'react';
import { EMPLOYMENT_TYPES, type EmploymentType, type JobFacetsDTO } from '@jobportal/shared';
import { employmentLabel, formatCompact } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { Drawer } from '../../shared/ui/Dialog';
import { Icon } from '../../shared/ui/Icon';
import { RemovableChip } from '../../shared/ui/Chip';
import { Menu } from '../../shared/ui/Menu';
import type { JobFilters } from './api';
import { activeFilterCount } from './useJobFilters';

type Update = (patch: Partial<JobFilters>) => void;
interface SectionProps {
  filters: JobFilters;
  update: Update;
  facets?: JobFacetsDTO;
}

const DATE_OPTIONS: Array<[string, string]> = [
  ['', 'Any time'],
  ['1', 'Past 24 hours'],
  ['3', 'Past 3 days'],
  ['7', 'Past week'],
  ['14', 'Past 2 weeks'],
  ['30', 'Past month']
];
const SALARY_PRESETS = [300_000, 600_000, 1_000_000, 1_500_000];
const EXPERIENCE_OPTIONS: Array<[string, string]> = [
  ['', 'Any experience'],
  ['0', 'Fresher'],
  ['1', 'Up to 1 year'],
  ['2', 'Up to 2 years'],
  ['3', 'Up to 3 years'],
  ['5', 'Up to 5 years'],
  ['8', 'Up to 8 years'],
  ['10', 'Up to 10 years']
];

const dateLabel = (v: string) => DATE_OPTIONS.find(([k]) => k === v)?.[1] ?? '';
const experienceLabel = (v: string) => EXPERIENCE_OPTIONS.find(([k]) => k === v)?.[1] ?? '';

function Radio({
  name,
  value,
  current,
  label,
  onChange
}: {
  name: string;
  value: string;
  current: string;
  label: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="check">
      <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} />
      {label}
    </label>
  );
}

function DateSection({ filters, update }: SectionProps) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="sr-only">Date posted</legend>
      {DATE_OPTIONS.map(([value, label]) => (
        <Radio
          key={value}
          name="date"
          value={value}
          current={filters.postedWithin}
          label={label}
          onChange={(v) => update({ postedWithin: v })}
        />
      ))}
    </fieldset>
  );
}

function TypeSection({ filters, update, facets }: SectionProps) {
  const toggle = (t: EmploymentType) =>
    update({
      employmentType: filters.employmentType.includes(t) ? filters.employmentType.filter((x) => x !== t) : [...filters.employmentType, t]
    });
  const counts = new Map((facets?.employmentTypes ?? []).map((e) => [e.name, e.count]));
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="sr-only">Job type</legend>
      {EMPLOYMENT_TYPES.map((t) => (
        <label key={t} className="check">
          <input type="checkbox" checked={filters.employmentType.includes(t)} onChange={() => toggle(t)} />
          <span className="grow">{employmentLabel(t)}</span>
          {counts.has(t) && <span className="count">{counts.get(t)}</span>}
        </label>
      ))}
    </fieldset>
  );
}

function SalarySection({ filters, update }: SectionProps) {
  return (
    <div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">Minimum salary</legend>
        <Radio name="salary" value="" current={filters.minSalary} label="Any salary" onChange={(v) => update({ minSalary: v })} />
        {SALARY_PRESETS.map((n) => (
          <Radio
            key={n}
            name="salary"
            value={String(n)}
            current={filters.minSalary}
            label={`${formatCompact(n)}+`}
            onChange={(v) => update({ minSalary: v })}
          />
        ))}
      </fieldset>
      <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
        <label htmlFor="min-salary-custom">Custom minimum</label>
        <input
          id="min-salary-custom"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="e.g. 750000"
          value={filters.minSalary}
          onChange={(e) => update({ minSalary: e.target.value })}
        />
      </div>
    </div>
  );
}

function ExperienceSection({ filters, update }: SectionProps) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="sr-only">Experience</legend>
      {EXPERIENCE_OPTIONS.map(([value, label]) => (
        <Radio
          key={value}
          name="exp"
          value={value}
          current={filters.experience}
          label={label}
          onChange={(v) => update({ experience: v })}
        />
      ))}
    </fieldset>
  );
}

function SkillsSection({ filters, update, facets }: SectionProps) {
  const selected = filters.skills
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const has = (name: string) => selected.some((s) => s.toLowerCase() === name.toLowerCase());
  const toggle = (name: string) =>
    update({ skills: (has(name) ? selected.filter((s) => s.toLowerCase() !== name.toLowerCase()) : [...selected, name]).join(',') });
  return (
    <div className="stack-sm">
      <div className="tags">
        {(facets?.skills ?? []).slice(0, 12).map((s) => (
          <button key={s.name} type="button" className="chip" aria-pressed={has(s.name)} onClick={() => toggle(s.name)}>
            {s.name}
            <span className="count">{s.count}</span>
          </button>
        ))}
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="skills-custom">Skills (comma separated)</label>
        <input
          id="skills-custom"
          value={filters.skills}
          placeholder="e.g. react, node.js"
          onChange={(e) => update({ skills: e.target.value })}
        />
      </div>
    </div>
  );
}

const SECTIONS = [
  { key: 'date', title: 'Date posted', Body: DateSection },
  { key: 'type', title: 'Job type', Body: TypeSection },
  { key: 'salary', title: 'Salary', Body: SalarySection },
  { key: 'exp', title: 'Experience', Body: ExperienceSection },
  { key: 'skills', title: 'Skills', Body: SkillsSection }
] as const;

const isActive = (key: (typeof SECTIONS)[number]['key'], f: JobFilters): boolean =>
  key === 'date'
    ? Boolean(f.postedWithin)
    : key === 'type'
      ? f.employmentType.length > 0
      : key === 'salary'
        ? Boolean(f.minSalary)
        : key === 'exp'
          ? Boolean(f.experience)
          : Boolean(f.skills);

/** Keyword + location, applied to the URL after typing pauses. */
export function SearchRow({ filters, update }: { filters: JobFilters; update: Update }) {
  const [title, setTitle] = useState(filters.title);
  const [location, setLocation] = useState(filters.location);

  // Keep the inputs in step with the URL (Clear all, back button).
  useEffect(() => setTitle(filters.title), [filters.title]);
  useEffect(() => setLocation(filters.location), [filters.location]);

  useEffect(() => {
    if (title === filters.title && location === filters.location) return;
    const timer = window.setTimeout(() => update({ title: title.trim(), location: location.trim() }), 350);
    return () => window.clearTimeout(timer);
  }, [title, location, filters.title, filters.location, update]);

  return (
    <form
      className="search-bar"
      role="search"
      aria-label="Search jobs"
      onSubmit={(e) => {
        e.preventDefault();
        update({ title: title.trim(), location: location.trim() });
      }}
    >
      <div className="input-icon">
        <Icon name="search" />
        <input
          aria-label="Job title, skill or company"
          placeholder="Job title, keyword"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="input-icon">
        <Icon name="pin" />
        <input aria-label="Location" placeholder="City or location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <Button type="submit" size="lg">
        Search
      </Button>
    </form>
  );
}

export function FilterBar({ filters, update, clear, facets }: SectionProps & { clear: () => void }) {
  const [drawer, setDrawer] = useState(false);
  const count = activeFilterCount(filters);

  return (
    <>
      <div className="filter-row">
        <div className="filter-desktop" role="group" aria-label="Filters">
          {SECTIONS.map(({ key, title, Body }) => (
            <Menu key={key} label={title} active={isActive(key, filters)}>
              {() => (
                <div style={{ minWidth: 220, padding: 4 }}>
                  <Body filters={filters} update={update} facets={facets} />
                </div>
              )}
            </Menu>
          ))}
        </div>
        <div className="filter-mobile">
          <Button variant="secondary" size="sm" icon="filter" onClick={() => setDrawer(true)}>
            Filters{count > 0 ? ` (${count})` : ''}
          </Button>
        </div>
      </div>

      <Drawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Filters"
        side="sheet"
        footer={
          <>
            <Button variant="ghost" onClick={clear}>
              Clear all
            </Button>
            <Button onClick={() => setDrawer(false)}>Show results</Button>
          </>
        }
      >
        <div className="stack">
          {SECTIONS.map(({ key, title, Body }) => (
            <section key={key}>
              <h3>{title}</h3>
              <Body filters={filters} update={update} facets={facets} />
            </section>
          ))}
        </div>
      </Drawer>
    </>
  );
}

/** Removable chips for every active filter, so nothing narrows the results invisibly. */
export function ActiveChips({ filters, update, clear }: { filters: JobFilters; update: Update; clear: () => void }) {
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  if (filters.title) chips.push({ key: 'title', label: `"${filters.title}"`, remove: () => update({ title: '' }) });
  if (filters.location) chips.push({ key: 'location', label: filters.location, remove: () => update({ location: '' }) });
  for (const t of filters.employmentType)
    chips.push({
      key: t,
      label: employmentLabel(t),
      remove: () => update({ employmentType: filters.employmentType.filter((x) => x !== t) })
    });
  if (filters.postedWithin) chips.push({ key: 'date', label: dateLabel(filters.postedWithin), remove: () => update({ postedWithin: '' }) });
  if (filters.minSalary)
    chips.push({ key: 'salary', label: `${formatCompact(Number(filters.minSalary))}+ salary`, remove: () => update({ minSalary: '' }) });
  if (filters.experience) chips.push({ key: 'exp', label: experienceLabel(filters.experience), remove: () => update({ experience: '' }) });
  for (const s of filters.skills
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)) {
    chips.push({
      key: `skill-${s}`,
      label: s,
      remove: () =>
        update({
          skills: filters.skills
            .split(',')
            .map((x) => x.trim())
            .filter((x) => x && x !== s)
            .join(',')
        })
    });
  }
  if (!chips.length) return null;
  return (
    <div className="active-chips" role="group" aria-label="Active filters">
      {chips.map((c) => (
        <RemovableChip key={c.key} label={c.label} onRemove={c.remove}>
          {c.label}
        </RemovableChip>
      ))}
      <button type="button" className="link-btn" onClick={clear}>
        Clear all
      </button>
    </div>
  );
}
