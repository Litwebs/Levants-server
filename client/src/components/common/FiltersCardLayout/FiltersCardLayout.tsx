import React from "react";
import { Card } from "../Card";

interface FiltersCardLayoutProps {
  className?: string;
  topRow: React.ReactNode;
  expandedContent?: React.ReactNode;
  isExpanded?: boolean;
  expandedWrapClassName?: string;
  expandedOpenClassName?: string;
  expandedInnerClassName?: string;
}

export const FiltersCardLayout: React.FC<FiltersCardLayoutProps> = ({
  className,
  topRow,
  expandedContent,
  isExpanded = false,
  expandedWrapClassName = "",
  expandedOpenClassName = "",
  expandedInnerClassName = "",
}) => {
  return (
    <Card className={className}>
      {topRow}
      {expandedContent ? (
        <div
          className={`${expandedWrapClassName} ${isExpanded ? expandedOpenClassName : ""}`.trim()}
        >
          <div className={expandedInnerClassName}>{expandedContent}</div>
        </div>
      ) : null}
    </Card>
  );
};
