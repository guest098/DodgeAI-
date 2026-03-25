import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { graphRouter } from "./routes/graphRoutes.js";
import { chatRouter } from "./routes/chatRoutes.js";
import { ensureConversationTables } from "./services/conversationService.js";

const app = express();
ensureConversationTables();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/graph", graphRouter);
app.use("/api/chat", chatRouter);

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
