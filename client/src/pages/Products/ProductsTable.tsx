import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import styles from "./Products.module.css";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  Card,
  CardHeader,
  CardTitle,
  CardFooter,
  Button,
  Select,
} from "../../components/common";
import ProductRow from "./ProductRow";
import { useEffect, useState } from "react";

const ProductsTable = ({
  pagedProducts,
  isLoading,
  page,
  setPage,
  pageSize,
  setPageSize,
  paginationMeta,
  productVariantCounts,
  setSelectedProduct,
  setIsViewModalOpen,
  handleEditProduct,
  setIsDeleteModalOpen,
}: any) => {
  const total = paginationMeta?.total ?? 0;
  const totalPages = paginationMeta?.totalPages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

  const [paginationAction, setPaginationAction] = useState<
    "prev" | "next" | null
  >(null);

  useEffect(() => {
    if (!isLoading) {
      setPaginationAction(null);
    }
  }, [isLoading]);

  return (
    <Card className={styles.tableCard}>
      <CardHeader className={styles.tableHeader}>
        <CardTitle>Product List</CardTitle>
      </CardHeader>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Variants</TableHead>
            <TableHead align="left" width={160}>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {(pagedProducts?.length ?? 0) === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                align="center"
                className={styles.tableEmptyCell}
              >
                {isLoading ? "Loading products…" : "No products found."}
              </TableCell>
            </TableRow>
          ) : (
            pagedProducts.map((product: any) => (
              <ProductRow
                key={product._id}
                product={product}
                counts={productVariantCounts?.[product._id]}
                setSelectedProduct={setSelectedProduct}
                setIsViewModalOpen={setIsViewModalOpen}
                setIsDeleteModalOpen={setIsDeleteModalOpen}
                handleEditProduct={handleEditProduct}
              />
            ))
          )}
        </TableBody>
      </Table>

      <CardFooter className={styles.paginationFooter}>
        <div className={styles.paginationInfo}>
          Showing {rangeStart}–{rangeEnd} of {total}
        </div>

        <div className={styles.paginationControls}>
          <Select
            className={styles.pageSizeSelect}
            value={String(pageSize)}
            disabled={isLoading}
            onChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
            options={[
              { value: "10", label: "10 / page" },
              { value: "20", label: "20 / page" },
              { value: "50", label: "50 / page" },
            ]}
          />

          <div className={styles.pageButtons}>
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || page <= 1}
              onClick={() => {
                setPaginationAction("prev");
                setPage((p: number) => Math.max(1, p - 1));
              }}
            >
              {isLoading && paginationAction === "prev" ? (
                <Loader2 size={14} className={styles.spinnerIcon} />
              ) : (
                <>
                  <ChevronLeft size={16} />
                  Prev
                </>
              )}
            </Button>

            <div className={styles.pageLabel}>
              Page {page} / {totalPages}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={isLoading || page >= totalPages}
              onClick={() => {
                setPaginationAction("next");
                setPage((p: number) => Math.min(totalPages, p + 1));
              }}
            >
              {isLoading && paginationAction === "next" ? (
                <Loader2 size={14} className={styles.spinnerIcon} />
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
    </Card>
  );
};

export default ProductsTable;
