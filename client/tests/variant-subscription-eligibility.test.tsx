import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import VariantEditPage from "@/pages/Products/VariantEditPage";
const { get, put, showToast, permissions } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), showToast: vi.fn(), permissions: { edit: true } }));
vi.mock("@/context/api", () => ({ default: { get, put } }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: (p: string) => p === "stock.update" || permissions.edit }) }));
vi.mock("@/components/common/Toast", () => ({ useToast: () => ({ showToast }) }));
vi.mock("@/pages/Products/UnsavedChangesDialog", () => ({ useUnsavedChangesDialog: () => ({ allowNavigationRef: { current: false }, dialog: null }) }));
const product = { _id: "product-1", name: "Milk", status: "active", allergens: [], galleryImages: [] };
const variant = { _id: "variant-1", product: "product-1", name: "500ml", sku: "MILK-500", price: 5, stockQuantity: 10, lowStockAlert: 2, status: "active", allergens: [] };
beforeEach(() => { vi.clearAllMocks(); permissions.edit = true; put.mockResolvedValue({}); });
afterEach(cleanup);
function mount(flag?: boolean) {
  get.mockImplementation(async (path: string) => ({ data: { data: path.includes("/variants/") ? { variant: { ...variant, isSubscriptionEligible: flag } } : { product } } }));
  return render(<MemoryRouter initialEntries={["/products/product-1/variants/variant-1/edit"]}><Routes>
    <Route path="/products/:productId/variants/:variantId/edit" element={<VariantEditPage />} />
    <Route path="/products/:productId" element={<p>Variant saved</p>} />
  </Routes></MemoryRouter>);
}
test.each([true, false, undefined])("variant editor loads %s and saves an independent boolean choice", async flag => {
  mount(flag);
  const choice = await screen.findByLabelText("Subscription Eligible");
  expect((choice as HTMLSelectElement).value).toBe(flag === false ? "ineligible" : "eligible");
  await userEvent.setup().selectOptions(choice, "ineligible");
  await userEvent.setup().click(screen.getAllByRole("button", { name: "Save changes", exact: true })[0]);
  await waitFor(() => expect(put).toHaveBeenCalledWith("/admin/products/variants/variant-1", expect.objectContaining({ isSubscriptionEligible: false, name: "500ml", price: 5 })));
});
test("staff with stock-only access cannot change or submit eligibility", async () => {
  permissions.edit = false; mount(false);
  const choice = await screen.findByLabelText("Subscription Eligible");
  expect((choice as HTMLSelectElement).disabled).toBe(true);
  await userEvent.setup().click(screen.getAllByRole("button", { name: "Save changes", exact: true })[0]);
  await waitFor(() => expect(put).toHaveBeenCalled());
  expect(put.mock.calls[0][1]).not.toHaveProperty("isSubscriptionEligible");
});
