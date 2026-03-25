import { Router } from "express";
import { answerQuestion, streamAnswerQuestion } from "../services/chatService.js";

export const chatRouter = Router();

chatRouter.post("/", async (req, res) => {
  const question = String(req.body?.question || "").trim();
  const sessionId = req.body?.sessionId ? String(req.body.sessionId) : undefined;
  if (!question) {
    res.status(400).json({ error: "question is required" });
    return;
  }
  try {
    res.json(await answerQuestion({ question, sessionId }));
  } catch (error) {
    console.error("POST /api/chat failed:", error);
    res.status(500).json({ error: error.message });
  }
});

chatRouter.get("/stream", async (req, res) => {
  const question = String(req.query.question || "").trim();
  const sessionId = req.query.sessionId ? String(req.query.sessionId) : undefined;
  if (!question) {
    res.status(400).json({ error: "question is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await streamAnswerQuestion({
      question,
      sessionId,
      onReady(payload) {
        send("ready", payload);
      },
      onToken(token) {
        send("token", { token });
      },
      onComplete(answer) {
        send("done", { answer });
        res.end();
      },
    });
  } catch (error) {
    console.error("GET /api/chat/stream failed:", error);
    send("server-error", { error: error.message });
    res.end();
  }
});
