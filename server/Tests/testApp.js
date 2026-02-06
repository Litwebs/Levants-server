const express = require("express");
const cookieParser = require("cookie-parser");

const authRoutes = require("../routes/auth.routes");
const accessRoutes = require("../routes/access.routes");
const businessInfoRoutes = require("../routes/businessInfo.routes");

const notFoundMiddleware = require("../middleware/notFound.middleware");
const errorMiddleware = require("../middleware/error.middleware");

const app = express();

app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/access", accessRoutes);
app.use("/api/business-info", businessInfoRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
