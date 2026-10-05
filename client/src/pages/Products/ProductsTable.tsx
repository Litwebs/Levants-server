import styles from "./Products.module.css";
import {
  DataTableCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/common";
import sharedTableStyles from "../../components/common/DataTableCard/DataTableCard.module.css";
import ProductRow from "./ProductRow";
import { useMemo } from "react";

const ProductsTable = ({
  pagedProducts,
  isLoading,
  page,
  setPage,
  pageSize,
  setPageSize,
  paginationMeta,
  productVariantCounts,
  handleEditProduct,
}: any) => {
  const total = paginationMeta?.total ?? 0;
  const totalPages = paginationMeta?.totalPages ?? 1;
  const pageSizeOptions = useMemo(
    () => [
      { value: "20", label: "20 / page" },
      { value: "50", label: "50 / page" },
      { value: "100", label: "100 / page" },
    ],
    [],
  );

  return (
    <DataTableCard
      className={styles.productsTableCard}
      loading={isLoading}
      loadingText="Loading products…"
      pagination={{
        page,
        pageSize,
        total,
        totalPages,
        setPage,
        setPageSize,
        pageSizeOptions,
        loading: isLoading,
        footerClassName: styles.productsPagination,
      }}
    >
      <Table withWrapper={false} tableClassName={styles.responsiveProductsTable}>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead align="center">Category</TableHead>
            <TableHead align="center">Status</TableHead>
            <TableHead align="center">Variants</TableHead>
            <TableHead align="center">Low stock</TableHead>
            <TableHead align="center">Out of stock</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {(pagedProducts?.length ?? 0) === 0 ? (
            <TableRow className={sharedTableStyles.emptyStateRow}>
              <TableCell className={sharedTableStyles.emptyTableCell} colSpan={7}>
                No products found.
              </TableCell>
            </TableRow>
          ) : (
            pagedProducts.map((product: any) => (
              <ProductRow
                key={product._id}
                product={product}
                counts={productVariantCounts?.[product._id]}
                handleEditProduct={handleEditProduct}
              />
            ))
          )}
        </TableBody>
      </Table>
    </DataTableCard>
  );
};

export default ProductsTable;
