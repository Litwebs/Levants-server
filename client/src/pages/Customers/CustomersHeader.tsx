import { Users, UserPlus, Download } from "lucide-react";
import { Button } from "../../components/common";
import styles from "./Customers.module.css";

const CustomersHeader = ({ exportCustomers, openCreateInviteModal }: any) => (
  <div className={styles.header}>
    <div className={styles.titleSection}>
      <Users size={28} />
      <div>
        <h1 className={styles.title}>Customers</h1>
        <p className={styles.subtitle}>Manage your customer database</p>
      </div>
    </div>
    <div className={styles.headerActions}>
      <Button variant="primary" onClick={openCreateInviteModal}>
        <UserPlus size={18} /> Create Customer Link
      </Button>
      {/* <Button variant="outline" onClick={exportCustomers}>
        <Download size={18} /> Export CSV
      </Button> */}
    </div>
  </div>
);

export default CustomersHeader;
