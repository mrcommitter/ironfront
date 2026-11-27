import express from "express";
import fs from "fs";
import path from "path";
import { accountRouter } from "./routes/AccountRoutes";

const app = express();
app.use(express.json());

app.get("/api/news.json", (_req, res) => {
  const newsPath = path.resolve(process.cwd(), "resources/news.json");
  if (fs.existsSync(newsPath)) {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.sendFile(newsPath);
  }
  return res.json([]);
});

app.get("/api/cosmetics.json", (_req, res) => {
  const cosmeticsPath = path.resolve(process.cwd(), "resources/cosmetics.json");
  if (fs.existsSync(cosmeticsPath)) {
    res.setHeader("Cache-Control", "public, max-age=60");
    return res.sendFile(cosmeticsPath);
  }
  return res.json({ patterns: {}, flags: {}, crowns: {}, effects: {} });
});

app.get("/api/cluster.json", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.json({ servers: {} });
});

app.use("/api", accountRouter);

export default app;
