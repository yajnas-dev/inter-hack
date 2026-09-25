import type { ReactNode } from 'react';

/** A graphite "window" for showing requests and responses; tokens colour the parts of the payload. */
export function CodeCard({ file, status, children, inline }: { file: string; status?: string; children: ReactNode; inline?: boolean }) {
  return (
    <figure className={`code-card${inline ? ' code-card-inline' : ''}`}>
      <figcaption className="code-card-bar">
        <span className="code-card-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="code-card-file">{file}</span>
        {status && (
          <span className="status-chip">
            <span className="status-chip-dot" aria-hidden="true" />
            {status}
          </span>
        )}
      </figcaption>
      <pre className="code">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

export const K = ({ children }: { children: ReactNode }) => <span className="c-key">{children}</span>;
export const S = ({ children }: { children: ReactNode }) => <span className="c-str">{children}</span>;
export const N = ({ children }: { children: ReactNode }) => <span className="c-num">{children}</span>;
export const P = ({ children }: { children: ReactNode }) => <span className="c-dim">{children}</span>;
export const F = ({ children }: { children: ReactNode }) => <span className="c-fn">{children}</span>;
