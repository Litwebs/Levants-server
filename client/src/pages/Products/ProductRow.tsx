import { Badge, Button, TableCell, TableRow } from "../../components/common";
import { useNavigate } from "react-router-dom";
import { getImageUrl, getStatusBadge } from "./product.utils";
import { usePermissions } from "@/hooks/usePermissions";
import styles from "./Products.module.css";

const ProductRow = ({
  product,
  counts,
  handleEditProduct,
}: any) => {
  const variantCount = counts?.total ?? product.variants?.length ?? 0;
  const lowCount = counts?.low ?? 0;
  const outCount = counts?.out ?? 0;
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canUpdateProduct = hasPermission("products.update");

  const thumbnailUrl = getImageUrl(product?.thumbnailImage);
  return (
    <TableRow
      onClick={() => {
        navigate(`/products/${product._id}`);
      }}
      className={styles.clickableRow}
      role="link"
      tabIndex={0}
      aria-label={`View ${product.name}`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(`/products/${product._id}`);
        }
      }}
    >
      <TableCell>
        <div className={styles.productCell}>
          <img
            src={thumbnailUrl}
            alt={product.name}
            className={styles.productImage}
          />
          <div className={styles.productInfo}>
            <span className={styles.productName}>{product.name}</span>
            <span className={styles.productSku}>{product.slug}</span>
          </div>
        </div>
      </TableCell>

      <TableCell align="center" className={styles.centeredTagCell}>
        <Badge variant="default">{product.category}</Badge>
      </TableCell>

      <TableCell align="center" className={styles.centeredTagCell}>
        {getStatusBadge(product.status)}
      </TableCell>

      <TableCell align="center" className={styles.centeredTagCell}>
        <Badge variant="outline" size="sm">{variantCount}</Badge>
      </TableCell>

      <TableCell align="center" className={styles.centeredTagCell}>
        <Badge variant={lowCount > 0 ? "warning" : "default"} size="sm">
          {lowCount}
        </Badge>
      </TableCell>

      <TableCell align="center" className={styles.centeredTagCell}>
        <Badge variant={outCount > 0 ? "error" : "success"} size="sm">
          {outCount}
        </Badge>
      </TableCell>

      <TableCell align="right" className={styles.actionsCell}>
        <div className={styles.actions}>
          {canUpdateProduct ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleEditProduct(product);
              }}
              aria-label={`Edit ${product.name}`}
              title={`Edit ${product.name}`}
            >
              Edit
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
};

export default ProductRow;
