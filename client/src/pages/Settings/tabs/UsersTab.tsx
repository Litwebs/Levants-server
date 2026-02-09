import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/common/Table";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import {
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  UserPlus,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import styles from "../Settings.module.css";

const getRoleBadge = (role: string) => {
  const variants: Record<
    string,
    "default" | "success" | "warning" | "error" | "info"
  > = {
    admin: "error",
    manager: "warning",
    staff: "info",
    driver: "success",
  };

  return (
    <Badge variant={variants[role]}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </Badge>
  );
};

const UsersTab = ({
  users,
  handleOpenUserModal,
  handleToggleUserStatus,
  handleDeleteUser,
}: any) => {
  return (
    <Card className={styles.settingsCard}>
      <div className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>User Management</h2>
          <p className={styles.cardDescription}>
            Manage team members and their access levels
          </p>
        </div>
        <Button variant="primary" onClick={() => handleOpenUserModal("add")}>
          <UserPlus size={18} />
          Add User
        </Button>
      </div>

      <div className={styles.tableWrapper}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Created</TableHead>
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

                <TableCell>{getRoleBadge(user.role)}</TableCell>

                <TableCell>
                  <Badge
                    variant={user.status === "active" ? "success" : "default"}
                  >
                    {user.status === "active" ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <XCircle size={14} />
                    )}
                    {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                  </Badge>
                </TableCell>

                <TableCell>{user.lastLogin}</TableCell>
                <TableCell>{user.createdAt}</TableCell>

                <TableCell>
                  <div className={styles.actions}>
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleOpenUserModal("edit", user)}
                      title="Edit user"
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      className={styles.actionBtn}
                      onClick={() => handleToggleUserStatus(user.id)}
                      title={
                        user.status === "active" ? "Deactivate" : "Activate"
                      }
                    >
                      {user.status === "active" ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>

                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => handleDeleteUser(user.id)}
                      title="Delete user"
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
    </Card>
  );
};

export default UsersTab;
