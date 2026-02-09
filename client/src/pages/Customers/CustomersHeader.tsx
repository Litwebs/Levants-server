import { Users, Download } from "lucide-react";
import { Button } from "../../components/common";
import styles from "./Customers.module.css";

const CustomersHeader = ({ exportCustomers }: any) => (
  <div className={styles.header}>
    <div className={styles.titleSection}>
      <Users size={28} />
      <div>
        <h1 className={styles.title}>Customers</h1>
        <p className={styles.subtitle}>Manage your customer database</p>
      </div>
    </div>
    <Button variant="outline" onClick={exportCustomers}>
      <Download size={18} /> Export CSV
    </Button>
  </div>
);

export default CustomersHeader;
