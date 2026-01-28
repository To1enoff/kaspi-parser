import "dotenv/config";
import cron from "node-cron";
import { spawn } from "child_process";

const EVERY_MIN = Number(process.env.ENRICH_EVERY_MIN || 15);
const EVERY_MS = EVERY_MIN * 60 * 1000;

let running = false;

function runEnrichScript() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["enrich_offers.js"], {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
    });

    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("enrich exited with code " + code));
    });
  });
}

async function runOnce(source = "manual") {
  console.log(`\n[RUNNER] enrich start (${source}) ${new Date().toLocaleString()}`);
  await runEnrichScript();
  console.log(`[RUNNER] enrich done  (${source}) ${new Date().toLocaleString()}`);
}

/**
 * 1️⃣ CRON (основной)
 */
cron.schedule(`*/${EVERY_MIN} * * * *`, async () => {
  console.log("[CRON] tick", new Date().toLocaleString());
  if (running) {
    console.log("[CRON] skipped (still running)");
    return;
  }
  running = true;
  try {
    await runOnce("cron");
  } catch (e) {
    console.error("[CRON] error:", e.message);
  } finally {
    running = false;
  }
});

/**
 * 2️⃣ FALLBACK — setInterval (на всякий случай)
 * Даже если cron сломается, enrich всё равно будет каждые N минут
 */
setInterval(async () => {
  console.log("[INTERVAL] tick", new Date().toLocaleString());
  if (running) {
    console.log("[INTERVAL] skipped (still running)");
    return;
  }
  running = true;
  try {
    await runOnce("interval");
  } catch (e) {
    console.error("[INTERVAL] error:", e.message);
  } finally {
    running = false;
  }
}, EVERY_MS);

console.log(`[RUNNER] started. enrich every ${EVERY_MIN} min`);
runOnce("startup").catch((e) =>
  console.error("[RUNNER] first run error:", e.message)
);
