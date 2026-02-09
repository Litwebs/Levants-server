import styles from "./Products.module.css";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  Card,
} from "../../components/common";
import ProductRow from "./ProductRow";

const ProductsTable = ({
  filteredProducts,
  setSelectedProduct,
  setIsViewModalOpen,
  setIsEditModalOpen,
  setIsDeleteModalOpen,
  setProducts,
}: any) => {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>Stock</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Badges</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {filteredProducts.map((product: any) => (
            <ProductRow
              key={product.id}
              product={product}
              setSelectedProduct={setSelectedProduct}
              setIsViewModalOpen={setIsViewModalOpen}
              setIsEditModalOpen={setIsEditModalOpen}
              setIsDeleteModalOpen={setIsDeleteModalOpen}
              setProducts={setProducts}
            />
          ))}
        </TableBody>
      </Table>

      {filteredProducts.length === 0 && (
        <div className={styles.emptyState}>No products found</div>
      )}
    </Card>
  );
};

export default ProductsTable;
