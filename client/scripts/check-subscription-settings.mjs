import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/pages/Subscriptions/subscriptionSettingsPatch.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { buildSubscriptionSettingsPatch: build } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
const current = { frequency: "weekly", preferredDeliveryDay: 0,
  preferredDeliveryDays: [0, 3], notes: "Original" };
const cases = [
  ["unchanged", {}, {}],
  ["notes-only", { notes: "Updated" }, { notes: "Updated" }],
  ["trimmed note", { notes: "  Updated  " }, { notes: "Updated" }],
  ["clear note", { notes: "  " }, { notes: null }],
  ["null note", { notes: null }, { notes: null }],
  ["equivalent day and note", { preferredDeliveryDay: "0", notes: " Original " }, {}],
  ["frequency-only", { frequency: "monthly" }, { frequency: "monthly" }],
  ["explicit day", { preferredDeliveryDay: "3" }, { preferredDeliveryDay: 3 }],
  ["day and note", { preferredDeliveryDay: "3", notes: "Updated" }, { preferredDeliveryDay: 3, notes: "Updated" }],
  ["all changed", { frequency: "monthly", preferredDeliveryDay: "3", notes: "Updated" },
    { frequency: "monthly", preferredDeliveryDay: 3, notes: "Updated" }],
];
for (const [name, changes, expected] of cases) {
  const draft = { ...current, ...changes };
  const before = structuredClone(current);
  assert.deepEqual(build(current, draft), expected, name);
  assert.deepEqual(current, before, `${name}: current settings must not mutate`);
}
assert.deepEqual(build({ ...current, notes: null }, { ...current, notes: "" }), {});
assert.deepEqual(build({ ...current, preferredDeliveryDays: [0] }, { ...current, notes: "Updated" }), { notes: "Updated" });
console.log("Subscription settings patch: 12 regression cases passed");
