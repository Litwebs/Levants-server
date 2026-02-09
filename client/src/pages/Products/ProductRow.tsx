import { Eye, Edit2, Trash2, AlertTriangle } from "lucide-react";
import { Badge, Button, TableCell, TableRow } from "../../components/common";
import { getStatusBadge } from "./product.utils";
import styles from "./Products.module.css";

const ProductRow = ({
  product,
  setSelectedProduct,
  setIsViewModalOpen,
  setIsEditModalOpen,
  setIsDeleteModalOpen,
  setProducts,
}: any) => {
  const isLow = product.stock.quantity <= product.stock.lowStockThreshold;
  const isOut = product.stock.quantity === 0;

  return (
    <TableRow>
      <TableCell>
        <div className={styles.productCell}>
          <img
            src={product.images[0]}
            alt={product.name}
            className={styles.productImage}
          />
          <div className={styles.productInfo}>
            <span className={styles.productName}>{product.name}</span>
            <span className={styles.productSku}>{product.sku}</span>
          </div>
        </div>
      </TableCell>

      <TableCell>
        <Badge variant="default">{product.category}</Badge>
      </TableCell>

      <TableCell>£{product.price.toFixed(2)}</TableCell>

      <TableCell>
        <div className={styles.stockCell}>
          <input
            type="number"
            min="0"
            value={product.stock.quantity}
            onChange={(e) =>
              setProducts((prev: any[]) =>
                prev.map((p) =>
                  p.id === product.id
                    ? {
                        ...p,
                        stock: {
                          ...p.stock,
                          quantity: +e.target.value,
                          inStock: +e.target.value > 0,
                        },
                        updatedAt: new Date().toISOString(),
                      }
                    : p,
                ),
              )
            }
            className={`${styles.stockInput} ${
              isLow ? styles.lowStock : ""
            } ${isOut ? styles.outOfStock : ""}`}
          />
          {isLow && !isOut && (
            <AlertTriangle size={14} className={styles.stockWarning} />
          )}
        </div>
      </TableCell>

      <TableCell>
        <button
          className={styles.statusToggle}
          onClick={() => {
            setProducts((prev: any[]) =>
              prev.map((p) =>
                p.id === product.id
                  ? {
                      ...p,
                      status: p.status === "active" ? "draft" : "active",
                      updatedAt: new Date().toISOString(),
                    }
                  : p,
              ),
            );
          }}
        >
          {getStatusBadge(product.status)}
        </button>
      </TableCell>

      <TableCell>
        <div className={styles.badgesCell}>
          {product.badges.map((b: string, i: number) => (
            <Badge key={i} size="sm">
              {b}
            </Badge>
          ))}
        </div>
      </TableCell>

      <TableCell>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedProduct(product);
              setIsViewModalOpen(true);
            }}
          >
            <Eye size={16} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedProduct(product);
              setIsEditModalOpen(true);
            }}
          >
            <Edit2 size={16} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedProduct(product);
              setIsDeleteModalOpen(true);
            }}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default ProductRow;
