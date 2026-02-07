require("dotenv").config();

const express = require("express");
const cors = require("cors");

const prisRoutes = require("./routes/pris");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true, service: "pris-api" }));

// Frontend expects: /api/pris/search?q=...
app.use("/api/pris", prisRoutes);

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log("pris-api listening on port", port);
});
