import styles from "./Products.module.css";
import { DataTableCard, Table } from "../../components/common";
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
  setSelectedProduct,
  setIsViewModalOpen,
  handleEditProduct,
  setIsDeleteModalOpen,
}: any) => {
  const total = paginationMeta?.total ?? 0;
  const totalPages = paginationMeta?.totalPages ?? 1;
  const pageSizeOptions = useMemo(
    () => [
      { value: "50", label: "50 - page" },
      { value: "100", label: "100 - page" },
      { value: "200", label: "200 - page" },
    ],
    [],
  );

  return (
    <DataTableCard
      className={styles.tableCard}
      loading={isLoading}
      loadingText="Loading..."
      pagination={{
        page,
        pageSize,
        total,
        totalPages,
        setPage,
        setPageSize,
        pageSizeOptions,
        loading: isLoading,
      }}
    >
      <Table withWrapper={false} tableClassName={sharedTableStyles.table}>
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th>Status</th>
            <th>Variants</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {(pagedProducts?.length ?? 0) === 0 ? (
            <tr className={sharedTableStyles.emptyStateRow}>
              <td className={sharedTableStyles.emptyTableCell} colSpan={5}>
                {isLoading ? "Loading products..." : "No products found."}
              </td>
            </tr>
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
        </tbody>
      </Table>
    </DataTableCard>
  );
};

export default ProductsTable;
