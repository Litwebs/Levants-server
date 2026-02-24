import {
  Modal,
  ModalFooter,
  Button,
  FormGrid,
  FormRow,
} from "../../components/common";
import { Save } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

const CustomerEditModal = ({
  isEditModalOpen,
  setIsEditModalOpen,
  editForm,
  setEditForm,
  handleSaveEdit,
}: any) => {
  const { hasPermission } = usePermissions();
  if (!hasPermission("customers.update")) return null;

  return (
    <Modal
      isOpen={isEditModalOpen}
      onClose={() => setIsEditModalOpen(false)}
      title="Edit Customer"
      size="md"
    >
      <FormGrid>
        <FormRow label="First Name">
          <input
            type="text"
            value={editForm.firstName || ""}
            onChange={(e) =>
              setEditForm((prev: any) => ({
                ...prev,
                firstName: e.target.value,
              }))
            }
          />
        </FormRow>

        <FormRow label="Last Name">
          <input
            type="text"
            value={editForm.lastName || ""}
            onChange={(e) =>
              setEditForm((prev: any) => ({
                ...prev,
                lastName: e.target.value,
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

        <FormRow label="New Address Line 1">
          <input
            type="text"
            value={editForm.address?.line1 || ""}
            onChange={(e) =>
              setEditForm((prev: any) => ({
                ...prev,
                address: {
                  ...(prev.address || {}),
                  line1: e.target.value,
                },
              }))
            }
          />
        </FormRow>

        <FormRow label="New Address Line 2">
          <input
            type="text"
            value={editForm.address?.line2 || ""}
            onChange={(e) =>
              setEditForm((prev: any) => ({
                ...prev,
                address: {
                  ...(prev.address || {}),
                  line2: e.target.value,
                },
              }))
            }
          />
        </FormRow>

        <FormRow label="City">
          <input
            type="text"
            value={editForm.address?.city || ""}
            onChange={(e) =>
              setEditForm((prev: any) => ({
                ...prev,
                address: {
                  ...(prev.address || {}),
                  city: e.target.value,
                },
              }))
            }
          />
        </FormRow>

        <FormRow label="Postcode">
          <input
            type="text"
            value={editForm.address?.postcode || ""}
            onChange={(e) =>
              setEditForm((prev: any) => ({
                ...prev,
                address: {
                  ...(prev.address || {}),
                  postcode: e.target.value,
                },
              }))
            }
          />
        </FormRow>

        <FormRow label="Country">
          <input
            type="text"
            value={editForm.address?.country || ""}
            onChange={(e) =>
              setEditForm((prev: any) => ({
                ...prev,
                address: {
                  ...(prev.address || {}),
                  country: e.target.value,
                },
              }))
            }
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
