import "dotenv/config";
import cron from "node-cron";
import { Telegraf } from "telegraf";

import { getCollections } from "./src/models.js";
import { calcSnapshot } from "./src/calc.js";
import { formatPriceDrop, formatStatus } from "./src/notify.js";

const CHAT_ID = process.env.ALERT_CHAT_ID;
if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN missing");
if (!CHAT_ID) throw new Error("ALERT_CHAT_ID missing in .env");

const bot = new Telegraf(process.env.BOT_TOKEN);

const CHECK_EVERY_MIN = Number(process.env.CHECK_EVERY_MIN || 30);
const COOLDOWN_MIN = Number(process.env.ALERT_COOLDOWN_MIN || 60);

async function shouldSend(alerts, productId, type, fingerprint) {
  const now = new Date();
  const cooldownMs = COOLDOWN_MIN * 60 * 1000;

  const existing = await alerts.findOne({ productId, type, chatId: String(CHAT_ID) });
  if (!existing) return true;

  const last = existing.lastSentAt ? new Date(existing.lastSentAt).getTime() : 0;
  if (now.getTime() - last < cooldownMs) return false;

  if (existing.fingerprint === fingerprint) return false;

  return true;
}

async function runOnce() {
  const { products, snapshots, alerts } = await getCollections();

  // ⚡ ВАЖНО: если товаров много, лучше курсором
  const cursor = products.find({}).project({
    id: 1, title: 1, city: 1, url: 1, price: 1, deliveryDate: 1, offers: 1
  });

  let checked = 0;
  let notified = 0;

  while (await cursor.hasNext()) {
    const p = await cursor.next();
    checked++;

    const current = calcSnapshot(p);

    const prevRow = await snapshots
      .find({ productId: current.productId })
      .sort({ ts: -1 })
      .limit(1)
      .toArray();

    const prev = prevRow[0]?.data || null;

    const changed = !prev || prev.fingerprint !== current.fingerprint;

    if (changed) {
      await snapshots.insertOne({ productId: current.productId, ts: new Date(), data: current });
    }

    // Уведомление только если цена упала (можешь расширить)
    if (prev && prev.minPrice != null && current.minPrice != null && current.minPrice < prev.minPrice) {
      const can = await shouldSend(alerts, current.productId, "PRICE_DROP", current.fingerprint);
      if (!can) continue;

      await bot.telegram.sendMessage(
        CHAT_ID,
        formatPriceDrop(prev, current),
        { parse_mode: "MarkdownV2", disable_web_page_preview: true }
      );

      await alerts.updateOne(
        { chatId: String(CHAT_ID), productId: current.productId, type: "PRICE_DROP" },
        { $set: { lastSentAt: new Date(), fingerprint: current.fingerprint } },
        { upsert: true }
      );

      notified++;
    }
  }

  console.log(`[TRACKER] checked=${checked}, notified=${notified}`);
}

// каждые N минут
cron.schedule(`*/${CHECK_EVERY_MIN} * * * *`, async () => {
  try {
    console.log("[TRACKER] tick", new Date().toISOString());
    await runOnce();
  } catch (e) {
    console.error("[TRACKER] error:", e?.response || e?.message || e);
  }
});

console.log(`[TRACKER] started. every ${CHECK_EVERY_MIN} min`);
