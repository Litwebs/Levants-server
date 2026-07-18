// scripts/seedReviews.js
// Seeds 100 realistic reviews into the DB. Safe to re-run (clears existing
// review seed data first using the SEED marker on orderId).
//
// Usage:
//   node scripts/seedReviews.js
//
// Requires MONGO_URI in server/.env (loaded automatically via config/env.js).

require("dotenv").config();

const mongoose = require("mongoose");
const { mongoUri } = require("../config/env");
const Review = require("../models/review.model");

// ── Images ────────────────────────────────────────────────────────────────────
const IMAGES = [
  {
    url: "https://res.cloudinary.com/deonzcviy/image/upload/v1780238981/levants/reviews/545d6558-d1d7-4320-bc93-4328ebc449de_jodudb.jpg",
    publicId: "levants/reviews/545d6558-d1d7-4320-bc93-4328ebc449de_jodudb",
  },
  {
    url: "https://res.cloudinary.com/deonzcviy/image/upload/v1780238729/levants/reviews/6e24b532-5043-42ae-b518-4d8164ad268f_ffoylz.jpg",
    publicId: "levants/reviews/6e24b532-5043-42ae-b518-4d8164ad268f_ffoylz",
  },
  {
    url: "https://res.cloudinary.com/deonzcviy/image/upload/v1780238530/levants/reviews/f6e4e223-e2d8-4175-a767-78bb73a89e9a_kxxjvi.jpg",
    publicId: "levants/reviews/f6e4e223-e2d8-4175-a767-78bb73a89e9a_kxxjvi",
  },
];

// ── Review copy ───────────────────────────────────────────────────────────────
const NAMES = [
  "Sarah Mitchell",
  "James O'Brien",
  "Priya Sharma",
  "Tom Greenwood",
  "Fatima Al-Hassan",
  "Emma Clarke",
  "Liam Patel",
  "Charlotte Hughes",
  "Mohammed Akhtar",
  "Grace Thompson",
  "Oliver Bennett",
  "Amelia Foster",
  "Noah Williams",
  "Isla Robinson",
  "Harry Davies",
  "Sophia Johnson",
  "Jack Wilson",
  "Lily Anderson",
  "Ethan Brown",
  "Mia Taylor",
];

const DESCRIPTIONS = [
  "Absolutely love the fresh milk delivery — it tastes so much better than anything from the supermarket. The bottle was cold and perfectly sealed.",
  "Great service as always. The eggs were beautifully packaged and every single one was intact. Will definitely be ordering again next week.",
  "The butter is incredible — creamy, rich, and you can really taste the quality. My family noticed the difference straight away.",
  "Delivery arrived right on time and everything was fresh. The milk is noticeably creamier than what we used to buy. Highly recommend.",
  "Fantastic local produce. Love knowing exactly where my food comes from. The cheese selection this week was exceptional.",
  "Really impressed with the packaging — everything stayed cold and nothing was damaged. The honey is a new favourite in our house.",
  "Best milk I've tasted in years. Makes such a difference in morning coffee. Keep up the great work!",
  "The whole family is now hooked on Levants dairy. Fresh, local and sustainably produced. Couldn't ask for more.",
  "Delivery was smooth and the produce was outstanding. The yoghurt in particular was thick and fresh — nothing like the shop-bought stuff.",
  "Wonderful experience from start to finish. The ordering process was simple and the delivery was prompt. The milk is superb.",
  "We switched from a supermarket delivery and haven't looked back. The difference in quality is remarkable — especially the cream.",
  "Lovely fresh produce and friendly service. The kids especially love the chocolate milk. Highly recommended to everyone in the area.",
  "Ordered for the first time last week and I'm already a convert. The milk is so fresh it barely lasts two days — it gets drunk too quickly!",
  "The eggs were beautiful — proper golden yolks and so flavourful. You can tell these are from well-looked-after hens.",
  "My elderly mum is on a dairy-heavy diet and this has made such a difference to her meals. Quality you can really taste.",
  "Great value for genuinely fresh, local dairy. The double cream alone is worth the subscription. Absolutely delicious.",
  "Solid product, solid delivery. No issues whatsoever. The full-fat milk is a revelation compared to the watery stuff in shops.",
  "Ordered as a gift for a friend and they were thrilled. Beautiful presentation and incredibly fresh. Will be ordering for myself too.",
  "I bake a lot and the quality of the butter here is miles ahead of supermarket brands. Everything turns out better with it.",
  "Five stars every single time. Consistent quality, reliable delivery, and genuinely the best dairy produce I've found in Bradford.",
  "Really pleased with my first order. The milk arrived cold and tasted amazing — much richer than I expected.",
  "Superb quality and the delivery driver was really friendly. Will absolutely be a regular customer from now on.",
  "The cheese was a highlight this week — sharp, creamy and clearly well-aged. Paired perfectly with the fresh bread I made.",
  "Can't believe I was buying supermarket milk for so long. This is on a completely different level. Fresher and tastier in every way.",
  "Ordered after seeing a recommendation online and I'm so glad I did. Everything was exactly as described and then some.",
  "The cream is so thick you almost have to spoon it out. Absolutely divine on scones. Thank you Levants!",
  "Great portion sizes and very competitive pricing for the quality on offer. Delivery was also super fast.",
  "Milk, butter and eggs all in one delivery — so convenient and all of exceptional quality. Really simplifies the weekly shop.",
  "We're a big family and go through a lot of milk. Levants has made it so easy to keep stocked up with genuinely great dairy.",
  "The natural yoghurt is my new breakfast staple. Thick, tangy and incredibly fresh. Pairs beautifully with local honey.",
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const weightedRating = () => {
  // Realistic distribution: mostly 4–5 stars
  const rand = Math.random();
  if (rand < 0.5) return 5;
  if (rand < 0.8) return 4;
  if (rand < 0.92) return 3;
  if (rand < 0.97) return 2;
  return 1;
};

const randomDate = (daysBack = 180) => {
  const now = Date.now();
  const offset = Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000);
  return new Date(now - offset);
};

const padded = (n) => String(n).padStart(4, "0");

// ── Seed ──────────────────────────────────────────────────────────────────────
async function seed() {
  if (!mongoUri) throw new Error("MONGO_URI is not set in your .env");

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  // Remove any previously seeded reviews (identified by SEED- prefix)
  const deleted = await Review.deleteMany({ orderId: /^SEED-/ });
  if (deleted.deletedCount > 0) {
    console.log(`Removed ${deleted.deletedCount} existing seed review(s)`);
  }

  const reviews = [];

  for (let i = 1; i <= 100; i++) {
    // ~60 % of reviews get an image
    const addImage = Math.random() < 0.6;
    const image = addImage ? pick(IMAGES) : null;

    const createdAt = randomDate(365);

    reviews.push({
      orderId: `SEED-ORD-${padded(i)}`,
      customerName: pick(NAMES),
      description: pick(DESCRIPTIONS),
      rating: weightedRating(),
      imageUrl: image ? image.url : null,
      imagePublicId: image ? image.publicId : null,
      isVisible: true,
      createdAt,
      updatedAt: createdAt,
    });
  }

  await Review.insertMany(reviews);
  console.log(`✅ Seeded ${reviews.length} reviews`);

  await mongoose.disconnect();
  console.log("Done.");
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
