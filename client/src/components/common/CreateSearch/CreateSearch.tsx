import React from "react";
import { Input } from "../Input";
import { X as XIcon } from "lucide-react";
import styles from "./CreateSearch.module.css";

export interface CreateSearchOption {
  id: string;
  title: string;
  subtitle?: string;
}

interface CreateSearchProps {
  value: string;
  onChange: (value: string) => void;
  options: CreateSearchOption[];
  selectedId?: string;
  onSelect: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  placeholder?: string;
  noResultsText?: string;
  showResults?: boolean;
  onClear?: () => void;
}

export const CreateSearch: React.FC<CreateSearchProps> = ({
  value,
  onChange,
  options,
  selectedId,
  onSelect,
  loading = false,
  error,
  disabled = false,
  placeholder = "Search...",
  noResultsText = "No results",
  showResults = true,
  onClear,
}) => {
  const hasQuery = value.trim().length > 0;

  return (
    <div className={styles.root}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        fullWidth
        disabled={disabled}
      />

      {onClear && hasQuery ? (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={onClear}
          aria-label="Clear search"
        >
          <XIcon size={16} />
        </button>
      ) : null}

      {showResults && hasQuery ? (
        <div className={styles.suggestions}>
          {loading ? (
            <div className={styles.stateRow}>Searching...</div>
          ) : error ? (
            <div className={styles.stateRowError}>{error}</div>
          ) : options.length === 0 ? (
            <div className={styles.stateRow}>{noResultsText}</div>
          ) : (
            options.map((option) => {
              const selected = selectedId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`${styles.optionBtn} ${selected ? styles.optionBtnSelected : ""}`}
                  onClick={() => onSelect(option.id)}
                  disabled={disabled}
                >
                  <span className={styles.optionTitle}>{option.title}</span>
                  {option.subtitle ? (
                    <span className={styles.optionSubtitle}>
                      {option.subtitle}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
};
