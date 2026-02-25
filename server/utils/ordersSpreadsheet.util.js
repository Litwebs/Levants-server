const XLSX = require("xlsx");
const { parse } = require("csv-parse/sync");

const bufferToUtf8 = (buffer) => {
  if (!buffer) return "";
  if (Buffer.isBuffer(buffer)) return buffer.toString("utf8");
  return Buffer.from(buffer).toString("utf8");
};

const guessIsXlsx = ({ originalName, mimeType } = {}) => {
  const name =
    typeof originalName === "string" ? originalName.toLowerCase() : "";
  const mime = typeof mimeType === "string" ? mimeType.toLowerCase() : "";

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return true;

  return (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel"
  );
};

const normalizeKey = (key) => {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
};

const detectDelimiter = (text) => {
  const firstLine = String(text || "").split(/\r?\n/)[0] || "";
  const candidates = [",", ";", "\t"];

  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
};

/**
 * Parses an uploaded spreadsheet (XLSX/CSV) into JSON rows.
 *
 * Returns:
 * - detectedType: 'xlsx' | 'csv' | 'unknown'
 * - rows: Array<object>
 * - csvText: string (best-effort; useful for auditing/debug)
 */
const spreadsheetUploadToRows = ({ buffer, originalName, mimeType } = {}) => {
  if (!buffer) return { detectedType: "unknown", rows: [], csvText: "" };

  const isXlsx = guessIsXlsx({ originalName, mimeType });

  if (!isXlsx) {
    const csvText = bufferToUtf8(buffer).replace(/^\uFEFF/, "");
    const delimiter = detectDelimiter(csvText);

    let records = [];
    try {
      records = parse(csvText, {
        columns: true,
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
        delimiter,
      });
    } catch (_) {
      records = [];
    }

    // Normalize keys to preserve original display but allow consistent picking.
    const rows = Array.isArray(records)
      ? records.map((r) => {
          if (!r || typeof r !== "object") return {};
          const out = {};
          for (const [k, v] of Object.entries(r)) {
            out[String(k || "") || ""] = v;
          }
          return out;
        })
      : [];

    return { detectedType: "csv", rows, csvText };
  }

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) return { detectedType: "xlsx", rows: [], csvText: "" };

  const sheet = workbook.Sheets[sheetName];

  // Read as an array-of-arrays so we can control header mapping (more robust across exports).
  const table = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  const headerRow =
    Array.isArray(table) && Array.isArray(table[0]) ? table[0] : [];
  const headers = headerRow.map((h, idx) => {
    const base = String(h || "").trim();
    return base ? base : `col_${idx}`;
  });

  // Ensure unique header keys (duplicate headers are common in spreadsheet exports)
  const seen = new Map();
  const uniqueHeaders = headers.map((h) => {
    const key = String(h);
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    return count === 1 ? key : `${key}_${count}`;
  });

  const rows = Array.isArray(table)
    ? table.slice(1).map((row) => {
        const obj = {};
        const arr = Array.isArray(row) ? row : [];
        for (let i = 0; i < uniqueHeaders.length; i++) {
          obj[uniqueHeaders[i]] = arr[i] ?? "";
        }
        return obj;
      })
    : [];

  const nonEmptyRows = rows.filter((r) => {
    if (!r || typeof r !== "object") return false;
    return Object.values(r).some((v) => String(v ?? "").trim());
  });

  const csvText = XLSX.utils.sheet_to_csv(sheet, {
    blankrows: false,
    FS: ",",
    RS: "\n",
  });

  // Some sheets may have empty/duplicate headers; sheet_to_json will then produce numeric keys.
  // We keep that as-is; downstream mapping should be tolerant.
  return {
    detectedType: "xlsx",
    rows: nonEmptyRows,
    csvText: String(csvText || "").replace(/^\uFEFF/, ""),
  };
};

module.exports = {
  spreadsheetUploadToRows,
  normalizeKey,
};
