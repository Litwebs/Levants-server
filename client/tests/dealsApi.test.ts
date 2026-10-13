import { beforeEach, describe, expect, test, vi } from "vitest";
import { archiveDeal, createDeal, deactivateDeal, getDeal, listDeals, publishDeal, unpublishDeal, updateDeal } from "@/context/Deals/dealsApi";
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("@/context/api", () => ({ default: api }));
beforeEach(() => vi.resetAllMocks());
describe("admin Deals API contracts", () => {
  test.each([
    ["publish", publishDeal, "post", "/admin/deals/id/publish"],
    ["unpublish", unpublishDeal, "post", "/admin/deals/id/unpublish"],
    ["archive", archiveDeal, "post", "/admin/deals/id/archive"],
    ["deactivate", deactivateDeal, "delete", "/admin/deals/id"],
    ["get", getDeal, "get", "/admin/deals/id"],
  ] as const)("%s unwraps the response and propagates failures", async (_, action, method, url) => {
    api[method].mockResolvedValueOnce({ data: { success: true, data: { deal: { _id: "id" } } } });
    expect(await action("id")).toEqual({ _id: "id" });
    expect(api[method]).toHaveBeenCalledWith(url);
    api[method].mockRejectedValueOnce(new Error("Network failed"));
    await expect(action("id")).rejects.toThrow("Network failed");
    api[method].mockResolvedValueOnce({ data: { success: true } });
    await expect(action("id")).rejects.toThrow();
  });
  test("create and update preserve draft and savings payloads", async () => {
    const body = { name: "Offer", items: [], publicationStatus: "draft" as const, pricingMode: "percentage_saving" as const, savingValue: 20 };
    api.post.mockResolvedValue({ data: { data: { deal: { _id: "id" } } } });
    api.patch.mockResolvedValue({ data: { data: { deal: { _id: "id" } } } });
    await createDeal(body); await updateDeal("id", { isActive: true });
    expect(api.post).toHaveBeenCalledWith("/admin/deals", body);
    expect(api.patch).toHaveBeenCalledWith("/admin/deals/id", { isActive: true });
  });
  test("list retains filters and pagination metadata", async () => {
    api.get.mockResolvedValue({ data: { data: { deals: [] }, meta: { total: 0, totalPages: 1 } } });
    expect(await listDeals({ status: "draft", page: 2 })).toEqual({ deals: [], meta: { total: 0, totalPages: 1 } });
    expect(api.get).toHaveBeenCalledWith("/admin/deals", { params: { status: "draft", page: 2 } });
  });
});
