import React from "react";
import { Skeleton } from "../Skeleton";
import { useDataTableLoading } from "../DataTableCard/DataTableLoadingContext";
import styles from "./Table.module.css";

interface TableProps {
  children: React.ReactNode;
  className?: string;
  tableClassName?: string;
  withWrapper?: boolean;
}

export const Table: React.FC<TableProps> = ({
  children,
  className = "",
  tableClassName = "",
  withWrapper = true,
}) => {
  const { loading, label, rowCount } = useDataTableLoading();
  const columnCount = Math.max(1, countHeaderColumns(children));
  const content = loading
    ? replaceTableBody(children, (
        <tbody className={styles.body} aria-hidden="true">
          {Array.from({ length: rowCount }, (_, rowIndex) => (
            <tr className={`${styles.row} ${styles.skeletonRow}`} key={rowIndex}>
              {Array.from({ length: columnCount }, (__, columnIndex) => (
                <td className={styles.td} key={columnIndex}>
                  <Skeleton
                    variant="text"
                    height={columnIndex === 0 ? 18 : 16}
                    width={getSkeletonWidth(rowIndex, columnIndex)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      ))
    : children;

  const table = (
    <table
      className={`${styles.table} ${tableClassName}`}
      aria-busy={loading || undefined}
      aria-label={loading ? label : undefined}
    >
      {content}
    </table>
  );

  if (!withWrapper) {
    return table;
  }

  return (
    <div className={`${styles.tableWrapper} ${className}`}>
      {table}
    </div>
  );
};

const countHeaderColumns = (node: React.ReactNode): number => {
  let count = 0;
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode; colSpan?: number }>(child)) return;
    if (child.type === "tr" || child.type === TableRow) {
      const rowCount = React.Children.toArray(child.props.children).reduce(
        (total, cell) =>
          total + (React.isValidElement<{ colSpan?: number }>(cell) ? cell.props.colSpan || 1 : 0),
        0,
      );
      count = Math.max(count, rowCount);
      return;
    }
    count = Math.max(count, countHeaderColumns(child.props.children));
  });
  return count;
};

const replaceTableBody = (node: React.ReactNode, replacement: React.ReactElement) =>
  React.Children.map(node, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return child;
    if (child.type === "tbody" || child.type === TableBody) return replacement;
    return React.cloneElement(child, {
      children: replaceTableBody(child.props.children, replacement),
    });
  });

const getSkeletonWidth = (rowIndex: number, columnIndex: number) => {
  const widths = ["72%", "58%", "42%", "66%", "48%", "56%"];
  return widths[(rowIndex + columnIndex * 2) % widths.length];
};

export const TableHeader: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <thead className={styles.header}>{children}</thead>;

export const TableBody: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <tbody className={styles.body}>{children}</tbody>;

export const TableRow: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}> = ({ children, onClick, selected, className = "" }) => (
  <tr
    className={`${styles.row} ${onClick ? styles.clickable : ""} ${selected ? styles.selected : ""} ${className}`}
    onClick={onClick}
  >
    {children}
  </tr>
);

interface TableHeadProps {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  sorted?: "asc" | "desc" | null;
  onSort?: () => void;
  width?: string | number;
}

export const TableHead: React.FC<TableHeadProps> = ({
  children,
  align = "left",
  sortable,
  sorted,
  onSort,
  width,
}) => (
  <th
    className={`${styles.th} ${styles[`align-${align}`]} ${sortable ? styles.sortable : ""}`}
    style={{ width }}
    onClick={sortable ? onSort : undefined}
  >
    <span className={styles.thContent}>
      {children}
      {sortable && (
        <span className={`${styles.sortIcon} ${sorted ? styles.sorted : ""}`}>
          {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "↕"}
        </span>
      )}
    </span>
  </th>
);

type NativeTdProps = Omit<
  React.TdHTMLAttributes<HTMLTableCellElement>,
  "children" | "className"
>;

interface TableCellProps extends NativeTdProps {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

export const TableCell: React.FC<TableCellProps> = ({
  children,
  align = "left",
  className = "",
  ...rest
}) => (
  <td
    {...rest}
    className={`${styles.td} ${styles[`align-${align}`]} ${className}`}
  >
    {children}
  </td>
);
