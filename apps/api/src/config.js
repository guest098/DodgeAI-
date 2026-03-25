import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

export const config = {
  port: Number(process.env.PORT || 4000),
  datasetRoot: path.resolve(
    repoRoot,
    process.env.DATASET_ROOT || "./dataset/sap-o2c-data",
  ),
  sqlitePath: path.resolve(
    repoRoot,
    process.env.SQLITE_PATH || "./apps/api/data/o2c.sqlite",
  ),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
  groqApiKey: process.env.GROQ_API_KEY || "",
  groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
  openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
  openrouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free",
  openrouterSiteUrl: process.env.OPENROUTER_SITE_URL || "http://localhost:5173",
  openrouterAppName:
    process.env.OPENROUTER_APP_NAME || "sap-order-to-cash-graph",
};
