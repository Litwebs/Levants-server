import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardFooter } from "../Card";
import { Button } from "../Button";
import { Select } from "../Select";
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
  loadingOverlayClassName?: string;
  loadingInnerClassName?: string;
  spinnerClassName?: string;
  pagination?: PaginationConfig;
  children: React.ReactNode;
}

export const DataTableCard: React.FC<DataTableCardProps> = ({
  className,
  tableAreaClassName,
  tableWrapperClassName,
  loading = false,
  loadingText = "Loading...",
  loadingOverlayClassName,
  loadingInnerClassName,
  spinnerClassName,
  pagination,
  children,
}) => {
  const cx = (...classes: Array<string | undefined>) =>
    classes.filter(Boolean).join(" ");

  const [paginationAction, setPaginationAction] = useState<
    "prev" | "next" | null
  >(null);

  useEffect(() => {
    if (!loading) {
      setPaginationAction(null);
    }
  }, [loading]);

  return (
    <Card className={className}>
      <div className={cx(styles.tableArea, tableAreaClassName)}>
        <div className={cx(styles.tableWrapper, tableWrapperClassName)}>
          {children}
        </div>
      </div>

      {loading ? (
        <div
          className={cx(styles.tableLoadingOverlay, loadingOverlayClassName)}
          aria-live="polite"
        >
          <div className={cx(styles.tableLoadingInner, loadingInnerClassName)}>
            <Loader2
              size={16}
              className={cx(styles.spinnerIcon, spinnerClassName)}
            />
            {loadingText}
          </div>
        </div>
      ) : null}

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
                  setPaginationAction("prev");
                  pagination.setPage((currentPage) =>
                    Math.max(1, currentPage - 1),
                  );
                }}
              >
                {pagination.loading && paginationAction === "prev" ? (
                  <Loader2
                    size={14}
                    className={cx(styles.spinnerIcon, spinnerClassName)}
                  />
                ) : (
                  <>
                    <ChevronLeft size={16} />
                    Prev
                  </>
                )}
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
                  setPaginationAction("next");
                  pagination.setPage((currentPage) =>
                    Math.min(pagination.totalPages, currentPage + 1),
                  );
                }}
              >
                {pagination.loading && paginationAction === "next" ? (
                  <Loader2
                    size={14}
                    className={cx(styles.spinnerIcon, spinnerClassName)}
                  />
                ) : (
                  <>
                    Next
                    <ChevronRight size={16} />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardFooter>
      ) : null}
    </Card>
  );
};
