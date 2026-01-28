// src/utils.js
import axios from "axios";
import fs from "fs";
import { AXIOS_CONFIG, CONFIG, CITY_MAP } from "./config.js";
import { getProductsCollection } from "./mongo.js";

// ==========================================
// STORAGE (JSON + de-dup)
// ==========================================
export const seenKeys = new Set(); // id|city
export const allResults = [];
let totalFound = 0;

// Mongo bulk buffer
let mongoBuffer = [];
let mongoColPromise = null;

export const saveCheckpoint = () => {
  fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(allResults, null, 2), "utf8");
  console.log(`[CHECKPOINT] Saved ${allResults.length} items`);
};

async function flushMongo() {
  if (!CONFIG.USE_MONGO) return;
  if (mongoBuffer.length === 0) return;

  if (!mongoColPromise) mongoColPromise = getProductsCollection();
  const col = await mongoColPromise;

  const ops = mongoBuffer.map((p) => ({
    updateOne: {
      filter: { id: p.id, city: p.city ?? null },
      update: { $set: { ...p, updatedAt: new Date().toISOString() } },
      upsert: true,
    },
  }));

  mongoBuffer = [];

  try {
    const res = await col.bulkWrite(ops, { ordered: false });
    console.log(`[MONGO] bulkWrite ok: upserts=${res.upsertedCount}, modified=${res.modifiedCount}`);
  } catch (e) {
    console.warn(`[MONGO] bulkWrite warn: ${e.message}`);
  }
}

export const addProduct = async (product) => {
  const key = `${product.id}|${product.city ?? ""}`;

  if (seenKeys.has(key)) return false;
  seenKeys.add(key);

  allResults.push(product);
  totalFound++;

  // JSON checkpoint
  if (totalFound % CONFIG.CHECKPOINT_INTERVAL === 0) saveCheckpoint();

  // Mongo batch upsert
  if (CONFIG.USE_MONGO) {
    mongoBuffer.push(product);
    if (mongoBuffer.length >= CONFIG.MONGO_BULK_SIZE) {
      await flushMongo();
    }
  }

  return true;
};

export async function finalizeStorage() {
  saveCheckpoint();
  await flushMongo();
}

// ==========================================
// CITY DETECTION
// ==========================================
export const extractCityFromUrl = (url) => {
  const match = url.match(/[&?]c=(\d+)/);
  if (match && match[1]) {
    return CITY_MAP[match[1]] || null;
  }
  return null;
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// ==========================================
// FETCH OFFERS (STRICT GET, NO EXTRA HEADERS)
// ==========================================
export const fetchOffersStrict = async (url, retries = 4) => {
  let attempt = 0;

  while (attempt < retries) {
    attempt++;
    try {
      const res = await axios.get(url, {
        headers: {
          "accept": "application/json, text/plain, */*",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "referer": "https://kaspi.kz/",
        },
        timeout: 15000,
        validateStatus: () => true, // ⬅️ чтобы поймать 405
      });

      if (res.status >= 200 && res.status < 300) {
        return res.data;
      }

      const backoff = 500 * attempt;
      console.warn(`[WARN] OFFERS HTTP ${res.status}. Backing off ${backoff}ms (attempt ${attempt})`);
      await sleep(backoff);

    } catch (err) {
      const backoff = 500 * attempt;
      console.warn(`[WARN] OFFERS error: ${err.message}. Backing off ${backoff}ms (attempt ${attempt})`);
      await sleep(backoff);
    }
  }

  throw new Error("OFFERS fetch failed after retries");
};

// ==========================================
// FETCH WITH RETRY
// ==========================================
export const fetchWithRetry = async (url, retries = CONFIG.MAX_RETRIES) => {
  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    try {
      const response = await axios.get(url, AXIOS_CONFIG);

      if (response.status === 429) {
        const backoff = Math.min(5000, 500 * attempt);
        console.warn(`[WARN] 429 rate limit. Backing off ${backoff}ms (attempt ${attempt})`);
        await sleep(backoff);
        continue;
      }
      if (response.status >= 200 && response.status < 300) return response.data;

      if (response.status >= 400) {
        const backoff = 500 * attempt;
        console.warn(`[WARN] HTTP ${response.status}. Backing off ${backoff}ms (attempt ${attempt})`);
        await sleep(backoff);
        continue;
      }
    } catch (err) {
      const backoff = 500 * attempt;
      console.warn(`[WARN] Error fetching: ${err.message}. Backing off ${backoff}ms (attempt ${attempt})`);
      await sleep(backoff);
    }
  }
  console.error(`[ERROR] Failed to fetch after ${retries} attempts`);
  return null;
};

// ==========================================
// UTILS
// ==========================================
export const toIntSafe = (v) => {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : Math.trunc(n);
};

export const extractMeasureAndWeight = (title) => {
  if (!title) return { measure: null, weight: null, volume: null };

  const measurePatterns = [
    { regex: /(\d+(?:[.,]\d+)?)\s*мл(?:\s|$|\.)/iu, measure: "миллилитры", type: "volume" },
    { regex: /(\d+(?:[.,]\d+)?)\s*л(?:\s|$|\.)/iu, measure: "литры", type: "volume" },
    { regex: /(\d+(?:[.,]\d+)?)\s*г(?:\s|$|\.)/iu, measure: "граммы", type: "weight" },
    { regex: /(\d+(?:[.,]\d+)?)\s*кг(?:\s|$|\.)/iu, measure: "килограммы", type: "weight" },
    { regex: /(\d+(?:[.,]\d+)?)\s*mg(?:\s|$|\.)/iu, measure: "миллиграммы", type: "weight" },
    { regex: /(\d+(?:[.,]\d+)?)\s*шт(?:\s|$|\.)/iu, measure: "штуки", type: "count" },
  ];

  for (const pattern of measurePatterns) {
    const match = title.match(pattern.regex);
    if (match) {
      const value = parseFloat(match[1].replace(",", "."));

      if (pattern.type === "volume") return { measure: pattern.measure, weight: null, volume: value };
      if (pattern.type === "weight") return { measure: pattern.measure, weight: value, volume: null };
      return { measure: pattern.measure, weight: value, volume: value };
    }
  }

  return { measure: null, weight: null, volume: null };
};

export const fixProductUrl = (url) => {
  if (!url) return null;
  return url.replace("https://kaspi.kz/p/", "https://kaspi.kz/shop/p/");
};
