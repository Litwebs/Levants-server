import { Eye, Edit2, Trash2 } from "lucide-react";
import { Badge, Button, TableCell, TableRow } from "../../components/common";
import { useNavigate } from "react-router-dom";
import { getImageUrl, getStatusBadge } from "./product.utils";
import { usePermissions } from "@/hooks/usePermissions";
import styles from "./Products.module.css";

const ProductRow = ({
  product,
  counts,
  setSelectedProduct,
  setIsViewModalOpen,
  setIsDeleteModalOpen,
  handleEditProduct,
}: any) => {
  const variantCount = counts?.total ?? product.variants?.length ?? 0;
  const lowCount = counts?.low ?? 0;
  const outCount = counts?.out ?? 0;
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canUpdateProduct = hasPermission("products.update");
  const canDeleteProduct = hasPermission("products.delete");

  const thumbnailUrl = getImageUrl(product?.thumbnailImage);
  return (
    <TableRow
      onClick={() => {
        handleEditProduct(product);
      }}
      className={styles.clickableRow}
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

      <TableCell>
        <Badge variant="default">{product.category}</Badge>
      </TableCell>

      <TableCell>{getStatusBadge(product.status)}</TableCell>

      <TableCell>
        <div className={styles.badgesCell}>
          <Badge size="sm">{variantCount}</Badge>
          {lowCount > 0 ? (
            <Badge variant="warning" size="sm">
              Low {lowCount}
            </Badge>
          ) : null}
          {outCount > 0 ? (
            <Badge variant="error" size="sm">
              OOS {outCount}
            </Badge>
          ) : null}
        </div>
      </TableCell>

      <TableCell>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedProduct(product);
              navigate(`/products/${product._id}`);
            }}
          >
            <Eye size={16} />
          </Button>

          {canUpdateProduct ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleEditProduct(product);
              }}
            >
              <Edit2 size={16} />
            </Button>
          ) : null}

          {canDeleteProduct ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedProduct(product);
                setIsDeleteModalOpen(true);
              }}
            >
              <Trash2 size={16} />
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
};

export default ProductRow;
