import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Filter, Gift, Plus, RefreshCw, Search, X } from "lucide-react";
import {
  Badge, Button, Card, Checkbox, DataTableCard, FiltersCardLayout, Input, PageContainer,
  Modal, ModalFooter, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/common";
import { useToast } from "@/components/common/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { archiveDeal, listDeals, updateDeal, type Deal } from "@/context/Deals";
import sharedFilterStyles from "@/components/common/FiltersCardLayout/SharedFilters.module.css";
import sharedTableStyles from "@/components/common/DataTableCard/DataTableCard.module.css";
import orderTableStyles from "@/pages/Orders/Orders.module.css";
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
  { value: "inactive", label: "Paused" },
  { value: "featured", label: "Featured" },
  { value: "archived", label: "Archived" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
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
  if (deal.publicationStatus === "draft") return { label: "Draft", variant: "default" as const };
  if (!deal.isActive) return { label: "Paused", variant: "default" as const };
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
  const canArchive = hasPermission("promotions.delete");
  const canSelect = canUpdate || canArchive;
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const bulkLock = useRef(false);
  const [bulkExpanded, setBulkExpanded] = useState(false);
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
  const selectableDeals = deals.filter((deal) => !deal.archivedAt);
  const allSelected = selectableDeals.length > 0 && selectableDeals.every((deal) => selected.includes(deal._id));
  const bulkOptions = [
    { value: "", label: "Choose bulk action" },
    ...(canUpdate ? [
      { value: "activate", label: "Resume offer" },
      { value: "deactivate", label: "Pause offer" },
      { value: "feature", label: "Feature" },
      { value: "unfeature", label: "Remove featured" },
    ] : []),
    ...(canArchive ? [{ value: "archive", label: "Archive" }] : []),
  ];

  useEffect(() => { setSelected([]); }, [page, pageSize, search, status, sort]);

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

  const applyBulkAction = async () => {
    if (bulkLock.current || !selected.length || !bulkAction) return;
    if (bulkAction === "archive" ? !canArchive : !canUpdate) return;
    bulkLock.current = true;
    setBulkBusy(true);
    const failed: string[] = [];
    let firstError = "";
    for (const id of selected) {
      try {
        if ((bulkAction === "activate" || bulkAction === "deactivate") && deals.find(deal => deal._id === id)?.publicationStatus === "draft")
          throw new Error("Publish this draft before pausing or resuming it.");
        if (bulkAction === "archive") await archiveDeal(id);
        else await updateDeal(id, bulkAction === "activate" || bulkAction === "deactivate"
          ? { isActive: bulkAction === "activate" }
          : { isFeatured: bulkAction === "feature" });
      } catch (error) {
        failed.push(id);
        firstError ||= errorMessage(error);
      }
    }
    const succeeded = selected.length - failed.length;
    setSelected(failed);
    setConfirmArchive(false);
    if (!failed.length) setBulkAction("");
    await load();
    setBulkBusy(false);
    bulkLock.current = false;
    showToast({ type: failed.length ? "error" : "success", title: failed.length
      ? `${succeeded} updated, ${failed.length} failed`
      : `${succeeded} deal${succeeded === 1 ? "" : "s"} updated`, message: failed.length ? firstError : undefined });
  };

  const openDeal = (deal: Deal) => {
    if (canUpdate && !bulkBusy && !deal.archivedAt) navigateWithDealTransition(navigate, `/deals/${deal._id}/edit`, "forward");
  };
  const clearFilters = () => {
    setSearchInput(""); setSearch(""); setStatus("all"); setSort("newest"); setPage(1);
  };

  return (
    <PageContainer className={orderTableStyles.page}>
      <div className={orderTableStyles.header}>
        <div>
          <h1 className={orderTableStyles.title}>Deals</h1>
          <p className={orderTableStyles.subtitle}>{meta.total} deals found</p>
        </div>
        <div className={orderTableStyles.headerActions}>
        <Button variant="outline" leftIcon={<RefreshCw size={16} />} onClick={() => void load()} disabled={loading || bulkBusy}>
          Refresh
        </Button>
        </div>
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

      {canSelect ? (
        <Card className={orderTableStyles.bulkActions} role="region" aria-label="Bulk deal actions" aria-busy={bulkBusy}>
          <div className={orderTableStyles.bulkContent}>
          <span className={orderTableStyles.bulkCount} role="status">{selected.length} deal{selected.length === 1 ? "" : "s"} selected</span>
          <div className={orderTableStyles.bulkButtons}>
            <Button variant="outline" size="sm" rightIcon={<ChevronDown size={16} className={`${orderTableStyles.toolsChevron} ${bulkExpanded ? orderTableStyles.toolsChevronOpen : ""}`} />} aria-expanded={bulkExpanded} aria-controls="deals-bulk-actions-panel" onClick={() => setBulkExpanded((current) => !current)}>{bulkExpanded ? "Hide tools" : "Show tools"}</Button>
            <div className={`${orderTableStyles.selectionActions} ${selected.length ? orderTableStyles.selectionActionsVisible : ""}`} aria-hidden={!selected.length}>
              <Button variant="ghost" size="sm" disabled={bulkBusy || !selected.length} onClick={() => setSelected([])}>Clear selection</Button>
            </div>
          </div>
          </div>
          <div id="deals-bulk-actions-panel" className={`${orderTableStyles.bulkSections} ${!bulkExpanded ? orderTableStyles.bulkSectionsCollapsed : ""}`} aria-hidden={!bulkExpanded}>
          <div className={orderTableStyles.bulkSectionsInner}>
          <div className={`${orderTableStyles.selectionTools} ${selected.length ? orderTableStyles.selectionToolsVisible : ""}`} aria-hidden={!selected.length}>
          <div className={orderTableStyles.selectionToolsInner}>
          <div className={`${orderTableStyles.bulkSection} ${orderTableStyles.updateDeliverySection}`}>
            <h3 className={orderTableStyles.bulkSectionTitle}><Gift size={20} aria-hidden="true" />Update deals</h3>
            <div className={orderTableStyles.bulkSectionRow}>
            <Select className={orderTableStyles.filterGroup} label="Action" aria-label="Bulk deal action" fullWidth value={bulkAction} onChange={setBulkAction} options={bulkOptions} disabled={bulkBusy || !bulkExpanded || !selected.length} />
            <Button variant="outline" size="sm" disabled={!bulkAction || bulkBusy || loading || !bulkExpanded || !selected.length} isLoading={bulkBusy} onClick={() => bulkAction === "archive" ? setConfirmArchive(true) : void applyBulkAction()}>Apply</Button>
            </div>
          </div>
          </div>
          </div>
          </div>
          </div>
        </Card>
      ) : null}

      <DataTableCard loading={loading || bulkBusy} loadingText="Loading deals…" pagination={{ page, pageSize, total: meta.total, totalPages: meta.totalPages, setPage, setPageSize: (size) => { setPageSize(size); setPage(1); }, pageSizeOptions: PAGE_SIZE_OPTIONS, loading: loading || bulkBusy }}>
        <Table withWrapper={false}>
          <TableHeader><TableRow>{canSelect ? <TableHead><Checkbox aria-label="Select all deals on this page" checked={allSelected} indeterminate={selected.length > 0 && !allSelected} disabled={loading || bulkBusy || !selectableDeals.length} onChange={(event) => setSelected(event.target.checked ? selectableDeals.map((deal) => deal._id) : [])} onClick={(event) => event.stopPropagation()} /></TableHead> : null}<TableHead>Deal</TableHead><TableHead>Products</TableHead><TableHead>Value</TableHead><TableHead>Deal price</TableHead><TableHead>Saving</TableHead><TableHead>Availability</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {!loading && deals.length === 0 ? <TableRow className={sharedTableStyles.emptyStateRow}><TableCell className={sharedTableStyles.emptyTableCell} colSpan={canSelect ? 8 : 7}>No deals match these filters.</TableCell></TableRow> : deals.map((deal) => {
              const dealStatus = statusFor(deal);
              const editable = canUpdate && !deal.archivedAt;
              return (
                <TableRow key={deal._id} selected={selected.includes(deal._id)} className={editable ? styles.clickableRow : undefined} onClick={() => openDeal(deal)} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (editable && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDeal(deal); } }} tabIndex={editable ? 0 : undefined} aria-label={editable ? `Edit ${deal.name}` : undefined}>
                  {canSelect ? <TableCell className={orderTableStyles.checkboxCol} data-label="Select"><Checkbox aria-label={`Select ${deal.name}`} checked={selected.includes(deal._id)} disabled={bulkBusy || !!deal.archivedAt} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelected((current) => event.target.checked ? [...current, deal._id] : current.filter((id) => id !== deal._id))} /></TableCell> : null}
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
      <Modal isOpen={confirmArchive} onClose={() => { if (!bulkBusy) setConfirmArchive(false); }} closeDisabled={bulkBusy} title="Archive selected deals" size="sm">
        <p>Archive {selected.length} selected deal{selected.length === 1 ? "" : "s"}? They will be removed from the storefront and cannot be edited.</p>
        <ModalFooter>
          <Button variant="outline" disabled={bulkBusy} onClick={() => setConfirmArchive(false)}>Cancel</Button>
          <Button variant="danger" isLoading={bulkBusy} disabled={bulkBusy} onClick={() => void applyBulkAction()}>Archive deals</Button>
        </ModalFooter>
      </Modal>
    </PageContainer>
  );
};
