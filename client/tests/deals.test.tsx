import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CreateDealPage } from "@/pages/Deals/CreateDealPage";
import { DealsPage } from "@/pages/Deals/DealsPage";

const { createDeal, listDeals, getCatalog, showToast } = vi.hoisted(() => ({
  createDeal: vi.fn(),
  listDeals: vi.fn(),
  getCatalog: vi.fn(),
  showToast: vi.fn(),
}));
vi.mock("@/context/Deals", () => ({
  createDeal,
  listDeals,
  updateDeal: vi.fn(),
  deactivateDeal: vi.fn(),
  archiveDeal: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock("@/context/api", () => ({ default: { get: getCatalog } }));
vi.mock("@/components/common/Toast", () => ({
  useToast: () => ({ showToast }),
}));

const variant = {
  _id: "507f1f77bcf86cd799439011",
  name: "Whole milk 1L",
  sku: "MILK",
  price: 5,
  availableQuantity: 20,
  status: "active",
  product: { name: "Fresh whole milk", category: "Milk" },
};
beforeEach(() => {
  vi.clearAllMocks();
  getCatalog.mockResolvedValue({
    data: {
      data: {
        variants: [variant],
        pagination: { page: 1, pageSize: 8, total: 1, totalPages: 1 },
      },
    },
  });
  createDeal.mockResolvedValue({ _id: "deal-1" });
  vi.stubGlobal("scrollTo", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mount() {
  return render(
    <MemoryRouter initialEntries={["/deals/new"]}>
      <Routes>
        <Route path="/deals/new" element={<CreateDealPage />} />
        <Route path="/deals" element={<h1>Saved deals</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}
async function fillOffer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Add variant Whole milk 1L" }),
  );
  await user.click(screen.getByRole("button", { name: "Continue to details" }));
  await user.type(screen.getByLabelText("Deal name *"), "Fresh milk offer");
  expect(
    (screen.getByLabelText("Storefront URL") as HTMLInputElement).value,
  ).toBe("fresh-milk-offer");
  await user.click(screen.getByRole("button", { name: "Set pricing" }));
  await user.type(screen.getByLabelText("Package price (£) *"), "3");
  await user.click(screen.getByRole("button", { name: "Review & publish" }));
}
describe("admin deal creation with existing components", () => {
  test("flags active offers that no longer save money after retail prices change", async () => {
    listDeals.mockResolvedValue({
      deals: [
        {
          _id: "deal-1",
          name: "Milk offer",
          slug: "milk-offer",
          items: [],
          isActive: true,
          isFeatured: false,
          maxPackages: 20,
          packagePrice: 6,
          originalValue: 5,
        },
      ],
      meta: { total: 1, totalPages: 1 },
    });
    render(
      <MemoryRouter>
        <DealsPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Review price")).toBeTruthy();
  });
  test("blocks empty contents before advancing", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: "Continue to details" }),
    );
    expect(screen.getByRole("alert").textContent).toMatch(/Add at least one/);
    expect(createDeal).not.toHaveBeenCalled();
  });
  test("browses products and publishes a single-product offer without an expiry", async () => {
    const user = userEvent.setup();
    mount();
    await fillOffer(user);
    await user.click(
      screen.getByRole("button", { name: "Create product package" }),
    );
    await screen.findByRole("heading", { name: "Saved deals" });
    expect(createDeal).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Fresh milk offer",
        slug: "fresh-milk-offer",
        packagePrice: 3,
        endsAt: null,
        startsAt: null,
        isActive: true,
        items: [{ variantId: variant._id, quantity: 1 }],
      }),
    );
    expect(getCatalog).toHaveBeenCalledWith(
      "/admin/deals/catalog",
      expect.objectContaining({
        params: expect.objectContaining({ page: 1, pageSize: 8 }),
      }),
    );
  });
  test("rejects a price at retail value", async () => {
    const user = userEvent.setup();
    mount();
    await fillOffer(user);
    await user.click(screen.getByRole("button", { name: "Pricing" }));
    await user.clear(screen.getByLabelText("Package price (£) *"));
    await user.type(screen.getByLabelText("Package price (£) *"), "5");
    await user.click(screen.getByRole("button", { name: "Review & publish" }));
    expect(
      screen.getByText("Package price must be below the combined value."),
    ).toBeTruthy();
    expect(createDeal).not.toHaveBeenCalled();
  });
  test("keeps a recoverable draft when publishing fails", async () => {
    createDeal.mockRejectedValue({
      response: { data: { message: "Deal slug already exists" } },
    });
    const user = userEvent.setup();
    mount();
    await fillOffer(user);
    await user.click(
      screen.getByRole("button", { name: "Create product package" }),
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Deal slug already exists" }),
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Fresh milk offer" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Create product package" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });
});
