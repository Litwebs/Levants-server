import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { FormGrid, FormRow } from "@/components/common/FormGrid";
import styles from "./Settings.module.css";

const UserModal = ({
  isOpen,
  onClose,
  mode,
  roles,
  userForm,
  setUserForm,
  saveUser,
}: any) => {
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
            value={userForm.roleId}
            onChange={(e) =>
              setUserForm({ ...userForm, roleId: e.target.value })
            }
          >
            <option value="">Select role</option>
            {(roles || []).map((r: any) => (
              <option
                key={String(r?._id || r?.id)}
                value={String(r?._id || r?.id)}
              >
                {r?.name}
              </option>
            ))}
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
            <option value="disabled">Disabled</option>
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
        <Button variant="outline" onClick={onClose}>
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
