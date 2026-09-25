import { useId, useState } from 'react';
import { RemovableChip } from '../../shared/ui/Chip';

/** Type a skill and press Enter or comma; Backspace on an empty box removes the last one. */
export default function ChipInput({
  label,
  value,
  onChange,
  hint
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  hint?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const fresh = parts.filter((p) => !value.some((v) => v.toLowerCase() === p.toLowerCase()));
    if (fresh.length) onChange([...value, ...fresh]);
    setDraft('');
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="chip-input">
        {value.map((v) => (
          <RemovableChip key={v} label={v} onRemove={() => onChange(value.filter((x) => x !== v))}>
            {v}
          </RemovableChip>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={value.length ? '' : 'e.g. React'}
          onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
        />
      </div>
      {hint && <small className="hint">{hint}</small>}
    </div>
  );
}
