import styles from "./Customers.module.css";
import { useCustomers } from "./useCustomers";

import CustomersHeader from "./CustomersHeader";
import CustomersStats from "./CustomersStats";
import CustomersFilters from "./CustomersFilters";
import CustomersTable from "./CustomersTable";
import CustomerViewModal from "./CustomerViewModal";
import CustomerEditModal from "./CustomerEditModal";
import { Modal, ModalFooter, Button, Input } from "../../components/common";

const Customers = () => {
  const customersState = useCustomers();

  return (
    <div className={styles.container}>
      <CustomersHeader {...customersState} />
      <CustomersStats {...customersState} />
      <CustomersFilters {...customersState} />
      <CustomersTable {...customersState} />

      <CustomerViewModal {...customersState} />
      <CustomerEditModal {...customersState} />

      <Modal
        isOpen={customersState.isCreateInviteModalOpen}
        onClose={customersState.closeCreateInviteModal}
        title="Create Customer Onboarding Link"
        size="lg"
      >
        <div className={styles.customerDetail}>
          <p className={styles.subtitle}>
            Create a customer account invite, then copy the link and forward it.
            The customer can verify their email and add payment details to
            activate their subscription.
          </p>

          <div className={styles.detailGrid}>
            <div className={styles.detailSection}>
              <h3>Customer Details</h3>
              <div className={styles.contactInfo}>
                <Input
                  placeholder="First name"
                  value={customersState.createInviteForm.firstName}
                  onChange={(e) =>
                    customersState.setCreateInviteField(
                      "firstName",
                      e.target.value,
                    )
                  }
                />
                <Input
                  placeholder="Last name"
                  value={customersState.createInviteForm.lastName}
                  onChange={(e) =>
                    customersState.setCreateInviteField(
                      "lastName",
                      e.target.value,
                    )
                  }
                />
                <Input
                  placeholder="Email address"
                  type="email"
                  value={customersState.createInviteForm.email}
                  onChange={(e) =>
                    customersState.setCreateInviteField("email", e.target.value)
                  }
                />
                <Input
                  placeholder="Phone number"
                  value={customersState.createInviteForm.phone}
                  onChange={(e) =>
                    customersState.setCreateInviteField("phone", e.target.value)
                  }
                />
              </div>
            </div>

            <div className={styles.detailSection}>
              <h3>Invite Link</h3>
              {customersState.createdOnboardingLink ? (
                <div className={styles.contactInfo}>
                  <p className={styles.linkBox}>
                    {customersState.createdOnboardingLink}
                  </p>
                  {customersState.createdOnboardingLinkExpiresAt && (
                    <p className={styles.lastOrder}>
                      Expires:{" "}
                      {new Date(
                        customersState.createdOnboardingLinkExpiresAt,
                      ).toLocaleString("en-GB")}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    onClick={customersState.copyOnboardingLink}
                  >
                    Copy Link
                  </Button>
                </div>
              ) : (
                <p className={styles.lastOrder}>
                  Generate the link to reveal the forwarding URL.
                </p>
              )}
            </div>
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={customersState.closeCreateInviteModal}
          >
            Close
          </Button>
          <Button
            onClick={customersState.handleCreateInvite}
            isLoading={customersState.createInviteLoading}
          >
            Create Link
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default Customers;
