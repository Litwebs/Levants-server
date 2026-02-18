import { Modal, Button, FormGrid, FormRow } from "@/components/common";
import styles from "../Settings.module.css";

const UserModal = ({
  isUserModalOpen,
  setIsUserModalOpen,
  userForm,
  setUserForm,
  saveUser,
  userModalMode,
}: any) => (
  <Modal
    isOpen={isUserModalOpen}
    onClose={() => setIsUserModalOpen(false)}
    title={userModalMode === "add" ? "Add User" : "Edit User"}
  >
    <FormGrid>
      <FormRow label="Name">
        <input
          value={userForm.name}
          onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
        />
      </FormRow>
      <FormRow label="Email">
        <input
          value={userForm.email}
          onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
        />
      </FormRow>
    </FormGrid>

    <div className={styles.modalFooter}>
      <Button variant="outline" onClick={() => setIsUserModalOpen(false)}>
        Cancel
      </Button>
      <Button onClick={saveUser}>
        {userModalMode === "add" ? "Create" : "Save"}
      </Button>
    </div>
  </Modal>
);

export default UserModal;
