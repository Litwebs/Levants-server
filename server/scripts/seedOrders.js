const mongoose = require("mongoose");
const { faker } = require("@faker-js/faker");

const ProductVariant = require("../models/variant.model");
const Customer = require("../models/customer.model");
const Order = require("../models/order.model");

const MONGO_URI =
  "mongodb+srv://Admin:EnvDb_123@developmentenvironment.zbyi2i0.mongodb.net/LevantsEnvDB?appName=DevelopmentEnvironment";

// Bradford base coords
const BRADFORD_LAT = 53.795;
const BRADFORD_LNG = -1.759;

const bradfordPostcodes = [
  "BD1 1AA",
  "BD1 2BB",
  "BD2 3CC",
  "BD3 4DD",
  "BD4 5EE",
  "BD5 6FF",
  "BD6 7GG",
  "BD7 8HH",
  "BD8 9JJ",
  "BD9 1KK",
  "BD10 0LL",
  "BD11 1MM",
  "BD12 2NN",
  "BD13 3PP",
  "BD14 4QQ",
  "BD15 5RR",
  "BD16 6SS",
  "BD17 7TT",
  "BD18 8UU",
  "BD19 9VV",
];

const bradfordStreets = [
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
];

function generateBradfordAddress() {
  return {
    line1: `${faker.number.int({ min: 1, max: 200 })} ${
      bradfordStreets[Math.floor(Math.random() * bradfordStreets.length)]
    }`,
    city: "Bradford",
    postcode:
      bradfordPostcodes[Math.floor(Math.random() * bradfordPostcodes.length)],
    country: "United Kingdom",
  };
}

function generateBradfordLocation() {
  return {
    lat: BRADFORD_LAT + faker.number.float({ min: -0.02, max: 0.02 }),
    lng: BRADFORD_LNG + faker.number.float({ min: -0.02, max: 0.02 }),
  };
}

async function seedOrders() {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Connected to DB");

  const customers = await Customer.find();
  if (!customers.length) {
    throw new Error("No customers found");
  }

  const variants = await ProductVariant.find({
    status: "active",
    stockQuantity: { $gt: 0 },
  });

  if (!variants.length) {
    throw new Error("No variants with stock found");
  }

  for (let i = 0; i < 100; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)];

    const items = [];
    let orderSubtotal = 0;

    const itemCount = faker.number.int({ min: 1, max: 4 });
    const shuffled = faker.helpers.shuffle(variants);

    for (let j = 0; j < itemCount; j++) {
      const variant = shuffled[j];
      if (!variant) continue;

      const quantity = faker.number.int({ min: 1, max: 3 });
      if (variant.stockQuantity < quantity) continue;

      const itemSubtotal = variant.price * quantity;

      items.push({
        variant: variant._id,
        product: variant.product,
        name: variant.name,
        sku: variant.sku,
        price: variant.price,
        quantity,
        subtotal: itemSubtotal,
      });

      orderSubtotal += itemSubtotal;

      // reduce stock
      variant.stockQuantity -= quantity;

      if (variant.stockQuantity === 0) {
        variant.inventoryAlerts.state = "out";
      } else if (variant.stockQuantity <= variant.lowStockAlert) {
        variant.inventoryAlerts.state = "low";
      } else {
        variant.inventoryAlerts.state = "ok";
      }

      await variant.save();
    }

    if (!items.length) continue;

    const location = generateBradfordLocation();

    const reservationExpiresAt = new Date(
      Date.now() + 30 * 60 * 1000, // 30 minutes
    );

    const order = await Order.create({
      customer: customer._id,
      deliveryAddress: generateBradfordAddress(),
      location,
      items,
      subtotal: orderSubtotal,
      total: orderSubtotal,
      reservationExpiresAt,
      status: "paid",
      deliveryStatus: "ordered",
      paidAt: new Date(),
    });

    console.log(`✅ Order created: ${order._id}`);
  }

  console.log("🔥 100 paid orders seeded successfully");
  await mongoose.disconnect();
}

seedOrders().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
