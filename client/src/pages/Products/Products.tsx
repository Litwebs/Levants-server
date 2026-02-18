import styles from "./Products.module.css";
import { useProducts } from "./useProducts";

import ProductsHeader from "./ProductsHeader";
import ProductsStats from "./ProductsStats";
import ProductsFilters from "./ProductsFilters";
import ProductsTable from "./ProductsTable";

import ProductViewModal from "./Models/ProductViewModal";
import ProductEditModal from "./Models/ProductEditModal";
import ProductCreateModal from "./Models/ProductCreateModal";
import ProductDeleteModal from "./Models/ProductDeleteModal";

const Products = () => {
  const productsState = useProducts();

  return (
    <div className={styles.container}>
      <ProductsHeader {...productsState} />
      <ProductsStats {...productsState} />
      <ProductsFilters {...productsState} />
      <ProductsTable {...productsState} />

      <ProductViewModal {...productsState} />
      <ProductEditModal {...productsState} />
      <ProductCreateModal {...productsState} />
      <ProductDeleteModal {...productsState} />
    </div>
  );
};

export default Products;
