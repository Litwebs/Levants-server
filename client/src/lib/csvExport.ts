export type CsvValue = string | number | boolean | null | undefined;

export type CsvColumn<Row> = {
  header: string;
  value: (row: Row) => CsvValue;
};

const escapeCsvValue = (value: CsvValue) => {
  if (value === null || value === undefined) return "";

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  let text = value;
  if (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

export const buildCsv = <Row,>(
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[],
) => {
  const header = columns.map((column) => escapeCsvValue(column.header)).join(",");
  const body = rows.map((row) =>
    columns
      .map((column) => escapeCsvValue(column.value(row)))
      .join(","),
  );

  return [header, ...body].join("\r\n");
};

const sanitizeFilename = (filename: string) => {
  const cleaned = filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const base = cleaned || "analytics-export";
  return base.toLowerCase().endsWith(".csv") ? base : `${base}.csv`;
};

export const downloadCsv = <Row,>(
  filename: string,
  rows: readonly Row[],
  columns: readonly CsvColumn<Row>[],
) => {
  const csv = `\uFEFF${buildCsv(rows, columns)}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = sanitizeFilename(filename);
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
