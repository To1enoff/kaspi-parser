// enrich_offers.js
import "dotenv/config";
import pLimit from "p-limit";
import { fetchOffersBySku } from "./src/utils_offers.js";
import { getProductsCollection } from "./src/mongo.js";
import { OFFERS } from "./src/config.js";
import { nextProxyAgent } from "./src/proxy_pool.js";
import { sendToTelegram } from "./src/notifyy.js";
import { formatDropMessage } from "./src/format_message.js";

console.log("[ENRICH] script file:", import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => Math.floor(min + Math.random() * (max - min));

function now() {
  return Date.now();
}

function fmtMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}:${ss
    .toString()
    .padStart(2, "0")}`;
}

function isRetryable(msg) {
  msg = String(msg || "");
  return (
    msg.includes("HTTP 403") ||
    msg.includes("HTTP 429") ||
    msg.toLowerCase().includes("timeout") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("EAI_AGAIN") ||
    msg.toLowerCase().includes("proxy")
  );
}

/**
 * Strategy:
 * 1) First try DIRECT (no proxy)
 * 2) If retryable error => retry with proxy pool (new proxy each attempt)
 */
async function fetchOffersSmart(sku, maxProxyAttempts = 5) {
  // 1) Direct attempt
  try {
    return await fetchOffersBySku({ sku, agent: undefined });
  } catch (e) {
    if (!isRetryable(e?.message || e)) throw e;
    await sleep(jitter(300, 900));
  }

  // 2) Proxy attempts
  let lastErr;
  for (let attempt = 1; attempt <= maxProxyAttempts; attempt++) {
    const agent = nextProxyAgent(); // can be undefined if PROXY_URLS empty

    try {
      await sleep(jitter(20, 120));
      return await fetchOffersBySku({ sku, agent });
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);

      if (!isRetryable(msg)) break;

      if (msg.includes("HTTP 403") || msg.includes("HTTP 429")) {
        await sleep(jitter(1500 * attempt, 4000 * attempt));
      } else {
        await sleep(jitter(800 * attempt, 2500 * attempt));
      }
    }
  }

  throw lastErr || new Error("OFFERS failed");
}

async function enrich() {
  const col = await getProductsCollection();

  const query = OFFERS.ONLY_MISSING ? { offers: { $exists: false } } : {};
  const cursor = col.find(query, {
    projection: { id: 1, price: 1, title: 1, url: 1, lastNotifiedPrice: 1 },
  });

  const concurrency = Math.max(1, Number(OFFERS.CONCURRENCY || 3));
  const limit = pLimit(concurrency);

  const startedAt = now();

  let seen = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let notified = 0;

  const inFlight = new Set();
  const logEvery = 50;

  function logProgress(force = false) {
    if (!force && (seen === 0 || seen % logEvery !== 0)) return;

    const elapsed = now() - startedAt;
    const rate = elapsed > 0 ? updated / (elapsed / 1000) : 0;

    console.log(
      `[ENRICH] seen=${seen} updated=${updated} skipped=${skipped} failed=${failed} notified=${notified} ` +
        `concurrency=${concurrency} rate=${rate.toFixed(2)}/s elapsed=${fmtMs(elapsed)}`
    );
  }

  for await (const doc of cursor) {
    seen++;

    const task = limit(async () => {
      try {
        const oldPrice = doc.price;

        const offers = await fetchOffersSmart(doc.id, Number(OFFERS.RETRY_ATTEMPTS || 5));
        if (!offers?.length) {
          skipped++;
          return;
        }

        const best = offers[0];
        const newPrice = best.price;

        // update DB
        await col.updateOne(
          { id: doc.id },
          {
            $set: {
              offers,
              prevPrice: typeof oldPrice === "number" ? oldPrice : null,
              price: newPrice,
              merchantName: best.merchantName,
              deliveryDate: best.delivery,
              enrichedAt: new Date().toISOString(),
            },
          }
        );

        updated++;

        // notify only if price dropped
        const canCompare = typeof oldPrice === "number" && typeof newPrice === "number";
        const isDrop = canCompare && newPrice < oldPrice;

        if (isDrop) {
          if (doc.lastNotifiedPrice === newPrice) return;

          const msg = formatDropMessage({
            title: doc.title || best.title || `SKU ${doc.id}`,
            url: doc.url || `https://kaspi.kz/p/${doc.id}/?c=750000000`,
            oldPrice,
            newPrice,
            merchantName: best.merchantName,
            offersCount: offers.length,
          });

          await sendToTelegram(msg);

          await col.updateOne(
            { id: doc.id },
            { $set: { lastNotifiedPrice: newPrice, lastNotifiedAt: new Date().toISOString() } }
          );

          notified++;
        }
      } catch (e) {
        failed++;
        console.warn(`[ENRICH FAIL] ${doc.id}: ${e?.message || e}`);
      } finally {
        logProgress();
      }
    });

    inFlight.add(task);
    task.finally(() => inFlight.delete(task));

    if (inFlight.size >= concurrency * 3) {
      await Promise.race(inFlight);
    }
  }

  await Promise.allSettled([...inFlight]);

  logProgress(true);
  console.log("✅ Enrichment finished");
}

enrich()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[ENRICH] fatal:", e);
    process.exit(1);
  });
