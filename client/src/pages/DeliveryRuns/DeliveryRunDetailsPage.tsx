import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { useDeliveryRun } from "./useDeliveryRun";
import type { VanId } from "@/context/DeliveryRuns";
import {
  RunSummaryCards,
  RunActionsBar,
  VansGrid,
  MapView,
  ManifestTables,
  RouteDrawer,
  PrintLayout,
} from "./components";
import { Button } from "@/components/common";
import { useToast } from "@/components/common/Toast";
import styles from "./DeliveryRunDetailsPage.module.css";

type TabId = "overview" | "vans" | "map" | "manifests";

export const DeliveryRunDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const {
    run,
    loading,
    error,
    actionLoading,
    lock,
    unlock,
    optimize,
    dispatch,
  } = useDeliveryRun(id!);

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [selectedVan, setSelectedVan] = useState<VanId | "all">("all");
  const [routeDrawerVan, setRouteDrawerVan] = useState<VanId | null>(null);
  const [printVan, setPrintVan] = useState<{
    vanId: VanId;
    type: "stops" | "manifest";
  } | null>(null);

  const handleAction = async (
    action: () => Promise<boolean>,
    successMsg: string,
    errorMsg: string,
  ) => {
    try {
      const success = await action();
      if (success) {
        showToast({ type: "success", title: successMsg });
      } else {
        showToast({ type: "error", title: errorMsg });
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : errorMsg;
      showToast({ type: "error", title: message });
    }
  };

  const handleViewRoute = (vanId: VanId) => {
    setRouteDrawerVan(vanId);
  };

  const handleViewManifest = (vanId: VanId) => {
    setActiveTab("manifests");
  };

  const handlePrint = (vanId: VanId) => {
    setPrintVan({ vanId, type: "stops" });
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <Loader2 size={24} className={styles.spinner} />
        Loading delivery run...
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className={styles.notFound}>
        <h2 className={styles.notFoundTitle}>Delivery Run Not Found</h2>
        <p className={styles.notFoundText}>
          {error || "The requested delivery run could not be found."}
        </p>
        <Button variant="primary" onClick={() => navigate("/delivery-runs")}>
          Back to Delivery Runs
        </Button>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const selectedVanData = routeDrawerVan
    ? run.vans.find((v) => v.vanId === routeDrawerVan)
    : null;

  const printVanData = printVan
    ? run.vans.find((v) => v.vanId === printVan.vanId)
    : null;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={() => navigate("/delivery-runs")}
        >
          <ArrowLeft size={18} />
          Back
        </button>
        <div className={styles.headerInfo}>
          <h1 className={styles.title}>
            Delivery Run: {formatDate(run.deliveryDate)}
          </h1>
          <p className={styles.subtitle}>
            Run ID: {run.id} • Created:{" "}
            {new Date(run.createdAt).toLocaleString("en-GB")}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <RunSummaryCards run={run} />

      {/* Actions Bar */}
      <RunActionsBar
        run={run}
        actionLoading={actionLoading}
        onLock={() =>
          handleAction(
            lock,
            "Run locked successfully",
            "Failed to lock run",
          ).then(() => true)
        }
        onUnlock={() =>
          handleAction(unlock, "Run unlocked", "Failed to unlock run").then(
            () => true,
          )
        }
        onOptimize={(driverIds) =>
          handleAction(
            () => optimize(driverIds),
            "Routes optimized!",
            "Failed to optimize routes",
          ).then(() => true)
        }
        onDispatch={() =>
          handleAction(
            dispatch,
            "Run dispatched!",
            "Failed to dispatch run",
          ).then(() => true)
        }
      />

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        <div className={styles.tabsList}>
          <button
            className={`${styles.tab} ${activeTab === "overview" ? styles.active : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            className={`${styles.tab} ${activeTab === "vans" ? styles.active : ""}`}
            onClick={() => setActiveTab("vans")}
          >
            Vans & Routes
          </button>
          <button
            className={`${styles.tab} ${activeTab === "map" ? styles.active : ""}`}
            onClick={() => setActiveTab("map")}
            disabled={run.vans.length === 0}
          >
            Map View
          </button>
          <button
            className={`${styles.tab} ${activeTab === "manifests" ? styles.active : ""}`}
            onClick={() => setActiveTab("manifests")}
            disabled={run.vans.length === 0}
          >
            Manifests
          </button>
        </div>

        <div className={styles.tabContent}>
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <>
              {run.issues.length > 0 && (
                <div className={styles.issuesPanel}>
                  <div className={styles.issuesHeader}>
                    <AlertTriangle size={18} />
                    Issues ({run.issues.length})
                  </div>
                  <div className={styles.issuesList}>
                    {run.issues.map((issue, idx) => (
                      <div key={idx} className={styles.issueItem}>
                        <span className={styles.issueType}>{issue.type}</span>
                        <span className={styles.issueMessage}>
                          {issue.message}
                        </span>
                        {issue.orderId && (
                          <span className={styles.issueOrder}>
                            {issue.orderId}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {run.unassignedOrders.length > 0 && (
                <div className={styles.unassignedPanel}>
                  <h3 className={styles.sectionTitle}>
                    Unassigned Orders ({run.unassignedOrders.length})
                  </h3>
                  <div className={styles.unassignedGrid}>
                    {run.unassignedOrders.map((order) => (
                      <div
                        key={order.orderId}
                        className={styles.unassignedCard}
                      >
                        <div className={styles.unassignedName}>
                          {order.customerName}
                        </div>
                        <div className={styles.unassignedMeta}>
                          {order.orderId} • {order.postcode} •{" "}
                          {order.totalItems} items
                          {order.issueTag && ` • ⚠️ ${order.issueTag}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {run.issues.length === 0 && run.unassignedOrders.length === 0 && (
                <div className={styles.emptyTab}>
                  {run.vans.length === 0
                    ? "No routes generated yet. Lock the run and optimize to create routes."
                    : "All orders assigned. No issues detected."}
                </div>
              )}
            </>
          )}

          {/* Vans & Routes Tab */}
          {activeTab === "vans" && (
            <VansGrid
              vans={run.vans}
              onViewRoute={handleViewRoute}
              onViewManifest={handleViewManifest}
              onPrint={handlePrint}
            />
          )}

          {/* Map View Tab */}
          {activeTab === "map" &&
            (run.vans.length > 0 ? (
              <MapView
                vans={run.vans}
                selectedVan={selectedVan}
                onSelectVan={setSelectedVan}
                runStatus={run.status}
              />
            ) : (
              <div className={styles.emptyTab}>
                No routes to display. Generate routes first.
              </div>
            ))}

          {/* Manifests Tab */}
          {activeTab === "manifests" && <ManifestTables vans={run.vans} />}
        </div>
      </div>

      {/* Route Drawer */}
      {selectedVanData && (
        <RouteDrawer
          van={selectedVanData}
          isOpen={!!routeDrawerVan}
          onClose={() => setRouteDrawerVan(null)}
          onPrint={() => {
            setPrintVan({ vanId: selectedVanData.vanId, type: "stops" });
          }}
        />
      )}

      {/* Print Layout Modal */}
      {printVanData && printVan && (
        <PrintLayout
          van={printVanData}
          run={run}
          type={printVan.type}
          isOpen={!!printVan}
          onClose={() => setPrintVan(null)}
        />
      )}
    </div>
  );
};

export default DeliveryRunDetailsPage;
