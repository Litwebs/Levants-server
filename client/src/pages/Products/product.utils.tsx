import { Badge } from "../../components/common";
import { Product } from "../data/mockData";

export const getStatusBadge = (status: Product["status"]) => {
  const variants: Record<Product["status"], "success" | "warning" | "default"> =
    {
      active: "success",
      draft: "warning",
      archived: "default",
    };

  return <Badge variant={variants[status]}>{status}</Badge>;
};
