import React from 'react';
import styles from './Table.module.css';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ children, className = '' }) => (
  <div className={`${styles.tableWrapper} ${className}`}>
    <table className={styles.table}>{children}</table>
  </div>
);

export const TableHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead className={styles.header}>{children}</thead>
);

export const TableBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody className={styles.body}>{children}</tbody>
);

export const TableRow: React.FC<{ 
  children: React.ReactNode; 
  onClick?: () => void;
  selected?: boolean;
  className?: string;
}> = ({ children, onClick, selected, className = '' }) => (
  <tr 
    className={`${styles.row} ${onClick ? styles.clickable : ''} ${selected ? styles.selected : ''} ${className}`}
    onClick={onClick}
  >
    {children}
  </tr>
);

interface TableHeadProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  sorted?: 'asc' | 'desc' | null;
  onSort?: () => void;
  width?: string | number;
}

export const TableHead: React.FC<TableHeadProps> = ({ 
  children, 
  align = 'left',
  sortable,
  sorted,
  onSort,
  width
}) => (
  <th 
    className={`${styles.th} ${styles[`align-${align}`]} ${sortable ? styles.sortable : ''}`}
    style={{ width }}
    onClick={sortable ? onSort : undefined}
  >
    <span className={styles.thContent}>
      {children}
      {sortable && (
        <span className={`${styles.sortIcon} ${sorted ? styles.sorted : ''}`}>
          {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}
        </span>
      )}
    </span>
  </th>
);

interface TableCellProps {
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export const TableCell: React.FC<TableCellProps> = ({ 
  children, 
  align = 'left',
  className = '' 
}) => (
  <td className={`${styles.td} ${styles[`align-${align}`]} ${className}`}>
    {children}
  </td>
);
