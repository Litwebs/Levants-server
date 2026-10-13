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

const GRID_STOPS = [0, 0.25, 0.5, 0.75, 1];

const formatChartValue = (
  value: number,
  formatter?: (value: number) => string,
) => (formatter ? formatter(value) : formatCompactNumber(value));

export const SimpleBarChart: React.FC<SimpleChartProps> = ({
  data,
  type,
  height = 200,
  showLabels = true,
  color = "primary",
  valueFormatter,
}) => {
  if (data.length === 0) {
    return (
      <div className={styles.chartContainer} style={{ height }}>
        <div className={styles.chartEmpty}>No data for this period</div>
      </div>
    );
  }

  if (type === "line") {
    const values = data.map((point) => point.value);
    const minValue = Math.min(0, ...(values.length ? values : [0]));
    let maxValue = Math.max(0, ...(values.length ? values : [0]));

    if (minValue === maxValue) {
      maxValue = minValue + 1;
    }

    maxValue = maxValue > 0 ? maxValue * 1.12 : maxValue;
    const range = maxValue - minValue;
    const plotTop = 6;
    const plotBottom = 72;
    const plotHeight = plotBottom - plotTop;
    const xAt = (index: number) =>
      data.length <= 1 ? 50 : 2 + (index / (data.length - 1)) * 96;
    const yAt = (value: number) =>
      plotTop + ((maxValue - value) / range) * plotHeight;
    const zeroY = yAt(0);
    const points = data
      .map((point, index) => `${xAt(index)},${yAt(point.value)}`)
      .join(" ");
    const labelStep = Math.max(1, Math.ceil(data.length / 6));

    return (
      <div className={styles.chartContainer} style={{ height }}>
        <div className={styles.lineChart}>
          <div className={styles.linePlot}>
            <div className={styles.yAxis} aria-hidden="true">
              {GRID_STOPS.map((stop) => (
                <span key={stop}>
                  {formatChartValue(maxValue - range * stop, valueFormatter)}
                </span>
              ))}
            </div>
            <svg
              className={styles.lineSvg}
              viewBox="0 0 100 78"
              preserveAspectRatio="none"
              role="img"
              aria-label="Time series chart"
            >
              {GRID_STOPS.map((stop) => (
                <line
                  key={stop}
                  x1="0"
                  x2="100"
                  y1={plotTop + stop * plotHeight}
                  y2={plotTop + stop * plotHeight}
                  className={styles.gridLine}
                />
              ))}
              <line
                x1="0"
                x2="100"
                y1={zeroY}
                y2={zeroY}
                className={styles.lineBaseline}
              />
              {data.length > 1 ? (
                <polyline
                  points={points}
                  className={`${styles.linePath} ${styles[color]}`}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {data.map((point, index) => (
                <circle
                  key={`${point.label}-${index}`}
                  cx={xAt(index)}
                  cy={yAt(point.value)}
                  r="1.25"
                  className={`${styles.linePoint} ${styles[color]}`}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>{`${point.label}: ${formatChartValue(point.value, valueFormatter)}`}</title>
                </circle>
              ))}
            </svg>
          </div>

          {showLabels ? (
            <div
              className={styles.lineLabels}
              style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
            >
              {data.map((point, index) => {
                const visible =
                  index % labelStep === 0 || index === data.length - 1;
                return (
                  <span
                    key={`${point.label}-label-${index}`}
                    className={styles.lineLabel}
                    title={point.label}
                  >
                    {visible ? point.label : ""}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

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

interface MultiLineSeries {
  key: string;
  label: string;
  color: "primary" | "success" | "info";
  data: DataPoint[];
}

interface MultiLineChartProps {
  series: MultiLineSeries[];
  height?: number;
  showLabels?: boolean;
  valueFormatter?: (value: number) => string;
}

export const MultiLineChart: React.FC<MultiLineChartProps> = ({
  series,
  height = 240,
  showLabels = true,
  valueFormatter,
}) => {
  const firstSeriesWithData = series.find((item) => item.data.length > 0);
  const labels = firstSeriesWithData?.data.map((point) => point.label) ?? [];
  const values = series.flatMap((item) => item.data.map((point) => point.value));

  const minValue = Math.min(0, ...(values.length ? values : [0]));
  let maxValue = Math.max(0, ...(values.length ? values : [0]));
  if (minValue === maxValue) maxValue = minValue + 1;

  maxValue = maxValue > 0 ? maxValue * 1.12 : maxValue;
  const range = maxValue - minValue;
  const plotTop = 6;
  const plotBottom = 72;
  const plotHeight = plotBottom - plotTop;
  const xAt = (index: number) =>
    labels.length <= 1 ? 50 : 2 + (index / (labels.length - 1)) * 96;
  const yAt = (value: number) =>
    plotTop + ((maxValue - value) / range) * plotHeight;
  const zeroY = yAt(0);
  const labelStep = Math.max(1, Math.ceil(labels.length / 6));

  if (labels.length === 0) {
    return (
      <div className={styles.chartContainer} style={{ height }}>
        <div className={styles.chartEmpty}>No data for this period</div>
      </div>
    );
  }

  return (
    <div className={styles.chartContainer} style={{ height }}>
      <div className={styles.lineChart}>
        <div className={styles.linePlot}>
          <div className={styles.yAxis} aria-hidden="true">
            {GRID_STOPS.map((stop) => (
              <span key={stop}>
                {formatChartValue(maxValue - range * stop, valueFormatter)}
              </span>
            ))}
          </div>
          <svg
            className={styles.lineSvg}
            viewBox="0 0 100 78"
            preserveAspectRatio="none"
            role="img"
            aria-label="Sales channel time series chart"
          >
          {GRID_STOPS.map((stop) => (
            <line
              key={stop}
              x1="0"
              x2="100"
              y1={plotTop + stop * plotHeight}
              y2={plotTop + stop * plotHeight}
              className={styles.gridLine}
            />
          ))}
          <line
            x1="0"
            x2="100"
            y1={zeroY}
            y2={zeroY}
            className={styles.lineBaseline}
          />

          {series.map((item) => {
            const points = item.data
              .map((point, index) => `${xAt(index)},${yAt(point.value)}`)
              .join(" ");

            return (
              <React.Fragment key={item.key}>
                {item.data.length > 1 ? (
                  <polyline
                    points={points}
                    className={`${styles.linePath} ${styles[item.color]}`}
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {item.data.map((point, index) => (
                  <circle
                    key={`${item.key}-${point.label}-${index}`}
                    cx={xAt(index)}
                    cy={yAt(point.value)}
                    r="1.2"
                    className={`${styles.linePoint} ${styles[item.color]}`}
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>
                      {`${item.label} · ${point.label}: ${
                        valueFormatter
                          ? valueFormatter(point.value)
                          : point.value.toLocaleString("en-GB")
                      }`}
                    </title>
                  </circle>
                ))}
              </React.Fragment>
            );
          })}
          </svg>
        </div>

        {showLabels ? (
          <div
            className={styles.lineLabels}
            style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
          >
            {labels.map((label, index) => {
              const visible =
                index % labelStep === 0 || index === labels.length - 1;
              return (
                <span
                  key={`${label}-multi-label-${index}`}
                  className={styles.lineLabel}
                  title={label}
                >
                  {visible ? label : ""}
                </span>
              );
            })}
          </div>
        ) : null}

        <div className={styles.multiLineLegend}>
          {series.map((item) => (
            <div key={item.key} className={styles.multiLineLegendItem}>
              <span
                className={`${styles.multiLineSwatch} ${styles[item.color]}`}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
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
  const visibleCount = data.filter((item) => item.value > 0).length;
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
      <div className={styles.donutVisual}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className={styles.donutSvg}
      >
        {total === 0 ? (
          <circle
            cx="50"
            cy="50"
            r="37.5"
            fill="none"
            className={styles.donutEmptyRing}
          />
        ) : null}
        {segments.map((segment, index) => (
          <path
            key={index}
            d={createArcPath(
              segment.startAngle,
              visibleCount > 1
                ? segment.endAngle - 0.5
                : segment.endAngle - 0.001,
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
      </div>
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
