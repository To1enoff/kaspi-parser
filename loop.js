// loop_run_enrich.js
import "dotenv/config";
import { spawn } from "child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INTERVAL_MS = Number(process.env.ENRICH_INTERVAL_MS || 6000);
const FAIL_BACKOFF_MS = Number(process.env.ENRICH_FAIL_BACKOFF_MS || 2000);

function runEnrichOnce() {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["enrich_offers.js"], {
      stdio: "inherit",
      env: process.env,
    });

    p.on("exit", (code) => resolve(code ?? 1));
    p.on("error", () => resolve(1));
  });
}

async function main() {
  let run = 0;

  while (true) {
    run++;
    console.log(`\n[LOOP] starting enrich run #${run} ...`);

    const code = await runEnrichOnce();

    if (code === 0) {
      console.log(`[LOOP] run #${run} OK. sleeping ${Math.round(INTERVAL_MS / 1000)}s...`);
      await sleep(INTERVAL_MS);
    } else {
      console.log(`[LOOP] run #${run} FAILED (exit=${code}). sleeping ${Math.round(FAIL_BACKOFF_MS / 1000)}s...`);
      await sleep(FAIL_BACKOFF_MS);
    }
  }
}

main().catch((e) => {
  console.error("[LOOP] fatal:", e);
  process.exit(1);
});
