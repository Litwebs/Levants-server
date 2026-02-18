import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
} from "@/components/common";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import styles from "../Settings.module.css";

const UsersTable = ({ users, openUserModal, deleteUser }: any) => {
  return (
    <div className={styles.tableWrapper}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {users.map((user: any) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className={styles.userCell}>
                  <div className={styles.userAvatar}>
                    {user.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <div className={styles.userName}>{user.name}</div>
                    <div className={styles.userEmail}>{user.email}</div>
                  </div>
                </div>
              </TableCell>

              <TableCell>
                <Badge variant="info">{user.role}</Badge>
              </TableCell>

              <TableCell>
                <Badge
                  variant={user.status === "active" ? "success" : "default"}
                >
                  {user.status}
                </Badge>
              </TableCell>

              <TableCell>
                <div className={styles.actions}>
                  <button
                    className={styles.actionBtn}
                    onClick={() => openUserModal("edit", user)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={() => deleteUser(user.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default UsersTable;
