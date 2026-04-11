const { faker } = require("@faker-js/faker");

const { connectDb } = require("../config/db");
const Order = require("../models/order.model");
const Customer = require("../models/customer.model");
const ProductVariant = require("../models/variant.model");

const BRADFORD_BASE_LAT = 53.7938;
const BRADFORD_BASE_LNG = -1.7564;
const BRADFORD_STREETS = [
  "Manningham Lane",
  "Leeds Road",
  "Thornton Road",
  "Great Horton Road",
  "Otley Road",
  "Canal Road",
  "Wakefield Road",
  "Little Horton Lane",
  "Allerton Road",
  "Sticker Lane",
  "Toller Lane",
  "Sunbridge Road",
];

function parseArgs(argv) {
  const options = {
    start: 1,
    end: 8,
    perPostcode: 5,
    deliveryDate: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === "--start" && next) {
      options.start = Number(next);
      index += 1;
      continue;
    }

    if (current === "--end" && next) {
      options.end = Number(next);
      index += 1;
      continue;
    }

    if (current === "--per-postcode" && next) {
      options.perPostcode = Number(next);
      index += 1;
      continue;
    }

    if (current === "--delivery-date" && next) {
      options.deliveryDate = next;
      index += 1;
    }
  }

  if (!Number.isInteger(options.start) || options.start < 1) {
    throw new Error("--start must be an integer greater than or equal to 1");
  }

  if (!Number.isInteger(options.end) || options.end < options.start) {
    throw new Error(
      "--end must be an integer greater than or equal to --start",
    );
  }

  if (!Number.isInteger(options.perPostcode) || options.perPostcode < 1) {
    throw new Error(
      "--per-postcode must be an integer greater than or equal to 1",
    );
  }

  return options;
}

function buildDistrictCodes(start, end) {
  const districts = [];
  for (let district = start; district <= end; district += 1) {
    districts.push(`BD${district}`);
  }
  return districts;
}

function buildFullPostcode(outwardCode, sequence) {
  const inwardDigit = ((sequence % 9) + 1).toString();
  const inwardLetters = faker.string.alpha({ length: 2, casing: "upper" });
  return `${outwardCode} ${inwardDigit}${inwardLetters}`;
}

function buildBradfordLocation(outwardCode, sequence) {
  const districtNumber = Number(outwardCode.replace("BD", "")) || 1;
  const latOffset =
    (districtNumber - 9) * 0.006 + ((sequence % 5) - 2) * 0.0014;
  const lngOffset =
    ((districtNumber % 6) - 3) * 0.008 + ((sequence % 3) - 1) * 0.0018;

  return {
    lat: Number((BRADFORD_BASE_LAT + latOffset).toFixed(6)),
    lng: Number((BRADFORD_BASE_LNG + lngOffset).toFixed(6)),
  };
}

function buildDeliveryDate(value) {
  if (!value) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("--delivery-date must be a valid date string");
  }

  return parsed;
}

async function ensureCustomer(index, postcode) {
  const email = `bradford-seed-${Date.now()}-${index}@levants.test`;

  return Customer.create({
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email,
    phone: faker.helpers.fromRegExp("07[0-9]{9}"),
    isGuest: true,
    addresses: [
      {
        line1: `${faker.number.int({ min: 1, max: 180 })} ${faker.helpers.arrayElement(BRADFORD_STREETS)}`,
        line2: "",
        city: "Bradford",
        postcode,
        country: "United Kingdom",
        isDefault: true,
      },
    ],
    lastOrderAt: new Date(),
  });
}

async function pickSeedVariants(requiredOrderCount) {
  const variants = await ProductVariant.find({
    status: "active",
    stockQuantity: { $gt: 0 },
  })
    .sort({ stockQuantity: -1, createdAt: 1 })
    .lean(false);

  if (!variants.length) {
    throw new Error(
      "No active variants with stock were found. Run the product seed first.",
    );
  }

  const totalStock = variants.reduce(
    (sum, variant) => sum + Number(variant.stockQuantity || 0),
    0,
  );

  if (totalStock < requiredOrderCount) {
    throw new Error(
      `Not enough stock to create ${requiredOrderCount} orders. Available stock: ${totalStock}.`,
    );
  }

  return variants;
}

async function reserveVariant(variants) {
  const selected = variants.find(
    (variant) => Number(variant.stockQuantity || 0) > 0,
  );
  if (!selected) {
    throw new Error("Ran out of stock while generating orders.");
  }

  selected.stockQuantity -= 1;

  if (selected.stockQuantity === 0) {
    selected.inventoryAlerts.state = "out";
  } else if (selected.stockQuantity <= selected.lowStockAlert) {
    selected.inventoryAlerts.state = "low";
  } else {
    selected.inventoryAlerts.state = "ok";
  }

  await selected.save();
  return selected;
}

async function createBradfordOrders({ start, end, perPostcode, deliveryDate }) {
  const outwardCodes = buildDistrictCodes(start, end);
  const totalOrdersToCreate = outwardCodes.length * perPostcode;
  const variants = await pickSeedVariants(totalOrdersToCreate);
  const createdOrders = [];

  let sequence = 0;

  for (const outwardCode of outwardCodes) {
    for (let count = 0; count < perPostcode; count += 1) {
      sequence += 1;

      const postcode = buildFullPostcode(outwardCode, sequence);
      const customer = await ensureCustomer(sequence, postcode);
      const variant = await reserveVariant(variants);
      const quantity = 1;
      const subtotal = Number(variant.price) * quantity;

      const order = await Order.create({
        customer: customer._id,
        items: [
          {
            product: variant.product,
            variant: variant._id,
            name: variant.name,
            sku: variant.sku,
            price: Number(variant.price),
            quantity,
            subtotal,
          },
        ],
        currency: "GBP",
        subtotal,
        deliveryAddress: {
          line1: `${faker.number.int({ min: 1, max: 180 })} ${faker.helpers.arrayElement(BRADFORD_STREETS)}`,
          line2: "",
          city: "Bradford",
          postcode,
          country: "United Kingdom",
        },
        deliveryDate,
        customerInstructions: "Bradford seed order",
        location: buildBradfordLocation(outwardCode, sequence),
        deliveryFee: 0,
        total: subtotal,
        status: "paid",
        deliveryStatus: "ordered",
        reservationExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        paidAt: new Date(),
        metadata: {
          seedScript: "generateBradfordOrders",
          routingArea: outwardCode,
        },
      });

      createdOrders.push(order);
      console.log(`Created ${order.orderId} for ${postcode}`);
    }
  }

  return {
    outwardCodes,
    totalOrdersToCreate,
    createdOrders,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const deliveryDate = buildDeliveryDate(options.deliveryDate);

  await connectDb();

  const result = await createBradfordOrders({
    ...options,
    deliveryDate,
  });

  console.log(
    `Generated ${result.createdOrders.length} paid orders across ${result.outwardCodes.length} postcode areas (${result.outwardCodes[0]}-${result.outwardCodes[result.outwardCodes.length - 1]}), ${options.perPostcode} per postcode.`,
  );

  await Order.db.close();
}

main().catch(async (error) => {
  console.error("Failed to generate Bradford orders:", error);
  try {
    await Order.db.close();
  } catch {
    // ignore close failures during exit
  }
  process.exit(1);
});
