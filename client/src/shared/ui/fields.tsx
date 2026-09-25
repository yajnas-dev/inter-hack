import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  /** Visually hide the label but keep it for screen readers (e.g. inside a search bar). */
  hideLabel?: boolean;
}

function Wrapper({ id, label, error, hint, hideLabel, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <small className="hint" id={`${id}-hint`}>
          {hint}
        </small>
      )}
      {error && (
        <small className="field-error" role="alert" id={`${id}-error`}>
          {error}
        </small>
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export const TextField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, error, hint, hideLabel, ...props },
  ref
) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} hideLabel={hideLabel}>
      <input id={id} ref={ref} aria-invalid={Boolean(error)} aria-describedby={describedBy(id, error, hint)} {...props} />
    </Wrapper>
  );
});

export const TextArea = forwardRef<HTMLTextAreaElement, FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { label, error, hint, hideLabel, ...props },
  ref
) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} hideLabel={hideLabel}>
      <textarea id={id} ref={ref} aria-invalid={Boolean(error)} aria-describedby={describedBy(id, error, hint)} {...props} />
    </Wrapper>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, FieldProps & SelectHTMLAttributes<HTMLSelectElement>>(function SelectField(
  { label, error, hint, hideLabel, children, ...props },
  ref
) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} error={error} hint={hint} hideLabel={hideLabel}>
      <select id={id} ref={ref} aria-invalid={Boolean(error)} aria-describedby={describedBy(id, error, hint)} {...props}>
        {children}
      </select>
    </Wrapper>
  );
});
