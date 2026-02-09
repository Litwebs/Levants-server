import styles from "./Customers.module.css";
import { useCustomers } from "./useCustomers";

import CustomersHeader from "./CustomersHeader";
import CustomersStats from "./CustomersStats";
import CustomersFilters from "./CustomersFilters";
import CustomersTable from "./CustomersTable";
import CustomerViewModal from "./CustomerViewModal";
import CustomerEditModal from "./CustomerEditModal";

const Customers = () => {
  const customersState = useCustomers();

  return (
    <div className={styles.container}>
      <CustomersHeader {...customersState} />
      <CustomersStats {...customersState} />
      <CustomersFilters {...customersState} />
      <CustomersTable {...customersState} />

      <CustomerViewModal {...customersState} />
      <CustomerEditModal {...customersState} />
    </div>
  );
};

export default Customers;
