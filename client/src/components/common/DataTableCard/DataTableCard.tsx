import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardFooter } from "../Card";
import { Button } from "../Button";
import { Select } from "../Select";
import { LoadingScreen } from "../LoadingScreen";
import styles from "./DataTableCard.module.css";

interface PaginationOption {
  value: string;
  label: string;
}

interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  setPageSize: (size: number) => void;
  pageSizeOptions: PaginationOption[];
  loading?: boolean;
  footerClassName?: string;
  infoClassName?: string;
  controlsClassName?: string;
  pageSizeSelectClassName?: string;
  pageButtonsClassName?: string;
  pageLabelClassName?: string;
}

interface DataTableCardProps {
  className?: string;
  tableAreaClassName?: string;
  tableWrapperClassName?: string;
  loading?: boolean;
  loadingText?: string;
  pagination?: PaginationConfig;
  children: React.ReactNode;
}

export const DataTableCard: React.FC<DataTableCardProps> = ({
  className,
  tableAreaClassName,
  tableWrapperClassName,
  loading = false,
  loadingText = "Loading...",
  pagination,
  children,
}) => {
  const cx = (...classes: Array<string | undefined>) =>
    classes.filter(Boolean).join(" ");

  return (
    <Card className={className}>
      <div className={cx(styles.tableArea, tableAreaClassName)}>
        <div className={cx(styles.tableWrapper, tableWrapperClassName)}>
          {children}
        </div>
        <LoadingScreen
          active={loading}
          label={loadingText}
          minimumVisibleMs={450}
          variant="contained"
        />
      </div>

      {pagination ? (
        <CardFooter
          className={cx(styles.paginationFooter, pagination.footerClassName)}
        >
          <div className={cx(styles.paginationInfo, pagination.infoClassName)}>
            Showing{" "}
            {pagination.total === 0
              ? 0
              : (pagination.page - 1) * pagination.pageSize + 1}{" "}
            -{" "}
            {pagination.total === 0
              ? 0
              : Math.min(
                  pagination.page * pagination.pageSize,
                  pagination.total,
                )}{" "}
            of {pagination.total}
          </div>

          <div
            className={cx(
              styles.paginationControls,
              pagination.controlsClassName,
            )}
          >
            <Select
              className={cx(
                styles.pageSizeSelect,
                pagination.pageSizeSelectClassName,
              )}
              value={String(pagination.pageSize)}
              disabled={pagination.loading}
              onChange={(value) => {
                pagination.setPageSize(Number(value));
                pagination.setPage(1);
              }}
              options={pagination.pageSizeOptions}
            />

            <div
              className={cx(
                styles.pageButtons,
                pagination.pageButtonsClassName,
              )}
            >
              <Button
                variant="outline"
                size="sm"
                disabled={Boolean(pagination.loading) || pagination.page <= 1}
                onClick={() => {
                  pagination.setPage((currentPage) =>
                    Math.max(1, currentPage - 1),
                  );
                }}
              >
                <ChevronLeft size={16} />
                Prev
              </Button>

              <div
                className={cx(styles.pageLabel, pagination.pageLabelClassName)}
              >
                Page {pagination.page} / {pagination.totalPages}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={
                  Boolean(pagination.loading) ||
                  pagination.page >= pagination.totalPages
                }
                onClick={() => {
                  pagination.setPage((currentPage) =>
                    Math.min(pagination.totalPages, currentPage + 1),
                  );
                }}
              >
                Next
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        </CardFooter>
      ) : null}
    </Card>
  );
};
