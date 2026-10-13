const express = require("express");
const cookieParser = require("cookie-parser");
const app = express();
app.set("trust proxy", 1);
app.use("/api/admin/deals", express.json({ limit: "10mb" }), cookieParser(), require("../../../routes/deals.admin.routes"));
app.use("/api/deals", express.json({ limit: "10mb" }), cookieParser(), require("../../../routes/deals.public.routes"));
// Delegate all original routes (including the raw Stripe webhook) to UAT's app.
app.use(require("../../testApp"));
app.use(require("../../../middleware/error.middleware"));
module.exports = app;
