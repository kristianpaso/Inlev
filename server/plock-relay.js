
import express from "express";
const app = express();
app.use(express.json());
const clients = new Map(); // id -> Set(res)

app.post("/plock/push", (req, res) => {
  const { id = "default", count, mission } = req.body || {};
  const set = clients.get(id);
  if (set) {
    const payload = JSON.stringify({ count, mission, ts: Date.now() });
    for (const r of set) r.write(`data:${payload}\n\n`);
  }
  res.json({ ok: true });
});

app.get("/plock/stream", (req, res) => {
  const id = (req.query.id || "default").toString();
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  let set = clients.get(id);
  if (!set) clients.set(id, (set = new Set()));
  set.add(res);
  req.on("close", () => set.delete(res));
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log("Plock relay on", PORT));
