import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CreateDealPage } from "@/pages/Deals/CreateDealPage";
import { DealsPage } from "@/pages/Deals/DealsPage";

const { createDeal, listDeals, getCatalog, showToast, updateDeal, getDeal, publishDeal } = vi.hoisted(
  () => ({
    createDeal: vi.fn(),
    listDeals: vi.fn(),
    getCatalog: vi.fn(),
    showToast: vi.fn(),
    updateDeal: vi.fn(),
    getDeal: vi.fn(),
    publishDeal: vi.fn(),
  }),
);
vi.mock("@/context/Deals", () => ({
  createDeal,
  listDeals,
  updateDeal,
  getDeal,
  deactivateDeal: vi.fn(),
  archiveDeal: vi.fn(),
  publishDeal,
  unpublishDeal: vi.fn(),
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
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
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
  await user.click(screen.getByRole("button", { name: "Details & pricing" }));
  await user.type(screen.getByLabelText("Deal name *"), "Fresh milk offer");
  expect(
    (screen.getByLabelText("Storefront URL *") as HTMLInputElement).value,
  ).toBe("fresh-milk-offer");
  await user.type(screen.getByLabelText("Package price (£) *"), "3");
  await user.click(screen.getByRole("button", { name: "Review & publish" }));
}
describe("admin deal creation with existing components", () => {
  test.each([
    ["draft", true], ["draft", false], ["published", true], ["published", false],
  ])("%s offers with enabled=%s show only applicable storefront controls", async (publicationStatus, isActive) => {
    getDeal.mockResolvedValue({
      _id: "deal-1", name: "Milk offer", slug: "milk-offer", publicationStatus,
      isActive, isFeatured: false, packagePrice: 3,
      items: [{ variantId: variant._id, quantity: 1, variant, product: variant.product }],
    });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/deals/deal-1/edit"]}>
      <Routes><Route path="/deals/:dealId/edit" element={<CreateDealPage />} /></Routes>
    </MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Details & pricing" }));
    await user.click(screen.getByRole("button", { name: "Review & publish" }));
    expect(screen.queryByRole("checkbox", { name: /Active on storefront/ })).toBeNull();
    if (publicationStatus === "draft") {
      expect(screen.queryByRole("checkbox", { name: /Offer enabled/ })).toBeNull();
    } else {
      expect((screen.getByRole("checkbox", { name: /Offer enabled/ }) as HTMLInputElement).checked).toBe(isActive);
    }
    await user.click(screen.getByRole("button", { name: "Manage deal" }));
    if (publicationStatus === "draft") {
      expect(screen.getByText("Draft · Hidden from customers")).toBeTruthy();
      expect(screen.queryByRole("menuitem", { name: /Pause offer|Resume offer/ })).toBeNull();
      expect(screen.getByRole("menuitem", { name: "Publish", exact: true })).toBeTruthy();
    } else {
      expect(screen.getByRole("menuitem", { name: isActive ? "Pause offer" : "Resume offer", exact: true })).toBeTruthy();
    }
  });

  test("publishing a previously disabled draft enables it through the existing management action", async () => {
    const deal = { _id: "deal-1", name: "Milk offer", slug: "milk-offer", publicationStatus: "draft",
      isActive: false, isFeatured: false, packagePrice: 3,
      items: [{ variantId: variant._id, quantity: 1, variant, product: variant.product }] };
    getDeal.mockResolvedValue(deal);
    updateDeal.mockResolvedValue({ ...deal, isActive: true });
    publishDeal.mockResolvedValue({ ...deal, publicationStatus: "published", isActive: true });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/deals/deal-1/edit"]}>
      <Routes><Route path="/deals/:dealId/edit" element={<CreateDealPage />} /></Routes>
    </MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Manage deal" }));
    await user.click(screen.getByRole("menuitem", { name: "Publish", exact: true }));
    await waitFor(() => expect(publishDeal).toHaveBeenCalledWith("deal-1"));
    expect(updateDeal).toHaveBeenCalledWith("deal-1", { isActive: true });
    await user.click(screen.getByRole("button", { name: "Manage deal" }));
    expect(await screen.findByRole("menuitem", { name: "Pause offer", exact: true })).toBeTruthy();
  });
  test("reopening an unpriced draft keeps the price blank and saves its empty contents", async () => {
    getDeal.mockResolvedValue({
      _id: "draft-1", name: "Unfinished package", slug: "unfinished-package",
      publicationStatus: "draft", pricingMode: "fixed_price", packagePrice: 0,
      items: [], isActive: true, isFeatured: false,
    });
    updateDeal.mockResolvedValue({ _id: "draft-1" });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/deals/draft-1/edit"]}>
        <Routes>
          <Route path="/deals/:dealId/edit" element={<CreateDealPage />} />
          <Route path="/deals" element={<h1>Saved deals</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "Save draft", exact: true }));
    await screen.findByRole("heading", { name: "Saved deals" });
    expect(updateDeal).toHaveBeenCalledWith("draft-1", expect.objectContaining({
      items: [], packagePrice: null,
    }));
    expect(updateDeal.mock.calls[0][1]).not.toHaveProperty("publicationStatus");
  });
  test("lists live price and value for existing offers", async () => {
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
    expect(await screen.findByText("Milk offer")).toBeTruthy();
    expect(screen.getByText("£6.00")).toBeTruthy();
    expect(screen.getByText("£5.00")).toBeTruthy();
  });
  test("blocks empty contents before advancing", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(
      screen.getByRole("button", { name: "Details & pricing" }),
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
        params: expect.objectContaining({ page: 1, pageSize: 20 }),
      }),
    );
  });
  test("rejects a price at retail value", async () => {
    const user = userEvent.setup();
    mount();
    await fillOffer(user);
    await user.click(screen.getByRole("button", { name: /Details & Pricing/i }));
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
    await user.click(screen.getByRole("button", { name: /Details & Pricing/i }));
    expect((screen.getByLabelText("Deal name *") as HTMLInputElement).value).toBe("Fresh milk offer");
    await user.click(screen.getByRole("button", { name: "Review & publish" }));
    expect(
      screen
        .getByRole("button", { name: "Create product package" })
        .hasAttribute("disabled"),
    ).toBe(false);
  });
  test("disables publishing while a delayed save is pending and submits exactly once", async () => {
    let resolve!: (value: { _id: string }) => void;
    createDeal.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const user = userEvent.setup();
    mount();
    await fillOffer(user);
    const publish = screen.getByRole("button", {
      name: "Create product package",
    });
    await user.dblClick(publish);
    expect(createDeal).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole("button", { name: "Create product package" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await act(async () => {
      resolve({ _id: "deal-1" });
    });
    await screen.findByRole("heading", { name: "Saved deals" });
  });
  test("failed editing preserves changed values and allows retry without a false success", async () => {
    const deal = {
      _id: "deal-1",
      name: "Milk offer",
      slug: "milk-offer",
      description: "",
      image: null,
      isActive: true,
      isFeatured: false,
      packagePrice: 3,
      originalValue: 5,
      savings: 2,
      maxPackages: 20,
      items: [
        {
          variantId: variant._id,
          quantity: 1,
          variant,
          product: variant.product,
        },
      ],
    };
    listDeals.mockResolvedValue({
      deals: [deal],
      meta: { total: 1, totalPages: 1 },
    });
    updateDeal.mockRejectedValueOnce(new Error("Save failed"));
    const user = userEvent.setup();
    getDeal.mockResolvedValue(deal);
    render(
      <MemoryRouter initialEntries={["/deals/deal-1/edit"]}>
        <Routes>
          <Route path="/deals/:dealId/edit" element={<CreateDealPage />} />
          <Route path="/deals" element={<h1>Saved deals</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "Details & pricing" }));
    const name = screen.getByLabelText("Deal name *") as HTMLInputElement;
    await user.clear(name);
    await user.type(name, "Changed milk offer");
    await user.click(screen.getByRole("button", { name: "Review & publish" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" }),
      ),
    );
    expect(updateDeal).toHaveBeenCalledWith("deal-1", expect.objectContaining({ name: "Changed milk offer" }));
    expect(
      screen
        .getByRole("button", { name: "Save changes" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(showToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" }),
    );
    updateDeal.mockResolvedValueOnce({ ...deal, name: "Changed milk offer" });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "success", title: "Deal updated" }),
      ),
    );
    expect(updateDeal).toHaveBeenCalledTimes(2);
    expect(updateDeal).toHaveBeenLastCalledWith(
      "deal-1",
      expect.objectContaining({
        name: "Changed milk offer",
        packagePrice: 3,
        items: [{ variantId: variant._id, quantity: 1 }],
      }),
    );
  });
  test("empty management state offers creation and a failed listing can be retried", async () => {
    listDeals.mockRejectedValueOnce(new Error("Cannot load offers"));
    listDeals.mockResolvedValueOnce({
      deals: [],
      meta: { total: 0, totalPages: 1 },
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DealsPage />
      </MemoryRouter>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Cannot load offers",
    );
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByText("No deals match these filters.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New deal" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
