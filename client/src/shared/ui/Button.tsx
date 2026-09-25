import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';
type Size = 'sm' | 'md' | 'lg';

interface Common {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  block?: boolean;
  children?: ReactNode;
}

const classes = ({ variant = 'primary', size = 'md', block }: Common, extra?: string) =>
  ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', extra].filter(Boolean).join(' ');

export const Button = forwardRef<HTMLButtonElement, Common & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }>(
  function Button({ variant, size, icon, block, loading, children, className, disabled, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={classes({ variant, size, block }, className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} />}
        {children}
      </button>
    );
  }
);

/** Icon-only button: `label` is required so it always has an accessible name. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<Common, 'children' | 'block'> & ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: IconName }
>(function IconButton({ variant = 'ghost', size, icon, label, className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes({ variant, size }, `btn-icon ${className ?? ''}`)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
});

export function LinkButton({ variant, size, icon, block, children, className, ...rest }: Common & LinkProps) {
  return (
    <Link className={classes({ variant, size, block }, className)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </Link>
  );
}
