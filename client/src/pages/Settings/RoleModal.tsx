import { useMemo } from "react";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { FormGrid, FormRow } from "@/components/common/FormGrid";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/common/Table";
import styles from "./Settings.module.css";

type Mode = "add" | "edit";

type RoleDraft = {
  name: string;
  description: string;
  permissions: string[];
};

const normalizePermissions = (permissions: string[]) => {
  const unique = Array.from(new Set((permissions || []).filter(Boolean)));
  return unique.sort((a, b) => a.localeCompare(b));
};

const RoleModal = ({
  isOpen,
  onClose,
  mode,
  permissionsCatalog,
  roleNameLocked,
  draft,
  setDraft,
  onSave,
  onDelete,
  saving,
  deleting,
  canDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  mode: Mode;
  permissionsCatalog: string[];
  roleNameLocked?: boolean;
  draft: RoleDraft;
  setDraft: (next: RoleDraft) => void;
  onSave: () => void;
  onDelete?: () => void;
  saving?: boolean;
  deleting?: boolean;
  canDelete?: boolean;
}) => {
  const allPermissionsSelected = draft.permissions.includes("*");

  const sortedCatalog = useMemo(() => {
    const catalog = Array.isArray(permissionsCatalog) ? permissionsCatalog : [];
    return catalog.slice().sort((a, b) => a.localeCompare(b));
  }, [permissionsCatalog]);

  const togglePermission = (perm: string) => {
    if (perm === "*") {
      const next = allPermissionsSelected ? [] : ["*"];
      setDraft({ ...draft, permissions: next });
      return;
    }

    if (allPermissionsSelected) {
      // if "*" selected, ignore granular toggles until it's deselected
      return;
    }

    const has = draft.permissions.includes(perm);
    const next = has
      ? draft.permissions.filter((p) => p !== perm)
      : [...draft.permissions, perm];

    setDraft({ ...draft, permissions: normalizePermissions(next) });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "add" ? "Create Role" : "Edit Role"}
      size="lg"
    >
      <FormGrid>
        <FormRow label="Role Name *">
          <input
            type="text"
            value={draft.name}
            disabled={mode === "edit" || !!roleNameLocked}
            onChange={(e) =>
              setDraft({ ...draft, name: e.target.value.toLowerCase() })
            }
            placeholder="e.g. manager"
          />
        </FormRow>

        <FormRow label="Description">
          <input
            type="text"
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
            placeholder="Short description"
          />
        </FormRow>

        <FormRow label="Permissions">
          <div className={styles.permissionsTable}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Permission</TableHead>
                  <TableHead align="right" width={120}>
                    Enabled
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                <TableRow>
                  <TableCell>
                    <span className={styles.permissionName}>
                      All permissions (*)
                    </span>
                  </TableCell>
                  <TableCell align="right">
                    <input
                      className={styles.permissionCheckbox}
                      type="checkbox"
                      checked={allPermissionsSelected}
                      onChange={() => togglePermission("*")}
                    />
                  </TableCell>
                </TableRow>

                {sortedCatalog.map((perm) => (
                  <TableRow key={perm}>
                    <TableCell>
                      <span className={styles.permissionName}>{perm}</span>
                    </TableCell>
                    <TableCell align="right">
                      <input
                        className={styles.permissionCheckbox}
                        type="checkbox"
                        checked={
                          allPermissionsSelected ||
                          draft.permissions.includes(perm)
                        }
                        disabled={allPermissionsSelected}
                        onChange={() => togglePermission(perm)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </FormRow>
      </FormGrid>

      <div className={styles.modalFooter}>
        {mode === "edit" && !!canDelete && !!onDelete && (
          <div style={{ marginRight: "auto" }}>
            <Button
              variant="danger"
              onClick={onDelete}
              disabled={!!saving || !!deleting}
              isLoading={!!deleting}
            >
              Delete Role
            </Button>
          </div>
        )}
        <Button variant="outline" onClick={onClose} disabled={!!saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={onSave}
          disabled={!!saving || !!deleting}
          isLoading={!!saving}
        >
          {mode === "add" ? "Create Role" : "Save Changes"}
        </Button>
      </div>
    </Modal>
  );
};

export default RoleModal;
