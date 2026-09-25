import type { CSSProperties } from 'react';

const initials = (name = ''): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

/** Deterministic colour per name; lightness is fixed low enough for white text to stay readable. */
const colourFor = (seed = ''): CSSProperties => {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return { background: `hsl(${hash} 45% 30%)` };
};

interface Props {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Companies get a rounded square, people a circle. */
  shape?: 'circle' | 'square';
}

export function Avatar({ name, src, size = 'md', shape = 'circle' }: Props) {
  const cls = ['avatar', size !== 'md' && `avatar-${size}`, shape === 'square' && 'avatar-square'].filter(Boolean).join(' ');
  if (src) return <img className={cls} src={src} alt="" loading="lazy" />;
  return (
    <span className={cls} style={colourFor(name)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export const CompanyLogo = ({ name, logoUrl, size }: { name?: string; logoUrl?: string; size?: Props['size'] }) => (
  <Avatar name={name} src={logoUrl} size={size} shape="square" />
);
