import { useMemo, useState, type ReactNode } from 'react';
import { EmptyState } from '../../shared/ui/Feedback';
import { Icon } from '../../shared/ui/Icon';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Value used for sorting and text filtering; omit to make the column neither sortable nor searchable. */
  value?: (row: T) => string | number;
  align?: 'right';
}

/**
 * A table with a text filter and sortable headers. Both work on the rows of the page that was loaded, which
 * the label says out loud; the server still paginates.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  filterLabel = 'Filter this page',
  empty
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  filterLabel?: string;
  empty?: string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q) out = out.filter((r) => columns.some((c) => c.value && String(c.value(r)).toLowerCase().includes(q)));
    const col = columns.find((c) => c.key === sort?.key);
    if (col?.value && sort) {
      const get = col.value;
      out = [...out].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir;
      });
    }
    return out;
  }, [rows, columns, query, sort]);

  const toggle = (key: string) => setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));

  return (
    <div className="stack">
      <div className="input-icon" style={{ maxWidth: 360 }}>
        <Icon name="search" />
        <input type="search" aria-label={filterLabel} placeholder={filterLabel} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {shown.length === 0 ? (
        <div className="card">
          <EmptyState icon="search" title={empty ?? 'Nothing to show'}>
            {query ? 'No rows on this page match your filter.' : undefined}
          </EmptyState>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={c.align ? { textAlign: c.align } : undefined}
                    aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : c.value ? 'none' : undefined}
                  >
                    {c.value ? (
                      <button type="button" onClick={() => toggle(c.key)}>
                        {c.header}
                        {sort?.key === c.key && <Icon name="sort" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((c) => (
                    <td key={c.key} style={c.align ? { textAlign: c.align } : undefined}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
