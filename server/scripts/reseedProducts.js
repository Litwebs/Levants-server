/**
 * reseedProducts.js
 *
 * Deletes ALL existing products and variants, then seeds the canonical
 * product catalogue from the hardcoded data below.
 *
 * Usage (from the /server directory):
 *   node scripts/reseedProducts.js
 *
 * Requires MONGO_URI in .env (same as the rest of the project).
 */

require("dotenv").config();

const mongoose = require("mongoose");

const Product = require("../models/product.model");
const Variant = require("../models/variant.model");
const File = require("../models/file.model");

// ─── Seed Data ────────────────────────────────────────────────────────────────
// Taken directly from the API snapshot.  thumbnailImage objects are turned into
// File documents so the Product/Variant refs stay consistent with the schema.

const SEED = [
  {
    id: "6a0c9673a32c3ec6bc641d3c",
    name: "2 Litre Homogenised",
    slug: "2-litre-homogenised",
    category: "Milk",
    description: "Homogenized",
    allergens: ["Milk"],
    storageNotes: "Keep refrigerated below 4 degrees",
    thumbnailImage: {
      _id: "6a0c9673a32c3ec6bc641d3a",
      originalName: "95c096f2-65a0-4ce9-acc5-2be1b5bda672.jpg",
      filename: "litwebs/products/thumbnails/95c096f2-65a0-4ce9-acc5-2be1b5bda672_hbxffa",
      mimeType: "image/jpeg",
      sizeBytes: 214476,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779209842/litwebs/products/thumbnails/95c096f2-65a0-4ce9-acc5-2be1b5bda672_hbxffa.jpg",
      uploadedBy: "69b83495fccc70440f47fa8b",
    },
    variants: [
      {
        id: "6a0c96daa32c3ec6bc641d61",
        name: "2 Litre Homogenised Milk",
        price: 2.5,
        stockQuantity: 987,
        thumbnailImage: {
          _id: "6a0c96daa32c3ec6bc641d5f",
          originalName: "fc979293-3a01-4765-845e-ffceb7274769.jpg",
          filename: "litwebs/variants/thumbnails/fc979293-3a01-4765-845e-ffceb7274769_i0o1rt",
          mimeType: "image/jpeg",
          sizeBytes: 214476,
          url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779209945/litwebs/variants/thumbnails/fc979293-3a01-4765-845e-ffceb7274769_i0o1rt.jpg",
          uploadedBy: "69b83495fccc70440f47fa8b",
        },
      },
    ],
  },
  {
    id: "69c669f9fccc70440f4889c9",
    name: "Fresh Delicious Milkshakes",
    slug: "fresh-delicious-milkshakes",
    category: "Milkshakes",
    description:
      "Delicious farm fresh flavored milk made with whole milk and natural flavoring with NO additives or preservatives",
    allergens: ["Milk"],
    storageNotes: "Keep refrigerated below 4 degrees",
    thumbnailImage: {
      _id: "6a10c6476254ad743a00a230",
      originalName: "f94ec0b9-0c55-4301-9308-a102e0597f99.jpg",
      filename: "litwebs/products/thumbnails/f94ec0b9-0c55-4301-9308-a102e0597f99_jaleel",
      mimeType: "image/jpeg",
      sizeBytes: 213766,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484231/litwebs/products/thumbnails/f94ec0b9-0c55-4301-9308-a102e0597f99_jaleel.jpg",
      uploadedBy: "69b83495fccc70440f47fa8b",
    },
    variants: [
      {
        id: "69c66a3ffccc70440f4889f1",
        name: "Chocolate Milk (Pint)",
        price: 2,
        stockQuantity: 918,
        thumbnailImage: {
          _id: "6a10c65e6254ad743a00a251",
          originalName: "0031ae77-dd17-40a2-9e7c-f850badc3570.jpg",
          filename: "litwebs/variants/thumbnails/0031ae77-dd17-40a2-9e7c-f850badc3570_icck93",
          mimeType: "image/jpeg",
          sizeBytes: 213766,
          url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484253/litwebs/variants/thumbnails/0031ae77-dd17-40a2-9e7c-f850badc3570_icck93.jpg",
          uploadedBy: "69b83495fccc70440f47fa8b",
        },
      },
      {
        id: "69c66a6efccc70440f488a1d",
        name: "Strawberry Milk (Pint)",
        price: 2,
        stockQuantity: 937,
        thumbnailImage: {
          _id: "6a10c6706254ad743a00a282",
          originalName: "008680a9-94d9-4816-8fab-b787f86daae1.jpg",
          filename: "litwebs/variants/thumbnails/008680a9-94d9-4816-8fab-b787f86daae1_gahnwy",
          mimeType: "image/jpeg",
          sizeBytes: 193256,
          url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484272/litwebs/variants/thumbnails/008680a9-94d9-4816-8fab-b787f86daae1_gahnwy.jpg",
          uploadedBy: "69b83495fccc70440f47fa8b",
        },
      },
      {
        id: "69d45d15ecb4920f866fb96f",
        name: "Banana Milkshake",
        price: 2,
        stockQuantity: 966,
        thumbnailImage: {
          _id: "6a10c6876254ad743a00a2a2",
          originalName: "2d064a96-195c-4ab3-93a1-718568c0ae5d.jpg",
          filename: "litwebs/variants/thumbnails/2d064a96-195c-4ab3-93a1-718568c0ae5d_wrbhw7",
          mimeType: "image/jpeg",
          sizeBytes: 195533,
          url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484295/litwebs/variants/thumbnails/2d064a96-195c-4ab3-93a1-718568c0ae5d_wrbhw7.jpg",
          uploadedBy: "69b83495fccc70440f47fa8b",
        },
      },
    ],
  },
  {
    id: "69c5da14fccc70440f48807b",
    name: "Fruit Juices",
    slug: "fruit-juices",
    category: "Juices",
    description: "10 mouth watering flavours to choose from!",
    allergens: [],
    storageNotes: "",
    thumbnailImage: {
      _id: "69f7966d5425198cf06482a9",
      originalName: "e023919c-0929-4b21-ba36-74a06fe8ccfa.jpg",
      filename: "litwebs/products/thumbnails/e023919c-0929-4b21-ba36-74a06fe8ccfa_osxzne",
      mimeType: "image/jpeg",
      sizeBytes: 198548,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777833581/litwebs/products/thumbnails/e023919c-0929-4b21-ba36-74a06fe8ccfa_osxzne.jpg",
      uploadedBy: "69979a2c55b72b2d5dd15669",
    },
    variants: [
      { id: "69c5da3cfccc70440f488097", name: "Orange Juice (Pint)", price: 1.8, stockQuantity: 863, thumbnailImage: { _id: "69f796955425198cf06482f3", originalName: "c5a2987c-e2bd-4a5d-aa3a-8e94a1e3dbda.jpg", filename: "litwebs/variants/thumbnails/c5a2987c-e2bd-4a5d-aa3a-8e94a1e3dbda_zzp7tx", mimeType: "image/jpeg", sizeBytes: 181435, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777833620/litwebs/variants/thumbnails/c5a2987c-e2bd-4a5d-aa3a-8e94a1e3dbda_zzp7tx.jpg", uploadedBy: "69979a2c55b72b2d5dd15669" } },
      { id: "69c5da70fccc70440f4880b5", name: "Clear Apple Juice (Pint)", price: 1.8, stockQuantity: 977, thumbnailImage: { _id: "6a0df3a8a32c3ec6bc644f28", originalName: "c69619f6-88ca-4f74-8de2-ded2cf4fe708.jpg", filename: "litwebs/variants/thumbnails/c69619f6-88ca-4f74-8de2-ded2cf4fe708_ncafwf", mimeType: "image/jpeg", sizeBytes: 216027, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779299240/litwebs/variants/thumbnails/c69619f6-88ca-4f74-8de2-ded2cf4fe708_ncafwf.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
      { id: "69c5da9cfccc70440f4880cf", name: "Cloudy Apple Juice (Pint)", price: 1.8, stockQuantity: 983, thumbnailImage: { _id: "69f798a65425198cf06487cb", originalName: "6e05388b-dedb-4888-950d-40899b625a86.jpg", filename: "litwebs/variants/thumbnails/6e05388b-dedb-4888-950d-40899b625a86_ophzmd", mimeType: "image/jpeg", sizeBytes: 213770, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777834149/litwebs/variants/thumbnails/6e05388b-dedb-4888-950d-40899b625a86_ophzmd.jpg", uploadedBy: "69979a2c55b72b2d5dd15669" } },
      { id: "69c5dae5fccc70440f4880e9", name: "Cloudy Lemonade Juice (Pint)", price: 1.8, stockQuantity: 955, thumbnailImage: { _id: "69f7967f5425198cf06482cb", originalName: "efee420d-0426-4dd1-8928-7d9ce8006a5f.jpg", filename: "litwebs/variants/thumbnails/efee420d-0426-4dd1-8928-7d9ce8006a5f_d0cbvr", mimeType: "image/jpeg", sizeBytes: 260706, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777833599/litwebs/variants/thumbnails/efee420d-0426-4dd1-8928-7d9ce8006a5f_d0cbvr.jpg", uploadedBy: "69979a2c55b72b2d5dd15669" } },
      { id: "69c5db13fccc70440f488103", name: "Apple & Mango Juice (Pint)", price: 1.8, stockQuantity: 975, thumbnailImage: { _id: "6a0df3eba32c3ec6bc644f60", originalName: "0db59026-6798-410e-8ea0-25f34918d899.jpg", filename: "litwebs/variants/thumbnails/0db59026-6798-410e-8ea0-25f34918d899_xhq67j", mimeType: "image/jpeg", sizeBytes: 202155, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779299306/litwebs/variants/thumbnails/0db59026-6798-410e-8ea0-25f34918d899_xhq67j.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
      { id: "69c5db41fccc70440f48811d", name: "Cranberry Juice (Pint)", price: 1.8, stockQuantity: 908, thumbnailImage: { _id: "69f796ba5425198cf0648372", originalName: "5b7f098a-4a2d-4058-839c-692c607708e2.jpg", filename: "litwebs/variants/thumbnails/5b7f098a-4a2d-4058-839c-692c607708e2_lk5b0y", mimeType: "image/jpeg", sizeBytes: 206742, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777833657/litwebs/variants/thumbnails/5b7f098a-4a2d-4058-839c-692c607708e2_lk5b0y.jpg", uploadedBy: "69979a2c55b72b2d5dd15669" } },
      { id: "69c5dbccfccc70440f48813d", name: "Pineapple Juice (Pint)", price: 1.8, stockQuantity: 971, thumbnailImage: { _id: "6a0df443a32c3ec6bc644fa0", originalName: "821b59ea-9114-4fe2-b2ec-ecfaaba70f55.jpg", filename: "litwebs/variants/thumbnails/821b59ea-9114-4fe2-b2ec-ecfaaba70f55_f8yrae", mimeType: "image/jpeg", sizeBytes: 190931, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779299394/litwebs/variants/thumbnails/821b59ea-9114-4fe2-b2ec-ecfaaba70f55_f8yrae.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
      { id: "69c5dc07fccc70440f488157", name: "Tropical Juice (Pint)", price: 1.8, stockQuantity: 988, thumbnailImage: { _id: "6a0df498a32c3ec6bc644feb", originalName: "c1e26778-32f7-468f-a368-75a27f1c1b2b.jpg", filename: "litwebs/variants/thumbnails/c1e26778-32f7-468f-a368-75a27f1c1b2b_k6u5x2", mimeType: "image/jpeg", sizeBytes: 192504, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779299479/litwebs/variants/thumbnails/c1e26778-32f7-468f-a368-75a27f1c1b2b_k6u5x2.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
      { id: "69c5dc41fccc70440f488171", name: "Grapefruit Juice (Pint)", price: 1.8, stockQuantity: 991, thumbnailImage: { _id: "69f798d95425198cf064881a", originalName: "3748d26e-e6ee-4333-8c33-f36ef7f9b5c9.jpg", filename: "litwebs/variants/thumbnails/3748d26e-e6ee-4333-8c33-f36ef7f9b5c9_lhvjlf", mimeType: "image/jpeg", sizeBytes: 241642, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777834200/litwebs/variants/thumbnails/3748d26e-e6ee-4333-8c33-f36ef7f9b5c9_lhvjlf.jpg", uploadedBy: "69979a2c55b72b2d5dd15669" } },
      { id: "69c5dc71fccc70440f48818b", name: "Peach Ice Tea Juice (Pint)", price: 1.8, stockQuantity: 973, thumbnailImage: { _id: "6a0df4c3a32c3ec6bc645021", originalName: "7c83f018-a28a-4b05-9a31-6c730cfa21cd.jpg", filename: "litwebs/variants/thumbnails/7c83f018-a28a-4b05-9a31-6c730cfa21cd_c3up5a", mimeType: "image/jpeg", sizeBytes: 182600, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779299522/litwebs/variants/thumbnails/7c83f018-a28a-4b05-9a31-6c730cfa21cd_c3up5a.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
    ],
  },
  {
    id: "69c5d917fccc70440f487fef",
    name: "Freshly Baked Bread",
    slug: "freshly-baked-bread",
    category: "Bakery",
    description: "Freshly Baked Artisan Bread",
    allergens: ["Made in a bakery that uses eggs", "milk", "nuts", "sesame and soya"],
    storageNotes: "",
    thumbnailImage: {
      _id: "69f792555425198cf0647a34",
      originalName: "3e38a935-ab6e-4805-bfd7-af8de57d24a8.jpg",
      filename: "litwebs/products/thumbnails/3e38a935-ab6e-4805-bfd7-af8de57d24a8_xil80b",
      mimeType: "image/jpeg",
      sizeBytes: 157678,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777832533/litwebs/products/thumbnails/3e38a935-ab6e-4805-bfd7-af8de57d24a8_xil80b.jpg",
      uploadedBy: "69979a2c55b72b2d5dd15669",
    },
    variants: [
      { id: "69c5d953fccc70440f48800d", name: "Sourdough (Sliced) 400g", price: 2.7, stockQuantity: 12, thumbnailImage: { _id: "69f797265425198cf0648491", originalName: "6ac69cfe-236f-49e3-9426-4c64ba38540d.jpeg", filename: "litwebs/variants/thumbnails/6ac69cfe-236f-49e3-9426-4c64ba38540d_vkv55n", mimeType: "image/jpeg", sizeBytes: 40207, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777833765/litwebs/variants/thumbnails/6ac69cfe-236f-49e3-9426-4c64ba38540d_vkv55n.jpg", uploadedBy: "69979a2c55b72b2d5dd15669" } },
      { id: "69c5d984fccc70440f488027", name: "Farmhouse White (Sliced) 400g", price: 2.5, stockQuantity: 4, thumbnailImage: { _id: "69f7973f5425198cf06484b5", originalName: "fd3a8ded-3df2-4ec4-a5a2-abdba395d0f3.jpg", filename: "litwebs/variants/thumbnails/fd3a8ded-3df2-4ec4-a5a2-abdba395d0f3_zrqyf0", mimeType: "image/jpeg", sizeBytes: 159945, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777833790/litwebs/variants/thumbnails/fd3a8ded-3df2-4ec4-a5a2-abdba395d0f3_zrqyf0.jpg", uploadedBy: "69979a2c55b72b2d5dd15669" } },
      { id: "69c5d999fccc70440f48803f", name: "Farmhouse Brown (Sliced) 400g", price: 2.5, stockQuantity: 3, thumbnailImage: { _id: "69f7971a5425198cf0648471", originalName: "8d7e3a6f-367a-4e78-9e6e-9790a89ffc13.jpg", filename: "litwebs/variants/thumbnails/8d7e3a6f-367a-4e78-9e6e-9790a89ffc13_hlghpr", mimeType: "image/jpeg", sizeBytes: 159945, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777833754/litwebs/variants/thumbnails/8d7e3a6f-367a-4e78-9e6e-9790a89ffc13_hlghpr.jpg", uploadedBy: "69979a2c55b72b2d5dd15669" } },
    ],
  },
  {
    id: "69c5d87bfccc70440f487fae",
    name: "Raw Yorkshire Honey (230g)",
    slug: "raw-yorkshire-honey-230g",
    category: "Honey",
    description: "100% raw unprocessed cold extracted artisanal Yorkshire honey.",
    allergens: [],
    storageNotes: "",
    thumbnailImage: {
      _id: "69f792815425198cf0647a89",
      originalName: "c68a4395-e72f-4b42-b039-6cab6cb2d459.jpg",
      filename: "litwebs/products/thumbnails/c68a4395-e72f-4b42-b039-6cab6cb2d459_ztlekn",
      mimeType: "image/jpeg",
      sizeBytes: 91690,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777832577/litwebs/products/thumbnails/c68a4395-e72f-4b42-b039-6cab6cb2d459_ztlekn.jpg",
      uploadedBy: "69979a2c55b72b2d5dd15669",
    },
    variants: [
      { id: "69c5d89afccc70440f487fca", name: "Raw Yorkshire Honey (230g)", price: 6, stockQuantity: 69, thumbnailImage: { _id: "69f797f25425198cf0648649", originalName: "b2a9b17a-0b48-43d6-9699-b87b824a0b6c.jpg", filename: "litwebs/variants/thumbnails/b2a9b17a-0b48-43d6-9699-b87b824a0b6c_ponglc", mimeType: "image/jpeg", sizeBytes: 193959, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777833970/litwebs/variants/thumbnails/b2a9b17a-0b48-43d6-9699-b87b824a0b6c_ponglc.jpg", uploadedBy: "69979a2c55b72b2d5dd15669" } },
    ],
  },
  {
    id: "69c5d7c0fccc70440f487f6b",
    name: "100% Pure Grass Fed Clarified Butter Ghee (500g)",
    slug: "100percent-pure-grass-fed-clarified-butter-ghee-500g",
    category: "Ghee",
    description:
      "Yorkshire grass fed free range pure clarified butter ghee. Sourced from happy grass fed free range cows right here in Yorkshire, this ghee is pure, rich and boast a wonderfully nutty aroma, perfect for enhancing any dish.",
    allergens: ["Milk"],
    storageNotes: "",
    thumbnailImage: {
      _id: "69f792b15425198cf0647b46",
      originalName: "5f48772d-64b4-4b91-9216-29fe4fcb87c7.jpeg",
      filename: "litwebs/products/thumbnails/5f48772d-64b4-4b91-9216-29fe4fcb87c7_tuh8jd",
      mimeType: "image/jpeg",
      sizeBytes: 109111,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777832625/litwebs/products/thumbnails/5f48772d-64b4-4b91-9216-29fe4fcb87c7_tuh8jd.jpg",
      uploadedBy: "69979a2c55b72b2d5dd15669",
    },
    variants: [
      { id: "69c5d7d8fccc70440f487f8b", name: "500g", price: 14, stockQuantity: 14, thumbnailImage: { _id: "69f798275425198cf06486a6", originalName: "7defcbf8-4af6-4d62-9753-7822b783e597.jpeg", filename: "litwebs/variants/thumbnails/7defcbf8-4af6-4d62-9753-7822b783e597_zr2hai", mimeType: "image/jpeg", sizeBytes: 116707, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777834022/litwebs/variants/thumbnails/7defcbf8-4af6-4d62-9753-7822b783e597_zr2hai.jpg", uploadedBy: "69979a2c55b72b2d5dd15669" } },
    ],
  },
  {
    id: "69c5d6a6fccc70440f487f28",
    name: "Yorkshire Halloumi Cheese (220g)",
    slug: "yorkshire-halloumi-cheese-220g",
    category: "Cheese",
    description:
      'Yorkshire artisan halloumi "squeaky" cheese. This delightful cheese is crafted right here in Yorkshire, offering that signature satisfying squeak and a perfectly salty, grilled flavour that you\'ll absolutely love.',
    allergens: ["Milk"],
    storageNotes: "Keep Refrigerated",
    thumbnailImage: {
      _id: "69f792c15425198cf0647b5d",
      originalName: "1c28ecda-2c2e-4502-947b-dedaee5a2e2d.jpg",
      filename: "litwebs/products/thumbnails/1c28ecda-2c2e-4502-947b-dedaee5a2e2d_nk91aa",
      mimeType: "image/jpeg",
      sizeBytes: 63566,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777832640/litwebs/products/thumbnails/1c28ecda-2c2e-4502-947b-dedaee5a2e2d_nk91aa.jpg",
      uploadedBy: "69979a2c55b72b2d5dd15669",
    },
    variants: [
      { id: "69c5d6c4fccc70440f487f44", name: "Yorkshire Halloumi Cheese (220g)", price: 4.5, stockQuantity: 14, thumbnailImage: { _id: "69f794a35425198cf0647e11", originalName: "01fd93fa-2686-45da-b049-3faff847f813.jpg", filename: "litwebs/variants/thumbnails/01fd93fa-2686-45da-b049-3faff847f813_xkpvts", mimeType: "image/jpeg", sizeBytes: 63557, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777833123/litwebs/variants/thumbnails/01fd93fa-2686-45da-b049-3faff847f813_xkpvts.jpg", uploadedBy: "69979a2c55b72b2d5dd15669" } },
    ],
  },
  {
    id: "69c5d596fccc70440f487ed2",
    name: "Red Leicester Cheese (200g)",
    slug: "red-leicester-cheese-200g",
    category: "Cheese",
    description:
      "A distinctive and mellow, yummy colored cheese. Perfect for cooking or sandwiches to give it a lovely cheese flavor and melts beautifully! The perfect toast topping!",
    allergens: ["Milk"],
    storageNotes: "Keep refrigerated",
    thumbnailImage: {
      _id: "6a10c5d86254ad743a00a1c8",
      originalName: "fe0b43e4-678d-4473-a345-a6860419c560.jpg",
      filename: "litwebs/products/thumbnails/fe0b43e4-678d-4473-a345-a6860419c560_veyhkc",
      mimeType: "image/jpeg",
      sizeBytes: 202686,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484120/litwebs/products/thumbnails/fe0b43e4-678d-4473-a345-a6860419c560_veyhkc.jpg",
      uploadedBy: "69b83495fccc70440f47fa8b",
    },
    variants: [
      { id: "69c5d5c7fccc70440f487efe", name: "Red Leicester Cheese (200g)", price: 3.2, stockQuantity: 20, thumbnailImage: { _id: "6a10c5eb6254ad743a00a1ef", originalName: "96ba68ad-926c-43e3-9508-d37666339df0.jpg", filename: "litwebs/variants/thumbnails/96ba68ad-926c-43e3-9508-d37666339df0_oavpiy", mimeType: "image/jpeg", sizeBytes: 202686, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484139/litwebs/variants/thumbnails/96ba68ad-926c-43e3-9508-d37666339df0_oavpiy.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
    ],
  },
  {
    id: "69c5d489fccc70440f487e8b",
    name: "Mature Cheddar Cheese (200g)",
    slug: "mature-cheddar-cheese-200g",
    category: "Cheese",
    description:
      "A rich firm and tasty classic cheese. Matured for unto 12 months. you can use it for absolutely everything.",
    allergens: ["Milk"],
    storageNotes: "Keep refrigerated",
    thumbnailImage: {
      _id: "6a10c5a06254ad743a00a16d",
      originalName: "6629a598-eeff-4693-80d6-4bf7d75043f3.jpg",
      filename: "litwebs/products/thumbnails/6629a598-eeff-4693-80d6-4bf7d75043f3_qlcj1s",
      mimeType: "image/jpeg",
      sizeBytes: 223576,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484063/litwebs/products/thumbnails/6629a598-eeff-4693-80d6-4bf7d75043f3_qlcj1s.jpg",
      uploadedBy: "69b83495fccc70440f47fa8b",
    },
    variants: [
      { id: "69c5d4b9fccc70440f487ead", name: "Mature Cheddar Cheese (200g)", price: 3.1, stockQuantity: 20, thumbnailImage: { _id: "6a10c5bb6254ad743a00a19d", originalName: "86fb5b1f-b501-4565-826d-e09ccacac097.jpg", filename: "litwebs/variants/thumbnails/86fb5b1f-b501-4565-826d-e09ccacac097_c02vzi", mimeType: "image/jpeg", sizeBytes: 223576, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484090/litwebs/variants/thumbnails/86fb5b1f-b501-4565-826d-e09ccacac097_c02vzi.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
    ],
  },
  {
    id: "69c5d2f7fccc70440f487e29",
    name: "Farmhouse Butter 200g",
    slug: "farmhouse-butter-200g",
    category: "Butter",
    description:
      "Fresh hand churned farmhouse grass fed butter made simply with 2 whole ingredients. (Cream & Salt)",
    allergens: ["Milk"],
    storageNotes: "",
    thumbnailImage: {
      _id: "6a10c5616254ad743a00a121",
      originalName: "d37d81a9-3b4a-4aeb-898d-64476fa20350.jpg",
      filename: "litwebs/products/thumbnails/d37d81a9-3b4a-4aeb-898d-64476fa20350_tbymdy",
      mimeType: "image/jpeg",
      sizeBytes: 223607,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484000/litwebs/products/thumbnails/d37d81a9-3b4a-4aeb-898d-64476fa20350_tbymdy.jpg",
      uploadedBy: "69b83495fccc70440f47fa8b",
    },
    variants: [
      { id: "69c5d328fccc70440f487e46", name: "Farmhouse Butter 200g", price: 3.4, stockQuantity: 817, thumbnailImage: { _id: "6a10c5756254ad743a00a147", originalName: "c684dd42-4442-4bd7-938f-237d5cb2eceb.jpg", filename: "litwebs/variants/thumbnails/c684dd42-4442-4bd7-938f-237d5cb2eceb_tts3yi", mimeType: "image/jpeg", sizeBytes: 223607, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484020/litwebs/variants/thumbnails/c684dd42-4442-4bd7-938f-237d5cb2eceb_tts3yi.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
    ],
  },
  {
    id: "69c5b08afccc70440f487b9b",
    name: "Free Range Eggs (Large)",
    slug: "free-range-eggs-large",
    category: "Eggs",
    description:
      "We Deliver free-range eggs laid by the happiest hens roaming freely both indoor and outdoor under natural conditions",
    allergens: [],
    storageNotes: "",
    thumbnailImage: {
      _id: "69f7930b5425198cf0647c6f",
      originalName: "72e60568-b454-46a6-95ff-0179fbfa1233.jpg",
      filename: "litwebs/products/thumbnails/72e60568-b454-46a6-95ff-0179fbfa1233_gnuins",
      mimeType: "image/jpeg",
      sizeBytes: 37515,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777832714/litwebs/products/thumbnails/72e60568-b454-46a6-95ff-0179fbfa1233_gnuins.jpg",
      uploadedBy: "69979a2c55b72b2d5dd15669",
    },
    variants: [
      { id: "69c5b0c0fccc70440f487bb8", name: "30 Tray", price: 8.5, stockQuantity: 533, thumbnailImage: { _id: "69f8d7c58007a54a411b8155", originalName: "40434656-c3ac-4ddf-b917-9f684aa164d2.jpg", filename: "litwebs/variants/thumbnails/40434656-c3ac-4ddf-b917-9f684aa164d2_zhnqvo", mimeType: "image/jpeg", sizeBytes: 50889, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1777915845/litwebs/variants/thumbnails/40434656-c3ac-4ddf-b917-9f684aa164d2_zhnqvo.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
      { id: "69c5b0effccc70440f487bd2", name: "12 Pack", price: 4, stockQuantity: 940, thumbnailImage: { _id: "6a10c7bf6254ad743a00a331", originalName: "9c149a6d-5aba-4a37-814b-0744b0aa43c8.jpg", filename: "litwebs/variants/thumbnails/9c149a6d-5aba-4a37-814b-0744b0aa43c8_os0knw", mimeType: "image/jpeg", sizeBytes: 315452, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484606/litwebs/variants/thumbnails/9c149a6d-5aba-4a37-814b-0744b0aa43c8_os0knw.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
      { id: "69c5b10efccc70440f487bea", name: "6 Pack", price: 2.3, stockQuantity: 983, thumbnailImage: { _id: "6a10c7d46254ad743a00a361", originalName: "d50daae3-c885-44a5-a331-acf80073df62.jpg", filename: "litwebs/variants/thumbnails/d50daae3-c885-44a5-a331-acf80073df62_nxnfod", mimeType: "image/jpeg", sizeBytes: 315452, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779484627/litwebs/variants/thumbnails/d50daae3-c885-44a5-a331-acf80073df62_nxnfod.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
    ],
  },
  {
    id: "69b865c4fccc70440f47fd74",
    name: "Farm Fresh Unhomogenised Milk",
    slug: "farm-fresh-unhomogenised-milk",
    category: "Milk",
    description: "Farm fresh UNHOMOGENISED full fat milk from grass fed free roaming cows.",
    allergens: ["Milk"],
    storageNotes: "Keep refrigerated below 4 degrees",
    thumbnailImage: {
      _id: "6a10c4386254ad743a00a026",
      originalName: "cdf41800-0190-4150-b99c-a232f2d4213d.jpg",
      filename: "litwebs/products/thumbnails/cdf41800-0190-4150-b99c-a232f2d4213d_oxhsjf",
      mimeType: "image/jpeg",
      sizeBytes: 173138,
      url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779483704/litwebs/products/thumbnails/cdf41800-0190-4150-b99c-a232f2d4213d_oxhsjf.jpg",
      uploadedBy: "69b83495fccc70440f47fa8b",
    },
    variants: [
      { id: "69c5a241fccc70440f487603", name: "2 Litre Milk", price: 2.5, stockQuantity: 9999, thumbnailImage: { _id: "6a10c4186254ad743a009fe3", originalName: "ed77741e-318c-4a18-9195-ccef4987411b.jpg", filename: "litwebs/variants/thumbnails/ed77741e-318c-4a18-9195-ccef4987411b_k9qqpm", mimeType: "image/jpeg", sizeBytes: 173138, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779483671/litwebs/variants/thumbnails/ed77741e-318c-4a18-9195-ccef4987411b_k9qqpm.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
      { id: "69c5a946fccc70440f487895", name: "Glass Pint", price: 1.2, stockQuantity: 826, thumbnailImage: { _id: "6a10c4036254ad743a009fad", originalName: "d8c91dc9-46e8-4968-b179-0b29782593a6.jpg", filename: "litwebs/variants/thumbnails/d8c91dc9-46e8-4968-b179-0b29782593a6_jokmnm", mimeType: "image/jpeg", sizeBytes: 207514, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779483650/litwebs/variants/thumbnails/d8c91dc9-46e8-4968-b179-0b29782593a6_jokmnm.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
      { id: "69c5a976fccc70440f4878b6", name: "Plastic Pint", price: 1.2, stockQuantity: 944, thumbnailImage: { _id: "6a10c3ed6254ad743a009f82", originalName: "7753f2d0-7dc9-49dc-8246-bebee2b4175d.jpg", filename: "litwebs/variants/thumbnails/7753f2d0-7dc9-49dc-8246-bebee2b4175d_wr5wxo", mimeType: "image/jpeg", sizeBytes: 199541, url: "https://res.cloudinary.com/deonzcviy/image/upload/v1779483629/litwebs/variants/thumbnails/7753f2d0-7dc9-49dc-8246-bebee2b4175d_wr5wxo.jpg", uploadedBy: "69b83495fccc70440f47fa8b" } },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Upsert a File document using its known _id so the Product/Variant
 * thumbnailImage ref stays stable across re-seeds.
 */
async function upsertFile(fileData) {
  if (!fileData) return null;
  const id = new mongoose.Types.ObjectId(fileData._id);
  await File.findByIdAndUpdate(
    id,
    {
      originalName: fileData.originalName,
      filename: fileData.filename,
      mimeType: fileData.mimeType,
      sizeBytes: fileData.sizeBytes,
      url: fileData.url,
      uploadedBy: new mongoose.Types.ObjectId(fileData.uploadedBy),
    },
    { upsert: true, new: true },
  );
  return id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI not set in .env");

  console.log("Connecting to MongoDB…");
  await mongoose.connect(uri);
  console.log("Connected.\n");

  // 1. Delete all existing variants and products
  const deletedVariants = await Variant.deleteMany({});
  console.log(`Deleted ${deletedVariants.deletedCount} variant(s).`);

  const deletedProducts = await Product.deleteMany({});
  console.log(`Deleted ${deletedProducts.deletedCount} product(s).\n`);

  // 2. Seed
  let productCount = 0;
  let variantCount = 0;

  for (const p of SEED) {
    // Upsert product thumbnail File
    const thumbFileId = await upsertFile(p.thumbnailImage);

    // Upsert the Product with its canonical _id
    const productId = new mongoose.Types.ObjectId(p.id);
    await Product.findByIdAndUpdate(
      productId,
      {
        name: p.name,
        slug: p.slug,
        category: p.category,
        description: p.description,
        allergens: p.allergens,
        storageNotes: p.storageNotes || "",
        thumbnailImage: thumbFileId,
        galleryImages: [],
        status: "active",
      },
      { upsert: true, new: true },
    );
    productCount++;

    // Upsert each variant
    for (let i = 0; i < p.variants.length; i++) {
      const v = p.variants[i];
      const variantThumbFileId = await upsertFile(v.thumbnailImage);
      const variantId = new mongoose.Types.ObjectId(v.id);
      const sku = `${p.slug}-v${i + 1}`;

      await Variant.findByIdAndUpdate(
        variantId,
        {
          product: productId,
          name: v.name,
          sku,
          price: v.price,
          stockQuantity: v.stockQuantity,
          reservedQuantity: 0,
          status: "active",
          thumbnailImage: variantThumbFileId,
        },
        { upsert: true, new: true },
      );
      variantCount++;
    }

    console.log(`  ✓ ${p.name} (${p.variants.length} variant(s))`);
  }

  console.log(`\nDone. Seeded ${productCount} product(s) and ${variantCount} variant(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
