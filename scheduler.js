import "dotenv/config";
import cron from "node-cron";
import { startParsing } from "./src/parser.js";

const EVERY_MIN = Number(process.env.PARSE_EVERY_MIN || 30);

async function run() {
  console.log("[SCHEDULER] parse started", new Date().toISOString());
  try {
    await startParsing();
    console.log("[SCHEDULER] parse done", new Date().toISOString());
  } catch (e) {
    console.error("[SCHEDULER] parse error:", e?.message || e);
  }
}

cron.schedule(`*/${EVERY_MIN} * * * *`, async () => {
  await run();
});

console.log(`[SCHEDULER] running parser every ${EVERY_MIN} min`);

// можно стартануть сразу при запуске
run();
