import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Filter, Plus, RefreshCw, Search, X } from "lucide-react";
import {
  Badge, Button, DataTableCard, FiltersCardLayout, Input, PageContainer,
  Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/common";
import { useToast } from "@/components/common/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { listDeals, type Deal } from "@/context/Deals";
import sharedFilterStyles from "@/components/common/FiltersCardLayout/SharedFilters.module.css";
import sharedTableStyles from "@/components/common/DataTableCard/DataTableCard.module.css";
import styles from "./DealsPage.module.css";
import { navigateWithDealTransition } from "./dealNavigation";

const PAGE_SIZE_OPTIONS = [
  { value: "20", label: "20 / page" },
  { value: "50", label: "50 / page" },
  { value: "100", label: "100 / page" },
];
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "featured", label: "Featured" },
  { value: "archived", label: "Archived" },
];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "price-high", label: "Price high–low" },
  { value: "price-low", label: "Price low–high" },
];

const errorMessage = (error: unknown) => {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === "string") return response.data.message;
  }
  return error instanceof Error ? error.message : "Failed to load deals";
};

const statusFor = (deal: Deal) => {
  if (deal.archivedAt) return { label: "Archived", variant: "default" as const };
  if (!deal.isActive) return { label: "Inactive", variant: "default" as const };
  const now = Date.now();
  if (deal.startsAt && new Date(deal.startsAt).getTime() > now)
    return { label: "Scheduled", variant: "default" as const };
  if (deal.endsAt && new Date(deal.endsAt).getTime() <= now)
    return { label: "Expired", variant: "default" as const };
  if (!deal.maxPackages) return { label: "Unavailable", variant: "warning" as const };
  return { label: deal.isFeatured ? "Featured" : "Active", variant: "success" as const };
};

export const DealsPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("promotions.create");
  const canUpdate = hasPermission("promotions.update");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await listDeals({ page, pageSize, search, status, sort });
      setDeals(result.deals);
      setMeta({
        total: result.meta?.total ?? result.deals.length,
        totalPages: result.meta?.totalPages ?? 1,
      });
    } catch (error) {
      const message = errorMessage(error);
      setLoadError(message);
      showToast({ type: "error", title: message });
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, showToast, sort, status]);

  useEffect(() => void load(), [load]);

  const openDeal = (deal: Deal) => {
    if (canUpdate) navigateWithDealTransition(navigate, `/deals/${deal._id}/edit`, "forward");
  };
  const clearFilters = () => {
    setSearchInput(""); setSearch(""); setStatus("all"); setSort("newest"); setPage(1);
  };

  return (
    <PageContainer className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Deals</h1>
          <p className={styles.subtitle}>{meta.total} deals found</p>
        </div>
        <Button variant="outline" leftIcon={<RefreshCw size={16} />} onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {loadError ? <div className={styles.alert} role="alert">{loadError}</div> : null}

      <FiltersCardLayout
        className={sharedFilterStyles.filtersCard}
        topRow={
          <div className={sharedFilterStyles.searchRow}>
            <div className={sharedFilterStyles.searchInput}>
              <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search deals..." aria-label="Search deals" className={sharedFilterStyles.searchControl} leftIcon={<Search size={18} />} fullWidth />
              {searchInput ? <button type="button" className={sharedFilterStyles.clearSearch} onClick={() => setSearchInput("")} aria-label="Clear deal search"><X size={16} /></button> : null}
            </div>
            <Button variant="outline" leftIcon={<Filter size={16} />} rightIcon={<ChevronDown size={16} className={`${sharedFilterStyles.filtersChevron} ${showFilters ? sharedFilterStyles.filtersChevronOpen : ""}`} />} aria-expanded={showFilters} aria-controls="deal-filters" onClick={() => setShowFilters((current) => !current)} className={sharedFilterStyles.filtersToggleBtn}>Filters</Button>
            <Select value={sort} onChange={(value) => { setSort(value); setPage(1); }} options={SORT_OPTIONS} className={sharedFilterStyles.sortSelect} aria-label="Sort deals" />
            {canCreate ? <Button leftIcon={<Plus size={17} />} onClick={() => navigateWithDealTransition(navigate, "/deals/new", "forward")} className={styles.addButton}>New deal</Button> : null}
          </div>
        }
        isExpanded={showFilters}
        expandedId="deal-filters"
        expandedWrapClassName={sharedFilterStyles.filtersRowWrap}
        expandedOpenClassName={sharedFilterStyles.filtersRowOpen}
        expandedInnerClassName={sharedFilterStyles.filtersRowInner}
        expandedContent={<div className={styles.filtersPanel}><Select label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={STATUS_OPTIONS} /><Button variant="outline" onClick={clearFilters}>Clear all filters</Button></div>}
      />

      <DataTableCard loading={loading} loadingText="Loading deals…" pagination={{ page, pageSize, total: meta.total, totalPages: meta.totalPages, setPage, setPageSize: (size) => { setPageSize(size); setPage(1); }, pageSizeOptions: PAGE_SIZE_OPTIONS, loading }}>
        <Table withWrapper={false}>
          <TableHeader><TableRow><TableHead>Deal</TableHead><TableHead>Products</TableHead><TableHead>Value</TableHead><TableHead>Deal price</TableHead><TableHead>Saving</TableHead><TableHead>Availability</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {!loading && deals.length === 0 ? <TableRow className={sharedTableStyles.emptyStateRow}><TableCell className={sharedTableStyles.emptyTableCell} colSpan={7}>No deals match these filters.</TableCell></TableRow> : deals.map((deal) => {
              const dealStatus = statusFor(deal);
              return (
                <TableRow key={deal._id} className={canUpdate ? styles.clickableRow : undefined} onClick={() => openDeal(deal)} onKeyDown={(event) => { if (canUpdate && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDeal(deal); } }} tabIndex={canUpdate ? 0 : undefined} aria-label={canUpdate ? `Edit ${deal.name}` : undefined}>
                  <TableCell data-label="Deal"><div className={styles.dealIdentity}>{deal.image?.url ? <img src={deal.image.url} alt="" className={styles.dealThumb} /> : <div className={styles.dealPlaceholder} aria-hidden="true">D</div>}<div><strong>{deal.name}</strong><span>/{deal.slug}</span></div></div></TableCell>
                  <TableCell data-label="Products">{deal.items?.length || 0}</TableCell>
                  <TableCell data-label="Value">£{Number(deal.originalValue || 0).toFixed(2)}</TableCell>
                  <TableCell data-label="Deal price"><strong>£{Number(deal.packagePrice || 0).toFixed(2)}</strong></TableCell>
                  <TableCell data-label="Saving">£{Number(deal.savings || 0).toFixed(2)}{deal.savingsPercent ? ` (${deal.savingsPercent}%)` : ""}</TableCell>
                  <TableCell data-label="Availability">{Number(deal.maxPackages || 0)} package{Number(deal.maxPackages || 0) === 1 ? "" : "s"}</TableCell>
                  <TableCell data-label="Status"><Badge variant={dealStatus.variant}>{dealStatus.label}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DataTableCard>
    </PageContainer>
  );
};
