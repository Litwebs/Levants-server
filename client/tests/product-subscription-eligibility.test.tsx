import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ProductCreatePage from "@/pages/Products/ProductCreatePage";
const { get, put, post, showToast } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), showToast: vi.fn() }));
vi.mock("@/context/api", () => ({ default: { get, put, post } }));
vi.mock("@/components/common/Toast", () => ({ useToast: () => ({ showToast }) }));
vi.mock("@/pages/Products/UnsavedChangesDialog", () => ({
  useUnsavedChangesDialog: () => ({ allowNavigationRef: { current: false }, dialog: null }),
}));
const product = {
  _id: "product-1", name: "Yoghurt", category: "Dairy", description: "Fresh yoghurt",
  status: "active", allergens: [], storageNotes: "", thumbnailImage: { url: "https://example.com/image.png" }, galleryImages: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  put.mockResolvedValue({ data: { data: { product } } });
  get.mockImplementation(async path => path === "/admin/products"
    ? { data: { meta: { categories: ["Dairy"] } } }
    : { data: { data: { product } } });
});
afterEach(cleanup);
function mount(edit = true) {
  return render(<MemoryRouter initialEntries={[edit ? "/products/product-1/edit" : "/products/new"]}>
    <Routes><Route path="/products/:productId/edit" element={<ProductCreatePage />} />
      <Route path="/products/new" element={<ProductCreatePage />} />
      <Route path="/products" element={<p>Products saved</p>} /></Routes>
  </MemoryRouter>);
}
test("new products default to subscription eligible", async () => {
  mount(false);
  await waitFor(() => expect((screen.getByLabelText("Subscription Eligible") as HTMLSelectElement).value).toBe("eligible"));
});
test.each([true, false, undefined])("editor restores flag %s and saves boolean eligibility without altering product data", async flag => {
  get.mockImplementation(async path => path === "/admin/products"
    ? { data: { meta: { categories: ["Dairy"] } } }
    : { data: { data: { product: { ...product, isSubscriptionEligible: flag } } } });
  mount();
  const choice = await screen.findByLabelText("Subscription Eligible");
  await waitFor(() => expect((choice as HTMLSelectElement).value).toBe(flag === false ? "ineligible" : "eligible"));
  const user = userEvent.setup();
  await user.selectOptions(choice, "ineligible");
  await user.click(screen.getAllByRole("button", { name: "Save changes", exact: true })[0]);
  await waitFor(() => expect(put).toHaveBeenCalledWith("/admin/products/product-1", expect.objectContaining({
    name: "Yoghurt", status: "active", isSubscriptionEligible: false,
  })));
});
