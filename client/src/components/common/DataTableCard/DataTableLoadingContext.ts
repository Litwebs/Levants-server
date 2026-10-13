import { createContext, useContext } from "react";

type DataTableLoadingState = {
  loading: boolean;
  label: string;
  rowCount: number;
};

export const DataTableLoadingContext = createContext<DataTableLoadingState>({
  loading: false,
  label: "Loading table…",
  rowCount: 8,
});

export const useDataTableLoading = () => useContext(DataTableLoadingContext);
