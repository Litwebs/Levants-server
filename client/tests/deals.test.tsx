import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CreateDealPage } from "@/pages/Deals/CreateDealPage";
import { DealsPage } from "@/pages/Deals/DealsPage";

const { createDeal, listDeals, getCatalog, showToast, updateDeal, getDeal, publishDeal, unpublishDeal, deactivateDeal, archiveDeal, hasPermission } = vi.hoisted(
  () => ({
    createDeal: vi.fn(),
    listDeals: vi.fn(),
    getCatalog: vi.fn(),
    showToast: vi.fn(),
    updateDeal: vi.fn(),
    getDeal: vi.fn(),
    publishDeal: vi.fn(), unpublishDeal: vi.fn(), deactivateDeal: vi.fn(), archiveDeal: vi.fn(), hasPermission: vi.fn(),
  }),
);
vi.mock("@/context/Deals", () => ({
  createDeal,
  listDeals,
  updateDeal,
  getDeal,
  deactivateDeal, archiveDeal, publishDeal, unpublishDeal,
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission }),
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
  vi.resetAllMocks();
  hasPermission.mockReturnValue(true);
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

const existingDeal = {
  _id: "deal-1", name: "Milk offer", slug: "milk-offer", isActive: true,
  isFeatured: false, packagePrice: 3, originalValue: 5, maxPackages: 20,
  publicationStatus: "draft", items: [{ variantId: variant._id, quantity: 1, variant, product: variant.product }],
};
describe("drafts and savings pricing", () => {
  test("saves a named draft with no products or price", async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await user.type(screen.getByLabelText("Deal name *"), "Future offer");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByRole("heading", { name: "Saved deals" });
    expect(createDeal).toHaveBeenCalledWith(expect.objectContaining({ name: "Future offer", publicationStatus: "draft", items: [] }));
    expect(createDeal.mock.calls[0][0]).not.toHaveProperty("packagePrice");
  });
  test.each([
    ["fixed_saving", "Saving (£) *", "2"],
    ["percentage_saving", "Saving (%) *", "20"],
  ])("publishes using %s without sending a stale fixed price", async (mode, label, saving) => {
    const user = userEvent.setup(); mount(); await fillOffer(user);
    await user.click(screen.getByRole("button", { name: /Details & Pricing/i }));
    await user.selectOptions(screen.getByLabelText("Pricing method"), mode);
    await user.type(screen.getByLabelText(label), saving);
    await user.click(screen.getByRole("button", { name: "Review & publish" }));
    await user.click(screen.getByRole("button", { name: "Create product package" }));
    await screen.findByRole("heading", { name: "Saved deals" });
    expect(createDeal).toHaveBeenCalledWith(expect.objectContaining({ pricingMode: mode, savingValue: Number(saving), publicationStatus: "published" }));
    expect(createDeal.mock.calls[0][0]).not.toHaveProperty("packagePrice");
  });
  test("blocks percentage savings of 100", async () => {
    const user = userEvent.setup(); mount(); await fillOffer(user);
    await user.click(screen.getByRole("button", { name: /Details & Pricing/i }));
    await user.selectOptions(screen.getByLabelText("Pricing method"), "percentage_saving");
    await user.type(screen.getByLabelText("Saving (%) *"), "100");
    await user.click(screen.getByRole("button", { name: "Review & publish" }));
    expect(screen.getByText(/Enter a saving that leaves/)).toBeTruthy();
    expect(createDeal).not.toHaveBeenCalled();
  });
  test("updates a draft before publishing and retries a stock rejection", async () => {
    getDeal.mockResolvedValue(existingDeal); updateDeal.mockResolvedValue(existingDeal);
    publishDeal.mockRejectedValueOnce(new Error("Insufficient stock")).mockResolvedValueOnce(existingDeal);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/deals/deal-1/edit"]}><Routes>
      <Route path="/deals/:dealId/edit" element={<CreateDealPage />} />
      <Route path="/deals" element={<h1>Saved deals</h1>} />
    </Routes></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Details & pricing" }));
    await user.click(screen.getByRole("button", { name: "Review & publish" }));
    await user.click(screen.getByRole("button", { name: "Publish deal" }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error", message: "Insufficient stock" })));
    expect(updateDeal.mock.calls[0][1]).not.toHaveProperty("publicationStatus");
    expect(updateDeal.mock.invocationCallOrder[0]).toBeLessThan(publishDeal.mock.invocationCallOrder[0]);
    await user.click(screen.getByRole("button", { name: "Publish deal" }));
    await screen.findByRole("heading", { name: "Saved deals" });
    expect(publishDeal).toHaveBeenCalledTimes(2);
  });
});
describe("deal management lifecycle and permissions", () => {
  beforeEach(() => listDeals.mockResolvedValue({ deals: [existingDeal], meta: { total: 1, totalPages: 1 } }));
  test.each([ ["Publish", publishDeal], ["Deactivate", deactivateDeal] ])("%s refreshes after success", async (label, endpoint) => {
    endpoint.mockResolvedValue(existingDeal); const user = userEvent.setup();
    render(<MemoryRouter><DealsPage /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: label, exact: true }));
    await waitFor(() => expect(listDeals).toHaveBeenCalledTimes(2));
    expect(endpoint).toHaveBeenCalledWith("deal-1");
  });
  test("unpublishes a published deal", async () => {
    listDeals.mockResolvedValue({ deals: [{ ...existingDeal, publicationStatus: "published" }] });
    const user = userEvent.setup(); render(<MemoryRouter><DealsPage /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(unpublishDeal).toHaveBeenCalledWith("deal-1"));
  });
  test("activates inactive offers through PATCH", async () => {
    listDeals.mockResolvedValue({ deals: [{ ...existingDeal, isActive: false }] });
    const user = userEvent.setup(); render(<MemoryRouter><DealsPage /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Activate", exact: true }));
    await waitFor(() => expect(updateDeal).toHaveBeenCalledWith("deal-1", { isActive: true }));
  });
  test("archive cancellation avoids mutation and failure preserves the row", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    archiveDeal.mockRejectedValueOnce(new Error("Archive failed"));
    const user = userEvent.setup(); render(<MemoryRouter><DealsPage /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Archive", exact: true }));
    expect(archiveDeal).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Archive", exact: true }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error", message: "Archive failed" })));
    expect(screen.getByText("Milk offer")).toBeTruthy(); confirm.mockRestore();
  });
  test("read-only users see no mutation controls", async () => {
    hasPermission.mockImplementation((permission: string) => permission === "promotions.read");
    render(<MemoryRouter><DealsPage /></MemoryRouter>); await screen.findByText("Milk offer");
    for (const name of ["New deal", "Edit", "Publish", "Deactivate", "Archive"]) expect(screen.queryByRole("button", { name, exact: true })).toBeNull();
  });
  test("archived offers cannot be edited", async () => {
    listDeals.mockResolvedValue({ deals: [{ ...existingDeal, archivedAt: "2026-01-01" }] });
    render(<MemoryRouter><DealsPage /></MemoryRouter>); await screen.findByText("Archived");
    expect(screen.queryByRole("button", { name: "Edit", exact: true })).toBeNull();
  });
});

describe("merchandising and validation", () => {
  test("rejects an end date before its start", async () => {
    const user = userEvent.setup(); mount(); await fillOffer(user);
    fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: "2030-06-02T10:00" } });
    fireEvent.change(screen.getByLabelText("Ends at"), { target: { value: "2030-06-01T10:00" } });
    await user.click(screen.getByRole("button", { name: "Create product package" }));
    expect(screen.getByText("End date must be after the start date.")).toBeTruthy();
    expect(createDeal).not.toHaveBeenCalled();
  });
  test("sends featured, inactive and scheduled merchandising settings", async () => {
    const user = userEvent.setup(); mount(); await fillOffer(user);
    await user.click(screen.getByRole("checkbox", { name: /^Feature this deal/ }));
    await user.click(screen.getByRole("checkbox", { name: /^Active on storefront/ }));
    fireEvent.change(screen.getByLabelText("Starts at"), { target: { value: "2030-06-02T10:00" } });
    await user.click(screen.getByRole("button", { name: "Create product package" }));
    await screen.findByRole("heading", { name: "Saved deals" });
    expect(createDeal).toHaveBeenCalledWith(expect.objectContaining({ isFeatured: true, isActive: false, startsAt: expect.stringMatching(/^2030-06-02T/) }));
  });
  test("out-of-stock variants cannot be added", async () => {
    getCatalog.mockResolvedValue({ data: { data: { variants: [{ ...variant, availableQuantity: 0 }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } } });
    mount(); expect((await screen.findByRole("button", { name: "Add variant Whole milk 1L" })).hasAttribute("disabled")).toBe(true);
  });
  test("rejects unsupported promotional images", async () => {
    const user = userEvent.setup({ applyAccept: false }); const view = mount(); await fillOffer(user);
    await user.upload(view.container.querySelector('input[type="file"]')!, new File(["bad"], "offer.gif", { type: "image/gif" }));
    expect(screen.getByText("Choose a JPG, PNG or WEBP image up to 5 MB.")).toBeTruthy();
    expect(screen.queryByAltText("Package preview")).toBeNull();
  });
  test("delete permission alone does not expose publishing or activation", async () => {
    hasPermission.mockImplementation((permission: string) => permission === "promotions.delete");
    listDeals.mockResolvedValue({ deals: [existingDeal] });
    render(<MemoryRouter><DealsPage /></MemoryRouter>); await screen.findByText("Milk offer");
    expect(screen.getByRole("button", { name: "Deactivate", exact: true })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish", exact: true })).toBeNull();
  });
});

describe("draft edit content preservation", () => {
  test("does not silently restore deleted contents when the API requires an existing variant", async () => {
    getDeal.mockResolvedValue(existingDeal);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/deals/deal-1/edit"]}><Routes><Route path="/deals/:dealId/edit" element={<CreateDealPage />} /></Routes></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Remove Fresh whole milk Whole milk 1L", exact: true }));
    await user.click(screen.getByRole("button", { name: "Save draft", exact: true }));
    expect(screen.getByText("Keep at least one variant when updating an existing package.")).toBeTruthy();
    expect(updateDeal).not.toHaveBeenCalled();
  });
});
