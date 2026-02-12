import React from "react";
import styles from "./SimpleChart.module.css";
import { formatCompactNumber } from "../../lib/numberFormat";

interface DataPoint {
  label: string;
  value: number;
  highlight?: boolean;
}

interface SimpleChartProps {
  data: DataPoint[];
  type: "bar" | "line";
  height?: number;
  showLabels?: boolean;
  color?: "primary" | "success" | "info";
  valueFormatter?: (value: number) => string;
}

export const SimpleBarChart: React.FC<SimpleChartProps> = ({
  data,
  height = 200,
  showLabels = true,
  color = "primary",
  valueFormatter,
}) => {
  const maxValue = data.length ? Math.max(...data.map((d) => d.value)) : 0;

  return (
    <div className={styles.chartContainer} style={{ height }}>
      <div className={styles.barChart}>
        {data.map((item, index) => {
          const barHeight = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
          return (
            <div key={index} className={styles.barWrapper}>
              <div className={styles.barContainer}>
                <div
                  className={`${styles.bar} ${styles[color]} ${item.highlight ? styles.highlight : ""}`}
                  style={{ height: `${barHeight}%` }}
                >
                  <span className={styles.barValue}>
                    {valueFormatter
                      ? valueFormatter(item.value)
                      : `£${item.value.toFixed(0)}`}
                  </span>
                </div>
              </div>
              {showLabels && (
                <span
                  className={`${styles.barLabel} ${item.highlight ? styles.highlightLabel : ""}`}
                >
                  {item.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface HorizontalBarProps {
  data: { label: string; value: number; percentage: number }[];
  height?: number;
  color?: "primary" | "success" | "info" | "warning";
}

export const HorizontalBarChart: React.FC<HorizontalBarProps> = ({
  data,
  color = "primary",
}) => {
  return (
    <div className={styles.horizontalChart}>
      {data.map((item, index) => (
        <div key={index} className={styles.horizontalBarItem}>
          <div className={styles.horizontalLabel}>
            <span className={styles.horizontalName}>{item.label}</span>
            <span className={styles.horizontalValue}>
              {formatCompactNumber(item.value)} sold
            </span>
          </div>
          <div className={styles.horizontalBarBg}>
            <div
              className={`${styles.horizontalBar} ${styles[color]}`}
              style={{ width: `${item.percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
  showLegendValues?: boolean;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  size = 160,
  centerLabel,
  centerValue,
  showLegendValues = false,
}) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let cumulativePercentage = 0;

  const segments = data.map((item) => {
    const percentage = total > 0 ? (item.value / total) * 100 : 0;
    const startAngle = cumulativePercentage * 3.6;
    cumulativePercentage += percentage;
    return {
      ...item,
      percentage,
      startAngle,
      endAngle: cumulativePercentage * 3.6,
    };
  });

  const createArcPath = (
    startAngle: number,
    endAngle: number,
    radius: number,
    innerRadius: number,
  ) => {
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;

    const x1 = 50 + radius * Math.cos(startRad);
    const y1 = 50 + radius * Math.sin(startRad);
    const x2 = 50 + radius * Math.cos(endRad);
    const y2 = 50 + radius * Math.sin(endRad);

    const x3 = 50 + innerRadius * Math.cos(endRad);
    const y3 = 50 + innerRadius * Math.sin(endRad);
    const x4 = 50 + innerRadius * Math.cos(startRad);
    const y4 = 50 + innerRadius * Math.sin(startRad);

    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4} Z`;
  };

  return (
    <div className={styles.donutContainer}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className={styles.donutSvg}
      >
        {segments.map((segment, index) => (
          <path
            key={index}
            d={createArcPath(
              segment.startAngle,
              segment.endAngle - 0.5,
              45,
              30,
            )}
            fill={segment.color}
            className={styles.donutSegment}
          />
        ))}
      </svg>
      {centerLabel && (
        <div className={styles.donutCenter}>
          <span className={styles.donutValue}>{centerValue}</span>
          <span className={styles.donutLabel}>{centerLabel}</span>
        </div>
      )}
      <div className={styles.donutLegend}>
        {data.map((item, index) => (
          <div key={index} className={styles.legendItem}>
            <span
              className={styles.legendDot}
              style={{ backgroundColor: item.color }}
            />
            <span className={styles.legendText}>
              {showLegendValues
                ? `${item.label} (${formatCompactNumber(item.value)})`
                : item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
