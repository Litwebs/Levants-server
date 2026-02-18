import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/common/Table";
import { Modal, ModalFooter } from "@/components/common";
import { useToast } from "@/components/common/Toast";

import { useAccess, type Role } from "@/context/Access";

import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import styles from "../Settings.module.css";
import productsStyles from "../../Products/Products.module.css";

import RoleModal from "../RoleModal";

const getRoleId = (role: Partial<Role>) => String(role?._id || role?.id || "");

const formatDateTime = (value: any) => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

type Draft = {
  name: string;
  description: string;
  permissions: string[];
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  permissions: [],
};

const RolesTab = () => {
  const { showToast } = useToast();
  const {
    roles,
    permissions,
    rolesLoading,
    permissionsLoading,
    listRoles,
    listPermissions,
    createRole,
    updateRole,
    deleteRole,
  } = useAccess();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const canEditSelected = useMemo(() => {
    if (!selectedRole) return true;
    return !selectedRole.isSystem;
  }, [selectedRole]);

  useEffect(() => {
    void listRoles().catch((err: any) => {
      showToast({
        type: "error",
        title: err?.response?.data?.message || "Failed to load roles",
      });
    });

    void listPermissions().catch((err: any) => {
      showToast({
        type: "error",
        title: err?.response?.data?.message || "Failed to load permissions",
      });
    });
  }, [listPermissions, listRoles, showToast]);

  const openCreate = () => {
    setSelectedRole(null);
    setDraft(emptyDraft);
    setModalMode("add");
    setModalOpen(true);
  };

  const openEdit = (role: Role) => {
    setSelectedRole(role);
    setDraft({
      name: String(role?.name || ""),
      description: String(role?.description || ""),
      permissions: Array.isArray(role?.permissions) ? role.permissions : [],
    });
    setModalMode("edit");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setDeleteConfirmOpen(false);
    setSelectedRole(null);
    setDraft(emptyDraft);
  };

  const handleSave = async () => {
    if (saving) return;

    if (modalMode === "add") {
      if (!draft.name.trim()) {
        showToast({ type: "error", title: "Role name is required" });
        return;
      }
      if (!Array.isArray(draft.permissions)) {
        showToast({ type: "error", title: "Permissions are required" });
        return;
      }

      setSaving(true);
      try {
        await createRole({
          name: draft.name.trim().toLowerCase(),
          description: draft.description || "",
          permissions: draft.permissions,
        });
        showToast({ type: "success", title: "Role created" });
        closeModal();
      } catch (err: any) {
        showToast({
          type: "error",
          title: err?.response?.data?.message || "Failed to create role",
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    // edit
    const roleId = selectedRole ? getRoleId(selectedRole) : "";
    if (!roleId) {
      showToast({ type: "error", title: "Role not found" });
      return;
    }

    if (!canEditSelected) {
      showToast({
        type: "error",
        title: "System roles cannot be modified",
      });
      return;
    }

    setSaving(true);
    try {
      await updateRole(roleId, {
        description: draft.description,
        permissions: draft.permissions,
      });
      showToast({ type: "success", title: "Role updated" });
      closeModal();
    } catch (err: any) {
      showToast({
        type: "error",
        title: err?.response?.data?.message || "Failed to update role",
      });
    } finally {
      setSaving(false);
    }
  };

  const requestDeleteSelected = () => {
    if (deleting || saving) return;
    if (!selectedRole) return;

    if (selectedRole.isSystem) {
      showToast({ type: "error", title: "System roles cannot be deleted" });
      return;
    }

    // Avoid having two modals open at the same time.
    setModalOpen(false);
    setDeleteConfirmOpen(true);
  };

  const cancelDeleteSelected = () => {
    if (deleting) return;
    setDeleteConfirmOpen(false);
    setModalOpen(true);
  };

  const confirmDeleteSelected = async () => {
    if (deleting || saving) return;
    if (!selectedRole) return;

    const roleId = getRoleId(selectedRole);
    if (!roleId) return;

    if (selectedRole.isSystem) {
      showToast({ type: "error", title: "System roles cannot be deleted" });
      return;
    }

    setDeleting(true);
    try {
      await deleteRole(roleId);
      showToast({ type: "success", title: "Role deleted" });
      setDeleteConfirmOpen(false);
      closeModal();
    } catch (err: any) {
      showToast({
        type: "error",
        title: err?.response?.data?.message || "Failed to delete role",
      });

      // Deletion failed; return user to the role modal.
      setDeleteConfirmOpen(false);
      setModalOpen(true);
    } finally {
      setDeleting(false);
    }
  };

  const loading = rolesLoading || permissionsLoading;

  return (
    <>
      <Card className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Role Management</h2>
            <p className={styles.cardDescription}>
              Create and manage roles and their permissions
            </p>
          </div>

          <Button variant="primary" onClick={openCreate}>
            <Plus size={18} />
            New Role
          </Button>
        </div>

        <div className={styles.tableWrapper}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Created</TableHead>
                {/* <TableHead>Actions</TableHead> */}
              </TableRow>
            </TableHeader>

            <TableBody>
              {roles.map((r) => {
                const id = getRoleId(r);
                const permCount = Array.isArray(r.permissions)
                  ? r.permissions.includes("*")
                    ? "All"
                    : String(r.permissions.length)
                  : "0";

                return (
                  <TableRow key={id || r.name} onClick={() => openEdit(r)}>
                    <TableCell>
                      <div className={styles.roleNameCell}>{r.name}</div>
                    </TableCell>

                    <TableCell>
                      {r.isSystem ? (
                        <Badge variant="outline">System</Badge>
                      ) : (
                        <Badge variant="info">Custom</Badge>
                      )}
                    </TableCell>

                    <TableCell>{r.description || "—"}</TableCell>

                    <TableCell>
                      <Badge variant="default">{permCount}</Badge>
                    </TableCell>

                    <TableCell>
                      {formatDateTime((r as any).createdAt)}
                    </TableCell>

                    {/* <TableCell>
                      <div className={styles.actions}>
                        <button
                          className={styles.actionBtn}
                          onClick={() => openEdit(r)}
                          title={r.isSystem ? "System role" : "Edit role"}
                          disabled={!!r.isSystem}
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          onClick={() => handleDelete(r)}
                          title={r.isSystem ? "System role" : "Delete role"}
                          disabled={!!r.isSystem}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </TableCell> */}
                  </TableRow>
                );
              })}

              {!loading && roles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>No roles found</TableCell>
                </TableRow>
              )}

              {loading && (
                <TableRow>
                  <TableCell colSpan={6}>Loading…</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <RoleModal
        isOpen={modalOpen}
        onClose={closeModal}
        mode={modalMode}
        permissionsCatalog={permissions}
        roleNameLocked={modalMode === "edit"}
        draft={draft}
        setDraft={setDraft}
        onSave={handleSave}
        onDelete={requestDeleteSelected}
        saving={saving}
        deleting={deleting}
        canDelete={
          modalMode === "edit" && !!selectedRole && !selectedRole.isSystem
        }
      />

      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (!deleting) cancelDeleteSelected();
        }}
        title="Delete Role"
        size="sm"
      >
        <div className={productsStyles.deleteConfirm}>
          <AlertTriangle size={48} className={productsStyles.deleteIcon} />
          <p>
            Delete <strong>{selectedRole?.name || "this role"}</strong>?
          </p>
          <p className={productsStyles.deleteNote}>
            This action cannot be undone.
          </p>
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={cancelDeleteSelected}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={confirmDeleteSelected}
            isLoading={deleting}
            disabled={deleting}
          >
            <Trash2 size={16} />
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default RolesTab;
