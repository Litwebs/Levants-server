import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DealsPage } from "@/pages/Deals/DealsPage";

const mocks = vi.hoisted(() => ({
  listDeals: vi.fn(), updateDeal: vi.fn(), archiveDeal: vi.fn(), showToast: vi.fn(),
  hasPermission: vi.fn(() => true),
}));
vi.mock("@/context/Deals", () => mocks);
vi.mock("@/components/common/Toast", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: mocks.hasPermission }) }));

const deals = ["Milk", "Cheese", "Archived"].map((name, i) => ({
  _id: `deal-${i}`, name, slug: name.toLowerCase(), items: [], packagePrice: 2,
  isActive: true, isFeatured: false, maxPackages: 10,
  archivedAt: i === 2 ? "2026-01-01" : null,
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.hasPermission.mockReturnValue(true);
  mocks.listDeals.mockResolvedValue({ deals, meta: { total: 3, totalPages: 1 } });
  mocks.updateDeal.mockResolvedValue({});
  mocks.archiveDeal.mockResolvedValue({});
});
afterEach(cleanup);
async function mount() {
  render(<MemoryRouter><DealsPage /></MemoryRouter>);
  await screen.findByText("Milk");
}

test("select-all skips archived deals and bulk updates each selected deal", async () => {
  const user = userEvent.setup();
  await mount();
  const toolbar = screen.getByRole("region", { name: "Bulk deal actions" });
  expect(screen.getByText("0 deals selected")).toBeTruthy();
  await user.click(screen.getByRole("checkbox", { name: "Select all deals on this page" }));
  expect((screen.getByRole("checkbox", { name: "Select Archived" }) as HTMLInputElement).checked).toBe(false);
  await user.click(screen.getByRole("button", { name: "Show tools" }));
  await user.selectOptions(screen.getByLabelText("Bulk deal action"), "deactivate");
  await user.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() => expect(mocks.updateDeal).toHaveBeenCalledTimes(2));
  expect(mocks.updateDeal).toHaveBeenCalledWith("deal-0", { isActive: false });
  expect(mocks.updateDeal).toHaveBeenCalledWith("deal-1", { isActive: false });
  await waitFor(() => expect(screen.getByText("0 deals selected")).toBeTruthy());
  expect(screen.getByRole("region", { name: "Bulk deal actions" })).toBe(toolbar);
});

test("a failed update remains selected without retrying successful deals", async () => {
  mocks.updateDeal.mockImplementation(async (id: string) => {
    if (id === "deal-1") throw new Error("Deal changed");
  });
  const user = userEvent.setup();
  await mount();
  await user.click(screen.getByRole("checkbox", { name: "Select all deals on this page" }));
  await user.click(screen.getByRole("button", { name: "Show tools" }));
  await user.selectOptions(screen.getByLabelText("Bulk deal action"), "feature");
  await user.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "1 updated, 1 failed" })));
  expect((screen.getByRole("checkbox", { name: "Select Cheese" }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("checkbox", { name: "Select Milk" }) as HTMLInputElement).checked).toBe(false);
});

test("archive requires confirmation before calling the API", async () => {
  const user = userEvent.setup();
  await mount();
  await user.click(screen.getByRole("checkbox", { name: "Select Milk" }));
  await user.click(screen.getByRole("button", { name: "Show tools" }));
  await user.selectOptions(screen.getByLabelText("Bulk deal action"), "archive");
  await user.click(screen.getByRole("button", { name: "Apply" }));
  expect(screen.getByRole("dialog", { name: "Archive selected deals" })).toBeTruthy();
  expect(mocks.archiveDeal).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Archive deals" }));
  await waitFor(() => expect(mocks.archiveDeal).toHaveBeenCalledWith("deal-0"));
});

test("read-only users have no bulk controls", async () => {
  mocks.hasPermission.mockReturnValue(false);
  await mount();
  expect(screen.queryByRole("checkbox")).toBeNull();
});

test.each(["activate", "deactivate"])("bulk %s cannot present a draft as enabled or paused", async action => {
  mocks.listDeals.mockResolvedValue({ deals: [{ ...deals[0], publicationStatus: "draft" }], meta: { total: 1, totalPages: 1 } });
  const user = userEvent.setup();
  await mount();
  await user.click(screen.getByRole("checkbox", { name: "Select Milk" }));
  await user.click(screen.getByRole("button", { name: "Show tools" }));
  await user.selectOptions(screen.getByLabelText("Bulk deal action"), action);
  await user.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(expect.objectContaining({
    type: "error", message: "Publish this draft before pausing or resuming it.",
  })));
  expect(mocks.updateDeal).not.toHaveBeenCalled();
  expect((screen.getByRole("checkbox", { name: "Select Milk" }) as HTMLInputElement).checked).toBe(true);
});
