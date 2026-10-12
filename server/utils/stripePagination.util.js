"use strict";

async function listAllStripePages(list, params) {
  const records = [];
  const seen = new Set();
  let cursor;
  do {
    const page = await list({ ...params, limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
    if (!Array.isArray(page.data)) throw new Error("Invalid provider history page");
    records.push(...page.data);
    if (!page.has_more) return records;
    const next = page.data.at(-1)?.id;
    if (!next || seen.has(next)) throw new Error("Provider history pagination did not advance");
    seen.add(next);
    cursor = next;
  } while (true);
}

module.exports = { listAllStripePages };
