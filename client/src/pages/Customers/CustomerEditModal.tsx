import {
  Modal,
  ModalFooter,
  Button,
  FormGrid,
  FormRow,
} from "../../components/common";
import { Save } from "lucide-react";
import styles from "./Customers.module.css";

const CustomerEditModal = ({
  isEditModalOpen,
  setIsEditModalOpen,
  editForm,
  setEditForm,
  handleSaveEdit,
}: any) => {
  return (
    <Modal
      isOpen={isEditModalOpen}
      onClose={() => setIsEditModalOpen(false)}
      title="Edit Customer"
      size="md"
    >
      <FormGrid>
        <FormRow label="Full Name">
          <input
            type="text"
            value={editForm.name || ""}
            onChange={(e) =>
              setEditForm((prev: any) => ({
                ...prev,
                name: e.target.value,
              }))
            }
          />
        </FormRow>

        <FormRow label="Email Address">
          <input
            type="email"
            value={editForm.email || ""}
            onChange={(e) =>
              setEditForm((prev: any) => ({
                ...prev,
                email: e.target.value,
              }))
            }
          />
        </FormRow>

        <FormRow label="Phone Number">
          <input
            type="tel"
            value={editForm.phone || ""}
            onChange={(e) =>
              setEditForm((prev: any) => ({
                ...prev,
                phone: e.target.value,
              }))
            }
          />
        </FormRow>

        <FormRow label="Marketing">
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={editForm.marketingOptIn || false}
              onChange={(e) =>
                setEditForm((prev: any) => ({
                  ...prev,
                  marketingOptIn: e.target.checked,
                }))
              }
            />
            Opted in to marketing emails
          </label>
        </FormRow>

        <FormRow label="Notes">
          <textarea
            className={styles.notesTextarea}
            rows={3}
            value={editForm.notes || ""}
            onChange={(e) =>
              setEditForm((prev: any) => ({
                ...prev,
                notes: e.target.value,
              }))
            }
            placeholder="Add notes about this customer..."
          />
        </FormRow>
      </FormGrid>

      <ModalFooter>
        <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
          Cancel
        </Button>
        <Button onClick={handleSaveEdit}>
          <Save size={16} /> Save Changes
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default CustomerEditModal;
