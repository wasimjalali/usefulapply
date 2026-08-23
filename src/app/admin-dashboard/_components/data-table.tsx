import type { CSSProperties, ReactNode } from 'react';

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  align?: 'left' | 'right';
  width?: CSSProperties['width'];
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  caption: string;
  emptyState?: ReactNode;
  minWidth?: CSSProperties['minWidth'];
}

export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
  caption,
  emptyState,
  minWidth = 720,
}: DataTableProps<Row>) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table" style={{ minWidth }}>
        <caption className="admin-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.align === 'right' ? 'admin-table__numeric' : undefined}
                style={{ width: column.width }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.align === 'right' ? 'admin-table__numeric' : undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && emptyState ? (
            <tr className="admin-table__empty-row">
              <td colSpan={columns.length}>{emptyState}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
