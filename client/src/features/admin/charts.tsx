import { useEffect, useRef, useState } from 'react';
import { APPLICATION_STATUSES, type ApplicationStatus } from '@jobportal/shared';
import { statusLabel } from '../../shared/ui/Chip';

/** Hand-rolled SVG charts: each exposes its numbers as text so the data is not locked inside a picture. */

const STAGE_COLOUR: Record<ApplicationStatus, string> = {
  APPLIED: 'var(--st-applied)',
  SHORTLISTED: 'var(--st-shortlisted)',
  INTERVIEW: 'var(--st-interview)',
  SELECTED: 'var(--st-selected)',
  REJECTED: 'var(--st-rejected)'
};

const niceMax = (n: number): number => {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  return Math.ceil(n / pow) * pow;
};

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function TrendChart({ data, label }: { data: Array<{ date: string; count: number }>; label: string }) {
  const box = useRef<HTMLElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setW(Math.max(320, Math.round(el.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const H = 240;
  const pad = { l: 36, r: 12, t: 12, b: 28 };
  const max = niceMax(Math.max(0, ...data.map((d) => d.count)));
  const total = data.reduce((s, d) => s + d.count, 0);

  if (data.length === 0) return <p className="muted">No applications in this period yet.</p>;

  const x = (i: number) => pad.l + (data.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const labelEvery = Math.ceil(data.length / 6);

  return (
    <figure ref={box} style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${total} applications over ${data.length} days`}>
        <g className="grid">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end">
                {t}
              </text>
            </g>
          ))}
        </g>
        <path d={area} fill="var(--brand)" opacity="0.12" />
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={d.date}>
            <circle cx={x(i)} cy={y(d.count)} r="3.5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2">
              <title>{`${shortDate(d.date)}: ${d.count}`}</title>
            </circle>
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 8} textAnchor="middle">
                {shortDate(d.date)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <details style={{ marginTop: 8 }}>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
          View data as a table
        </summary>
        <table className="table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Date</th>
              <th style={{ textAlign: 'right' }}>Applications</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td>{shortDate(d.date)}</td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {d.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export function StatusBreakdown({ data }: { data: Array<{ status: string; count: number }> }) {
  const counts = new Map(data.map((d) => [d.status, d.count]));
  const total = APPLICATION_STATUSES.reduce((s, k) => s + (counts.get(k) ?? 0), 0);
  return (
    <div className="stack">
      <div
        className="stack-bar"
        role="img"
        aria-label={`Applications by status: ${APPLICATION_STATUSES.map((s) => `${statusLabel(s)} ${counts.get(s) ?? 0}`).join(', ')}`}
      >
        {APPLICATION_STATUSES.map((s) => {
          const n = counts.get(s) ?? 0;
          return n > 0 ? (
            <span key={s} style={{ width: `${(n / total) * 100}%`, background: STAGE_COLOUR[s] }} title={`${statusLabel(s)}: ${n}`} />
          ) : null;
        })}
      </div>
      <ul className="legend" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {APPLICATION_STATUSES.map((s) => (
          <li key={s}>
            <i style={{ background: STAGE_COLOUR[s] }} />
            {statusLabel(s)} <strong className="num">{counts.get(s) ?? 0}</strong>
            {total > 0 && <span className="faint"> ({Math.round(((counts.get(s) ?? 0) / total) * 100)}%)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RankBars({ rows }: { rows: Array<{ id: string; primary: string; secondary?: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="muted">Nothing to rank yet.</p>;
  return (
    <ol className="rank" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {rows.map((r) => (
        <li key={r.id} className="rank-row">
          <span className="truncate">
            <strong>{r.primary}</strong>
            {r.secondary && <span className="faint"> &middot; {r.secondary}</span>}
          </span>
          <strong className="num">{r.value}</strong>
          <div className="bar-track" aria-hidden="true">
            <span style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
