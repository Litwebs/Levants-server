import type {
  AnalyticsComparisonMode,
  AnalyticsDateRange,
  AnalyticsOrderSource,
  RevenueInterval,
} from "./constants";

export const analyticsDateRangeOptions: {
  value: AnalyticsDateRange;
  label: string;
}[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 Days" },
  { value: "last30", label: "Last 30 Days" },
  { value: "thisMonth", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "thisYear", label: "This Year" },
  { value: "lastYear", label: "Last Year" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" },
];

export const analyticsOrderSourceOptions: {
  value: AnalyticsOrderSource;
  label: string;
}[] = [
  { value: "all", label: "All Sources" },
  { value: "website", label: "Website" },
  { value: "subscription", label: "Subscription" },
  { value: "imported", label: "Imported" },
];

export const analyticsComparisonOptions: {
  value: AnalyticsComparisonMode;
  label: string;
}[] = [
  { value: "previous_period", label: "Compare: Previous Period" },
  { value: "previous_year", label: "Compare: Previous Year" },
  { value: "none", label: "Compare: None" },
];

export const analyticsIntervalOptions: {
  value: RevenueInterval;
  label: string;
}[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

export const defaultAnalyticsIntervalForRange = (
  range: AnalyticsDateRange,
): RevenueInterval => {
  if (range === "today" || range === "yesterday" || range === "last7") {
    return "day";
  }
  if (range === "last30" || range === "thisMonth" || range === "lastMonth") {
    return "week";
  }
  if (range === "thisYear" || range === "lastYear" || range === "all") {
    return "month";
  }
  return "day";
};
