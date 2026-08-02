import styles from "./Customers.module.css";
import { useCustomers } from "./useCustomers";

import CustomersHeader from "./CustomersHeader";
import CustomersStats from "./CustomersStats";
import CustomersFilters from "./CustomersFilters";
import CustomersTable from "./CustomersTable";
import { Modal, ModalFooter, Button, Input } from "../../components/common";
import { AlertCircle, Copy, Link2 } from "lucide-react";

const Customers = () => {
  const customersState = useCustomers();

  return (
    <div className={styles.container}>
      <CustomersHeader {...customersState} />
      <CustomersStats {...customersState} />
      <CustomersFilters {...customersState} />
      {customersState.error && (
        <div className={styles.errorBanner} role="alert">
          <AlertCircle size={18} />
          <span>{customersState.error}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => customersState.refreshCustomers()}
          >
            Try again
          </Button>
        </div>
      )}
      <CustomersTable {...customersState} />

      <Modal
        isOpen={customersState.isCreateInviteModalOpen}
        onClose={customersState.closeCreateInviteModal}
        title="Create customer link"
        size="lg"
      >
        <div className={styles.customerDetail}>
          <div className={styles.inviteIntro}>
            <span className={styles.inviteIntroIcon}><Link2 size={20} /></span>
            <div>
              <strong>Invite a customer to create their account</strong>
              <p>
                We’ll email the link automatically. You can also copy it below
                and share it directly.
              </p>
            </div>
          </div>

          <div className={styles.detailGrid}>
            <div className={styles.detailSection}>
              <h3>Customer Details</h3>
              <div className={styles.contactInfo}>
                <Input
                  label="First name"
                  placeholder="e.g. Sarah"
                  required
                  value={customersState.createInviteForm.firstName}
                  onChange={(e) =>
                    customersState.setCreateInviteField(
                      "firstName",
                      e.target.value,
                    )
                  }
                />
                <Input
                  label="Last name"
                  placeholder="e.g. Ahmed"
                  required
                  value={customersState.createInviteForm.lastName}
                  onChange={(e) =>
                    customersState.setCreateInviteField(
                      "lastName",
                      e.target.value,
                    )
                  }
                />
                <Input
                  label="Email address"
                  placeholder="sarah@example.com"
                  type="email"
                  required
                  value={customersState.createInviteForm.email}
                  onChange={(e) =>
                    customersState.setCreateInviteField("email", e.target.value)
                  }
                />
                <Input
                  label="Phone number"
                  placeholder="Optional"
                  type="tel"
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
                    <Copy size={16} /> Copy link
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
