import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { FormGrid, FormRow } from "@/components/common/FormGrid";
import { Eye, EyeOff } from "lucide-react";
import styles from "./Settings.module.css";

const UserModal = ({
  isOpen,
  onClose,
  mode,
  userForm,
  setUserForm,
  saveUser,
}: any) => {
  const showPassword = mode === "add";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "add" ? "Add User" : "Edit User"}
      size="md"
    >
      <FormGrid>
        <FormRow label="Full Name *">
          <input
            type="text"
            value={userForm.name}
            onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
          />
        </FormRow>

        <FormRow label="Email *">
          <input
            type="email"
            value={userForm.email}
            onChange={(e) =>
              setUserForm({ ...userForm, email: e.target.value })
            }
          />
        </FormRow>

        <FormRow label="Role">
          <select
            value={userForm.role}
            onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
          >
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="staff">Staff</option>
            <option value="driver">Driver</option>
          </select>
        </FormRow>

        <FormRow label="Status">
          <select
            value={userForm.status}
            onChange={(e) =>
              setUserForm({ ...userForm, status: e.target.value })
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </FormRow>

        {mode === "add" && (
          <>
            <FormRow label="Password *">
              <input
                type="password"
                value={userForm.password}
                onChange={(e) =>
                  setUserForm({ ...userForm, password: e.target.value })
                }
              />
            </FormRow>

            <FormRow label="Confirm Password *">
              <input
                type="password"
                value={userForm.confirmPassword}
                onChange={(e) =>
                  setUserForm({
                    ...userForm,
                    confirmPassword: e.target.value,
                  })
                }
              />
            </FormRow>
          </>
        )}
      </FormGrid>

      <div className={styles.modalFooter}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={saveUser}>
          {mode === "add" ? "Create User" : "Save Changes"}
        </Button>
      </div>
    </Modal>
  );
};

export default UserModal;
