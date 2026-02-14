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
import { UserPlus, CheckCircle2, XCircle } from "lucide-react";
import styles from "../Settings.module.css";

const getRoleBadge = (role?: string) => {
  const variants: Record<
    string,
    "default" | "success" | "warning" | "error" | "info"
  > = {
    admin: "error",
    manager: "warning",
    staff: "info",
    driver: "success",
  };

  const safeRole = (role || "unknown").toLowerCase();

  return (
    <Badge variant={variants[safeRole] || "default"}>
      {safeRole.charAt(0).toUpperCase() + safeRole.slice(1)}
    </Badge>
  );
};

const getUserId = (user: any) => String(user?._id || user?.id || "");

const getRoleName = (user: any) => {
  const role = user?.role;
  if (!role) return undefined;
  if (typeof role === "string") return role;
  if (typeof role === "object" && role?.name) return String(role.name);
  return undefined;
};

const formatDateTime = (value: any) => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
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
            </TableRow>
          </TableHeader>

          <TableBody>
            {users.map((user: any) => (
              <TableRow
                key={getUserId(user)}
                onClick={() => handleOpenUserModal("edit", user)}
              >
                <TableCell>
                  <div className={styles.userCell}>
                    <div className={styles.userAvatar}>
                      {String(user.name || "U")
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((n: string) => n[0])
                        .join("")}
                    </div>
                    <div>
                      <div className={styles.userName}>{user.name}</div>
                      <div className={styles.userEmail}>{user.email}</div>
                    </div>
                  </div>
                </TableCell>

                <TableCell>{getRoleBadge(getRoleName(user))}</TableCell>

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

                <TableCell>{formatDateTime(user.lastLoginAt)}</TableCell>
                <TableCell>{formatDateTime(user.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};

export default UsersTab;
