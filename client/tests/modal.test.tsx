import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import { Modal, ModalFooter } from "@/components/common/Modal/Modal";

afterEach(cleanup);
function Editor({ blockClose = false }: { blockClose?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open editor</button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Edit offer"
        closeDisabled={blockClose}
      >
        <label>
          Offer name
          <input aria-label="Offer name" />
        </label>
        <ModalFooter>
          <button onClick={() => setOpen(false)}>Save offer</button>
        </ModalFooter>
      </Modal>
      <Modal isOpen={false} onClose={() => {}} title="Closed modal">
        <p>Hidden</p>
      </Modal>
    </>
  );
}
test("shared modal has a label, traps keyboard focus and restores it when Escape closes", async () => {
  const user = userEvent.setup();
  render(<Editor />);
  const opener = screen.getByRole("button", { name: "Open editor" });
  await user.click(opener);
  const dialog = screen.getByRole("dialog", { name: "Edit offer" });
  expect(document.activeElement).toBe(dialog);
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(document.body.style.overflow).toBe("hidden");
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Close modal" }),
  );
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Save offer" }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Close modal" }),
  );
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
  expect(document.body.style.overflow).not.toBe("hidden");
});

test("pending work can prevent accidental Escape or close-button dismissal", async () => {
  const user = userEvent.setup();
  render(<Editor blockClose />);
  await user.click(screen.getByRole("button", { name: "Open editor" }));
  const close = screen.getByRole("button", { name: "Close modal" });
  expect(close.hasAttribute("disabled")).toBe(true);
  await user.click(close);
  await user.keyboard("{Escape}");
  expect(screen.getByRole("dialog", { name: "Edit offer" })).toBeTruthy();
});
