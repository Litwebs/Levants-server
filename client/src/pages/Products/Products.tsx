import styles from "./Products.module.css";
import { useProducts } from "./useProducts";

import ProductsHeader from "./ProductsHeader";
import ProductsStats from "./ProductsStats";
import ProductsFilters from "./ProductsFilters";
import ProductsTable from "./ProductsTable";

import ProductViewModal from "./Models/ProductViewModal";
import ProductDeleteModal from "./Models/ProductDeleteModal";
import { PageContainer } from "../../components/common";

const Products = () => {
  const productsState = useProducts();

  return (
    <PageContainer className={styles.container}>
      <ProductsHeader {...productsState} />
      <ProductsStats {...productsState} />
      <ProductsFilters {...productsState} />
      <ProductsTable {...productsState} />

      <ProductViewModal {...productsState} />
      <ProductDeleteModal {...productsState} />
    </PageContainer>
  );
};

export default Products;
