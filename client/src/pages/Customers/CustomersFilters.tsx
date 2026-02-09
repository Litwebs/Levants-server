import { Search } from "lucide-react";
import {
  Card,
  Input,
  PageToolbar,
  ToolbarStart,
} from "../../components/common";
import styles from "./Customers.module.css";

const CustomersFilters = ({ searchQuery, setSearchQuery }: any) => (
  <Card className={styles.filtersCard}>
    <PageToolbar>
      <ToolbarStart>
        <Input
          placeholder="Search by name, email, phone, or postcode..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search size={18} />}
        />
      </ToolbarStart>
    </PageToolbar>
  </Card>
);

export default CustomersFilters;
