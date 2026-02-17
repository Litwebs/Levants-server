import { useState } from "react";
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
import { Modal, ModalFooter } from "@/components/common";
import {
  UserPlus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
} from "lucide-react";
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

const getUserStatusBadge = (user: any) => {
  const verifiedAt = user?.emailVerifiedAt;
  const inviteExpiresAt = user?.inviteTokenExpiresAt;
  const pendingEmail = user?.pendingEmail;

  const now = Date.now();
  const inviteExpiryMs = inviteExpiresAt
    ? new Date(inviteExpiresAt).getTime()
    : NaN;
  const inviteHasExpiry = Number.isFinite(inviteExpiryMs);

  // Pending invitation acceptance to verify email
  if (!verifiedAt && inviteHasExpiry) {
    const expired = inviteExpiryMs <= now;
    return (
      <Badge variant={expired ? "default" : "warning"}>
        <XCircle size={14} />
        {expired ? "Invitation Expired" : "Invitation Pending"}
      </Badge>
    );
  }

  // Pending email change confirmation
  if (pendingEmail) {
    return (
      <Badge variant="warning">
        <XCircle size={14} />
        Email Change Pending
      </Badge>
    );
  }

  // Normal active/disabled status
  return (
    <Badge variant={user.status === "active" ? "success" : "default"}>
      {user.status === "active" ? (
        <CheckCircle2 size={14} />
      ) : (
        <XCircle size={14} />
      )}
      {String(user.status || "")
        .charAt(0)
        .toUpperCase() + String(user.status || "").slice(1)}
    </Badge>
  );
};

const UsersTab = ({
  users,
  handleOpenUserModal,
  handleToggleUserStatus,
  handleDeleteUser,
}: any) => {
  const [confirmUser, setConfirmUser] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const closeConfirm = () => {
    if (deleteLoading) return;
    setConfirmUser(null);
  };

  const confirmDelete = async () => {
    if (!confirmUser) return;
    setDeleteLoading(true);
    try {
      await handleDeleteUser(getUserId(confirmUser));
      setConfirmUser(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
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

                  <TableCell>{getUserStatusBadge(user)}</TableCell>

                  <TableCell>{formatDateTime(user.lastLoginAt)}</TableCell>
                  <TableCell>{formatDateTime(user.createdAt)}</TableCell>

                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e: any) => {
                        e?.stopPropagation?.();
                        setConfirmUser(user);
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Modal
        isOpen={!!confirmUser}
        onClose={closeConfirm}
        title="Delete User"
        size="sm"
      >
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            alignItems: "flex-start",
          }}
        >
          <div style={{ marginTop: 2, color: "var(--color-warning-600)" }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <p style={{ marginBottom: "var(--space-2)" }}>
              Delete <strong>{confirmUser?.name || "this user"}</strong>?
            </p>
            <p
              style={{
                color: "var(--color-gray-600)",
                fontSize: "var(--text-sm)",
              }}
            >
              This cannot be undone.
            </p>
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={closeConfirm}
            disabled={deleteLoading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={confirmDelete}
            disabled={deleteLoading}
          >
            <Trash2 size={16} />
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default UsersTab;
