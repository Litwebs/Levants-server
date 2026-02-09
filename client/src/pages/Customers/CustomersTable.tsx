import { Eye, Edit2, Phone, MapPin } from "lucide-react";
import {
  Card,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Badge,
} from "../../components/common";
import styles from "./Customers.module.css";

const CustomersTable = ({
  filteredCustomers,
  handleViewCustomer,
  handleEditCustomer,
}: any) => (
  <Card>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Orders</TableHead>
          <TableHead>Last Order</TableHead>
          <TableHead>Marketing</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {filteredCustomers.map((c: any) => (
          <TableRow key={c.id}>
            <TableCell>{c.name}</TableCell>
            <TableCell>
              <span
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <Phone size={14} /> {c.phone}
              </span>
              <span
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <MapPin size={14} /> {c.addresses[0]?.postcode}
              </span>
            </TableCell>
            <TableCell>{c.orderCount}</TableCell>
            <TableCell>{c.lastOrderAt ?? "Never"}</TableCell>
            <TableCell>
              <Badge variant={c.marketingOptIn ? "success" : "default"}>
                {c.marketingOptIn ? "Opted In" : "Opted Out"}
              </Badge>
            </TableCell>
            <TableCell>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleViewCustomer(c)}
              >
                <Eye size={16} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleEditCustomer(c)}
              >
                <Edit2 size={16} />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Card>
);

export default CustomersTable;
