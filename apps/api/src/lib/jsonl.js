import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

export async function loadJsonlDirectory(directoryPath) {
  const files = fs
    .readdirSync(directoryPath)
    .filter((file) => file.endsWith(".jsonl"))
    .map((file) => path.join(directoryPath, file));

  const records = [];

  for (const filePath of files) {
    const fileStream = fs.createReadStream(filePath, "utf8");
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.trim()) {
        records.push(JSON.parse(line));
      }
    }
  }

  return records;
}
