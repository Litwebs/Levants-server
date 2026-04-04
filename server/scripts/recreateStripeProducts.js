// scripts/recreateStripeProducts.js
// Recreate Stripe products/prices for all product variants in the DB.
//
// Why this exists:
// - Your app creates one Stripe Product + one Stripe Price per Variant.
// - If you moved to a new Stripe account, existing `stripeProductId`/`stripePriceId`
//   stored on variants must be recreated under the new account.
//
// Safety:
// - Default is DRY RUN (no Stripe writes, no DB writes).
// - To apply changes you must pass `--apply` and set
//   CONFIRM_RECREATE_STRIPE_PRODUCTS=YES.
//
// Usage:
//   node scripts/recreateStripeProducts.js
//   node scripts/recreateStripeProducts.js --apply
//   node scripts/recreateStripeProducts.js --apply --limit 10
//   node scripts/recreateStripeProducts.js --apply --product <productId>
//   node scripts/recreateStripeProducts.js --apply --variant <variantId>
//   node scripts/recreateStripeProducts.js --apply --archive-old
//
// Env required:
//   MONGO_URI=...
//   STRIPE_SECRET_KEY=...              (NEW Stripe account)
//
// Optional env:
//   STRIPE_API_VERSION=2023-10-16
//   STRIPE_DEFAULT_CURRENCY=GBP
//   OLD_STRIPE_SECRET_KEY=...          (OLD Stripe account; only needed if --archive-old)
//   CONFIRM_RECREATE_STRIPE_PRODUCTS=YES

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Stripe = require("stripe");

const Product = require("../models/product.model");
const Variant = require("../models/variant.model");

const must = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing required env: ${k}`);
  return v;
};

const hasFlag = (flag) => process.argv.includes(flag);

const getArgValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  const v = process.argv[idx + 1];
  if (!v || v.startsWith("--")) return undefined;
  return v;
};

const safeJson = (v) => {
  try {
    return JSON.stringify(v);
  } catch {
    return '"<unserializable>"';
  }
};

const toStripeCurrency = (currency) => {
  const c = String(currency || "GBP").trim();
  if (!c) return "gbp";
  return c.toLowerCase();
};

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const main = async () => {
  const apply = hasFlag("--apply");
  const dryRun = !apply;

  const limitRaw = getArgValue("--limit");
  const limit = limitRaw ? Math.max(1, Number(limitRaw)) : null;

  const includeArchived = hasFlag("--include-archived");
  const archiveOld = hasFlag("--archive-old");

  const productId = getArgValue("--product");
  const variantId = getArgValue("--variant");

  if (apply && process.env.CONFIRM_RECREATE_STRIPE_PRODUCTS !== "YES") {
    throw new Error(
      "Refusing to run with --apply. Set CONFIRM_RECREATE_STRIPE_PRODUCTS=YES",
    );
  }

  const mongoUri = must("MONGO_URI");
  const newStripeKey = must("STRIPE_SECRET_KEY");

  const apiVersion = process.env.STRIPE_API_VERSION || "2023-10-16";
  const currency = toStripeCurrency(
    process.env.STRIPE_DEFAULT_CURRENCY || "GBP",
  );

  const stripeNew = new Stripe(newStripeKey, { apiVersion });

  let stripeOld = null;
  if (archiveOld) {
    if (!process.env.OLD_STRIPE_SECRET_KEY) {
      throw new Error(
        "--archive-old requires OLD_STRIPE_SECRET_KEY (the OLD Stripe account key)",
      );
    }
    stripeOld = new Stripe(process.env.OLD_STRIPE_SECRET_KEY, { apiVersion });
  }

  console.log("\n🔁 Stripe variant recreation script");
  console.log(
    safeJson({
      mode: dryRun ? "dry-run" : "apply",
      limit,
      includeArchived,
      archiveOld,
      apiVersion,
      currency,
      productId: productId || null,
      variantId: variantId || null,
    }),
  );

  await mongoose.connect(mongoUri);

  try {
    // Ensure products referenced by variants exist (best effort sanity check)
    const productCount = await Product.estimatedDocumentCount();
    const variantCount = await Variant.estimatedDocumentCount();
    console.log(
      `DB counts: products=${productCount}, variants=${variantCount}`,
    );

    const query = {
      ...(includeArchived ? {} : { status: { $ne: "archived" } }),
      ...(productId ? { product: productId } : {}),
      ...(variantId ? { _id: variantId } : {}),
    };

    let variants = await Variant.find(query)
      .populate({ path: "product", select: "name" })
      .sort({ createdAt: 1 });

    if (limit) variants = variants.slice(0, limit);

    console.log(`Matched variants: ${variants.length}`);

    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = path.join(__dirname, "output");
    ensureDir(outDir);
    const outPath = path.join(outDir, `stripe-recreate-${runId}.json`);

    const results = {
      runId,
      mode: dryRun ? "dry-run" : "apply",
      startedAt: new Date().toISOString(),
      currency,
      apiVersion,
      archiveOld,
      includeArchived,
      filters: { productId: productId || null, variantId: variantId || null },
      totals: {
        variantsMatched: variants.length,
        variantsSucceeded: 0,
        variantsFailed: 0,
        oldArchived: 0,
      },
      items: [],
    };

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];

      const productName =
        v.product && typeof v.product === "object" ? v.product.name : null;
      const stripeProductName = `${productName || "(missing product)"} - ${v.name}`;

      const oldStripeProductId = v.stripeProductId || null;
      const oldStripePriceId = v.stripePriceId || null;

      const item = {
        index: i + 1,
        variantId: String(v._id),
        sku: v.sku,
        status: v.status,
        productId:
          v.product && typeof v.product === "object"
            ? String(v.product._id)
            : null,
        productName,
        variantName: v.name,
        price: v.price,
        old: {
          stripeProductId: oldStripeProductId,
          stripePriceId: oldStripePriceId,
        },
        new: {
          stripeProductId: null,
          stripePriceId: null,
        },
        archivedOld: {
          product: false,
          price: false,
        },
        ok: false,
        error: null,
      };

      try {
        if (dryRun) {
          console.log(
            `DRY RUN [${i + 1}/${variants.length}] ${item.sku} → would create Stripe product + price (${stripeProductName})`,
          );
          item.ok = true;
          results.totals.variantsSucceeded++;
          results.items.push(item);
          continue;
        }

        console.log(
          `APPLY [${i + 1}/${variants.length}] ${item.sku} → creating Stripe product + price...`,
        );

        const createdProduct = await stripeNew.products.create({
          name: stripeProductName,
          active: true,
          metadata: {
            productId: item.productId || "",
            variantId: item.variantId,
            variantName: item.variantName,
            sku: item.sku,
          },
        });

        const createdPrice = await stripeNew.prices.create({
          product: createdProduct.id,
          unit_amount: Math.round(Number(v.price) * 100),
          currency,
        });

        item.new.stripeProductId = createdProduct.id;
        item.new.stripePriceId = createdPrice.id;

        await Variant.updateOne(
          { _id: v._id },
          {
            $set: {
              stripeProductId: createdProduct.id,
              stripePriceId: createdPrice.id,
            },
          },
        );

        if (stripeOld) {
          if (oldStripeProductId) {
            try {
              await stripeOld.products.update(oldStripeProductId, {
                active: false,
              });
              item.archivedOld.product = true;
              results.totals.oldArchived++;
            } catch (e) {
              // keep going
              item.archivedOld.product = false;
              item.error = `Old product archive failed: ${e?.message || String(e)}`;
            }
          }

          if (oldStripePriceId) {
            try {
              await stripeOld.prices.update(oldStripePriceId, {
                active: false,
              });
              item.archivedOld.price = true;
              results.totals.oldArchived++;
            } catch (e) {
              // keep going
              item.archivedOld.price = false;
              item.error = [
                item.error,
                `Old price archive failed: ${e?.message || String(e)}`,
              ]
                .filter(Boolean)
                .join(" | ");
            }
          }
        }

        item.ok = true;
        results.totals.variantsSucceeded++;
        results.items.push(item);
      } catch (err) {
        item.ok = false;
        item.error = err?.message || String(err);
        results.totals.variantsFailed++;
        results.items.push(item);

        console.error(
          `❌ Failed [${i + 1}/${variants.length}] ${item.sku}: ${item.error}`,
        );
      }
    }

    results.finishedAt = new Date().toISOString();
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

    console.log("\n✅ Done");
    console.log(
      safeJson({
        report: outPath,
        totals: results.totals,
      }),
    );

    if (results.totals.variantsFailed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error("❌ recreateStripeProducts failed:", err?.message || err);
  process.exitCode = 1;
});
