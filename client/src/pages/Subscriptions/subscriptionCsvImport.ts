export type ImportVariant = {
  _id: string;
  sku?: string;
  name: string;
  productName: string;
};

export type ImportPayloadRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    postcode: string;
    country: string;
    isDefault: true;
  };
  subscription: {
    frequency: "weekly" | "every_two_weeks" | "monthly";
    preferredDeliveryDay: number;
    preferredDeliveryDays: number[];
    items: Array<{ variantId: string; quantity: number }>;
    deliveryDayPlans?: Array<{
      day: number;
      items: Array<{ variantId: string; quantity: number }>;
    }>;
    notes?: string;
  };
};

export type ParsedImportRow = {
  rowNumber: number;
  name: string;
  email: string;
  schedule: string;
  itemSummary: string;
  errors: string[];
  payload?: ImportPayloadRow;
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DAY_ALIASES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const FREQUENCIES: Record<string, ImportPayloadRow["subscription"]["frequency"]> = {
  weekly: "weekly",
  week: "weekly",
  fortnightly: "every_two_weeks",
  fortnight: "every_two_weeks",
  "every 2 weeks": "every_two_weeks",
  "every two weeks": "every_two_weeks",
  every_two_weeks: "every_two_weeks",
  monthly: "monthly",
  month: "monthly",
};

const normaliseHeader = (value: string) =>
  value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

const getValue = (
  row: string[],
  headers: Map<string, number>,
  aliases: string[],
) => {
  for (const alias of aliases) {
    const column = headers.get(normaliseHeader(alias));
    if (column !== undefined) return String(row[column] || "").trim();
  }
  return "";
};

const splitName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
};

const parseFlatItems = (
  rawItems: string,
  variantBySku: Map<string, ImportVariant>,
) => {
  const errors: string[] = [];
  const items: Array<{ variantId: string; quantity: number }> = [];
  const labels: string[] = [];
  const separator = /\s*(?:,|;|\n)+\s*/;

  rawItems
    .split(separator)
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((entry) => {
      let sku = "";
      let quantity = 0;
      const quantityFirst = entry.match(/^(\d+)\s*x\s*(.+)$/i);
      const skuFirst = entry.match(/^(.+?)\s*:\s*(\d+)$/);
      if (quantityFirst) {
        quantity = Number(quantityFirst[1]);
        sku = quantityFirst[2].trim();
      } else if (skuFirst) {
        sku = skuFirst[1].trim();
        quantity = Number(skuFirst[2]);
      } else {
        errors.push(`Use SKU:quantity for “${entry}”`);
        return;
      }

      const variant = variantBySku.get(sku.toLowerCase());
      if (!variant) {
        errors.push(`Unknown or unavailable SKU “${sku}”`);
        return;
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        errors.push(`Quantity for “${sku}” must be between 1 and 99`);
        return;
      }
      items.push({ variantId: variant._id, quantity });
      labels.push(`${quantity}× ${variant.sku}`);
    });

  return { items, labels, errors };
};

const parseDaySpecificItems = (
  rawItems: string,
  variantBySku: Map<string, ImportVariant>,
) => {
  const errors: string[] = [];
  const labels: string[] = [];
  const dayPlans: Array<{
    day: number;
    items: Array<{ variantId: string; quantity: number }>;
  }> = [];

  const blocks = rawItems
    .split(/\s*\|\s*/)
    .map((value) => value.trim())
    .filter(Boolean);

  const seenDays = new Set<number>();
  for (const block of blocks) {
    const eqIndex = block.indexOf("=");
    if (eqIndex <= 0) {
      errors.push(`Use Day=SKU:quantity format for "${block}"`);
      continue;
    }

    const dayLabel = block.slice(0, eqIndex).trim();
    const dayIndex = DAY_ALIASES[dayLabel.toLowerCase()];
    if (dayIndex === undefined) {
      errors.push(`Delivery day is not recognised in "${block}"`);
      continue;
    }
    if (seenDays.has(dayIndex)) {
      errors.push(`Duplicate day block for "${DAY_NAMES[dayIndex]}"`);
      continue;
    }
    seenDays.add(dayIndex);

    const itemText = block.slice(eqIndex + 1).trim();
    const parsed = parseFlatItems(itemText, variantBySku);
    if (parsed.errors.length) {
      errors.push(...parsed.errors.map((error) => `${DAY_NAMES[dayIndex]}: ${error}`));
      continue;
    }
    if (!parsed.items.length) {
      errors.push(`Add at least one item for ${DAY_NAMES[dayIndex]}`);
      continue;
    }

    dayPlans.push({ day: dayIndex, items: parsed.items });
    labels.push(`${DAY_NAMES[dayIndex]}: ${parsed.labels.join(", ")}`);
  }

  const mergedItemsMap = new Map<string, { variantId: string; quantity: number }>();
  for (const plan of dayPlans) {
    for (const item of plan.items) {
      const existing = mergedItemsMap.get(item.variantId);
      if (!existing || item.quantity > existing.quantity) {
        mergedItemsMap.set(item.variantId, { ...item });
      }
    }
  }

  return {
    dayPlans,
    items: Array.from(mergedItemsMap.values()),
    labels,
    errors,
  };
};

const parseItems = (
  rawItems: string,
  variantBySku: Map<string, ImportVariant>,
) => {
  const hasDayBlocks = /(^|\|)\s*[a-zA-Z]{3,}\s*=/.test(rawItems);
  if (!hasDayBlocks) {
    const parsed = parseFlatItems(rawItems, variantBySku);
    return {
      ...parsed,
      isDaySpecific: false,
      dayPlans: [] as Array<{
        day: number;
        items: Array<{ variantId: string; quantity: number }>;
      }>,
    };
  }

  const parsed = parseDaySpecificItems(rawItems, variantBySku);
  return {
    ...parsed,
    isDaySpecific: true,
  };
};

export const parseSubscriptionCsv = (
  text: string,
  variants: ImportVariant[],
  availableDeliveryDays: number[],
): ParsedImportRow[] => {
  const csvRows = parseCsv(text);
  if (csvRows.length < 2) throw new Error("The CSV has no customer rows");
  if (csvRows.length > 251) throw new Error("A CSV can contain up to 250 customers");

  const headers = new Map<string, number>();
  csvRows[0].forEach((header, index) => {
    const key = normaliseHeader(header);
    if (key && !headers.has(key)) headers.set(key, index);
  });
  const variantBySku = new Map(
    variants
      .filter((variant) => variant.sku)
      .map((variant) => [String(variant.sku).trim().toLowerCase(), variant]),
  );
  const allowedDays = new Set(availableDeliveryDays);
  const seenEmails = new Set<string>();

  return csvRows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    const fullName = getValue(row, headers, ["name", "customer name"]);
    const split = splitName(fullName);
    const firstName =
      getValue(row, headers, ["first name", "firstname"]) || split.firstName;
    const lastName =
      getValue(row, headers, ["last name", "lastname", "surname"]) ||
      split.lastName;
    const email = getValue(row, headers, ["email", "email address"]).toLowerCase();
    const phone = getValue(row, headers, ["phone", "contact no", "contact number", "telephone"]);
    const line1 = getValue(row, headers, ["address line 1", "address 1", "address"]);
    const line2 = getValue(row, headers, ["address line 2", "address 2"]);
    const city = getValue(row, headers, ["city", "town"]);
    const postcode = getValue(row, headers, ["postcode", "postal code"]);
    const country = getValue(row, headers, ["country"]) || "United Kingdom";
    const notes = getValue(row, headers, [
      "delivery instructions",
      "delivery notes",
      "notes",
    ]);
    const rawFrequency = getValue(row, headers, ["frequency"]).toLowerCase();
    const frequency = FREQUENCIES[rawFrequency];
    const rawDays = getValue(row, headers, ["delivery days", "delivery day", "day"]);
    const rawItems = getValue(row, headers, ["items", "order", "products"]);
    const errors: string[] = [];

    if (!firstName) errors.push("First name is required");
    if (!lastName) errors.push("Last name is required (split single names in the CSV)");
    if (!email) errors.push("Email is required for payment setup");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email is not valid");
    else if (seenEmails.has(email)) errors.push("Duplicate email in this CSV");
    else seenEmails.add(email);
    if (!line1) errors.push("Address line 1 is required");
    if (!city) errors.push("City or town is required");
    if (!postcode) errors.push("Postcode is required");
    if (!frequency) errors.push("Frequency must be weekly, fortnightly, or monthly");

    const deliveryDays = [...new Set(
      rawDays
        .split(/[|,;/]+/)
        .map((day) => DAY_ALIASES[day.trim().toLowerCase()])
        .filter((day) => day !== undefined),
    )].sort((a, b) => a - b);
    if (!rawDays) errors.push("Delivery day is required");
    else if (!deliveryDays.length) errors.push("Delivery day is not recognised");
    else if (deliveryDays.some((day) => !allowedDays.has(day))) {
      errors.push("Delivery day is not enabled in subscription settings");
    }
    if (frequency && frequency !== "weekly" && deliveryDays.length > 1) {
      errors.push("Only weekly subscriptions can use more than one delivery day");
    }

    const parsedItems = parseItems(rawItems, variantBySku);
    if (!rawItems) errors.push("At least one SKU and quantity is required");
    errors.push(...parsedItems.errors);
    if (parsedItems.isDaySpecific) {
      const planDays = new Set(parsedItems.dayPlans.map((plan) => plan.day));
      const missingConfiguredDays = deliveryDays.filter((day) => !planDays.has(day));
      if (missingConfiguredDays.length) {
        errors.push(
          `Add day blocks for each selected day: ${missingConfiguredDays
            .map((day) => DAY_NAMES[day])
            .join(", ")}`,
        );
      }
      const outOfScheduleDays = parsedItems.dayPlans
        .map((plan) => plan.day)
        .filter((day) => !deliveryDays.includes(day));
      if (outOfScheduleDays.length) {
        errors.push(
          `Day blocks include days outside delivery schedule: ${[...new Set(outOfScheduleDays)]
            .map((day) => DAY_NAMES[day])
            .join(", ")}`,
        );
      }
    }
    if (rawItems && !parsedItems.items.length && !parsedItems.errors.length) {
      errors.push("At least one valid product is required");
    }

    const name = `${firstName} ${lastName}`.trim() || "Unnamed customer";
    const schedule = frequency
      ? `${frequency === "every_two_weeks" ? "Every 2 weeks" : frequency[0].toUpperCase() + frequency.slice(1)} · ${deliveryDays.map((day) => DAY_NAMES[day]).join(", ") || "No day"}`
      : rawFrequency || "No frequency";
    const parsed: ParsedImportRow = {
      rowNumber,
      name,
      email,
      schedule,
      itemSummary: parsedItems.labels.join(", ") || "No valid items",
      errors,
    };
    if (!errors.length && frequency) {
      parsed.payload = {
        rowNumber,
        firstName,
        lastName,
        email,
        ...(phone ? { phone } : {}),
        address: {
          line1,
          ...(line2 ? { line2 } : {}),
          city,
          postcode,
          country,
          isDefault: true,
        },
        subscription: {
          frequency,
          preferredDeliveryDay: deliveryDays[0],
          preferredDeliveryDays: deliveryDays,
          items: parsedItems.items,
          ...(parsedItems.isDaySpecific && parsedItems.dayPlans.length
            ? { deliveryDayPlans: parsedItems.dayPlans }
            : {}),
          ...(notes ? { notes } : {}),
        },
      };
    }
    return parsed;
  });
};

export const escapeCsvCell = (value: unknown) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
