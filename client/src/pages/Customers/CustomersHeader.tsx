import { Users, UserPlus } from "lucide-react";
import { Button } from "../../components/common";
import styles from "./Customers.module.css";
import { usePermissions } from "@/hooks/usePermissions";

const CustomersHeader = ({
  openCreateInviteModal,
}: {
  openCreateInviteModal: () => void;
}) => {
  const { hasPermission } = usePermissions();

  return (
    <div className={styles.header}>
      <div className={styles.titleSection}>
        <Users size={28} />
        <div>
          <h1 className={styles.title}>Customers</h1>
          <p className={styles.subtitle}>Manage guests and registered accounts</p>
        </div>
      </div>
      <div className={styles.headerActions}>
        {hasPermission("customers.create") && (
          <Button variant="primary" onClick={openCreateInviteModal}>
            <UserPlus size={18} /> Create Customer Link
          </Button>
        )}
      </div>
    </div>
  );
};

export default CustomersHeader;
