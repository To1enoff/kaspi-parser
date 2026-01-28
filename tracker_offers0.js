import "dotenv/config";
import cron from "node-cron";
import { Telegraf } from "telegraf";
import { getCollections } from "./src/models.js";

const CHAT_ID = process.env.ALERT_CHAT_ID;
const EVERY_MIN = Number(process.env.CHECK_EVERY_MIN || 15);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 200);

if (!process.env.BOT_TOKEN) throw new Error("BOT_TOKEN missing");
if (!CHAT_ID) throw new Error("ALERT_CHAT_ID missing");

const bot = new Telegraf(process.env.BOT_TOKEN);

let running = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Telegram MarkdownV2 escape
function escapeMd(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

// Достаём __NEXT_DATA__ из HTML
function extractNextData(html) {
  const marker = 'id="__NEXT_DATA__" type="application/json"';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  const start = html.indexOf(">", idx);
  const end = html.indexOf("</script>", start);
  if (start === -1 || end === -1) return null;

  const jsonText = html.slice(start + 1, end).trim();
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

// Универсально ищем offersCount/офферы по дереву JSON
function deepFindOffersCount(root) {
  // приоритет: offersCount, offersQuantity, totalOffers, offers.length
  const stack = [root];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;

    if (typeof cur === "object") {
      // прямые поля
      const candidates = [
        cur.offersCount,
        cur.offersQuantity,
        cur.totalOffers,
        cur.merchantOffersCount,
      ];

      for (const v of candidates) {
        if (typeof v === "number" && Number.isFinite(v)) return v;
      }

      // массив offers
      if (Array.isArray(cur.offers)) return cur.offers.length;
      if (Array.isArray(cur.merchantOffers)) return cur.merchantOffers.length;

      // обход
      if (Array.isArray(cur)) {
        for (const x of cur) stack.push(x);
      } else {
        for (const k of Object.keys(cur)) stack.push(cur[k]);
      }
    }
  }

  return null;
}

async function fetchOffersCountFromKaspiUrl(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const next = extractNextData(html);
  if (!next) throw new Error("NO_NEXT_DATA");

  const offersCount = deepFindOffersCount(next);
  if (offersCount == null) throw new Error("OFFERS_COUNT_NOT_FOUND");

  return offersCount;
}

async function runOnce() {
  const { products } = await getCollections();
  const db = products.db;
  const checks = db.collection("offers_checks");
  await checks.createIndex({ id: 1, checkedAt: -1 });

  const cursor = products.find({}).project({
    id: 1,
    url: 1,
    title: 1,
    city: 1,
    offers: 1,
    offersCount: 1,
  });

  let checked = 0;
  let updated = 0;
  let alerted = 0;
  let failed = 0;

  while (await cursor.hasNext()) {
    const p = await cursor.next();
    checked++;

    const id = String(p.id || "");
    if (!id) continue;
    if (!p.url) {
      failed++;
      continue;
    }

    try {
      const newOffersCount = await fetchOffersCountFromKaspiUrl(p.url);

      // сохраним историю проверки (полезно для дебага)
      await checks.insertOne({
        id,
        checkedAt: new Date(),
        url: p.url,
        offersCount: newOffersCount,
      });

      const oldOffersCount =
        typeof p.offersCount === "number"
          ? p.offersCount
          : Array.isArray(p.offers)
          ? p.offers.length
          : null;

      const shouldAlert = newOffersCount === 0 && (oldOffersCount == null || oldOffersCount > 0);

      // обновим Mongo (даже если не 0 — чтобы было актуально)
      await products.updateOne(
        { _id: p._id },
        {
          $set: {
            offersCount: newOffersCount,
            kaspiOffersCheckedAt: new Date(),
            updatedAt: new Date(),
          },
          ...(newOffersCount === 0 ? { $set: { offers: [] } } : {}),
        }
      );

      updated++;

      if (shouldAlert) {
        const msg =
          `⚠️ *Офферов стало 0*\n` +
          `🆔 *${escapeMd(id)}*\n` +
          `🛒 *${escapeMd(p.title || "Товар")}*\n` +
          `📦 Было офферов: *${escapeMd(String(oldOffersCount ?? "—"))}*\n` +
          `📦 Сейчас: *0*\n` +
          (p.url ? `🔗 ${escapeMd(p.url)}` : "");

        await bot.telegram.sendMessage(CHAT_ID, msg, {
          parse_mode: "MarkdownV2",
          disable_web_page_preview: true,
        });

        alerted++;
      }

      await sleep(REQUEST_DELAY_MS);
    } catch (e) {
      failed++;
      console.warn(`[TRACK] id=${id} fail:`, e?.message || e);
      await sleep(500);
    }
  }

  console.log(
    `[TRACKER] checked=${checked} updated=${updated} alerted=${alerted} failed=${failed}`
  );
}

cron.schedule(`*/${EVERY_MIN} * * * *`, async () => {
  if (running) return;
  running = true;
  try {
    console.log("[TRACKER] tick", new Date().toISOString());
    await runOnce();
  } catch (e) {
    console.error("[TRACKER] fatal:", e?.message || e);
  } finally {
    running = false;
  }
});

console.log(`[TRACKER] started. every ${EVERY_MIN} min`);

// чтобы проверить сразу, без ожидания 15 минут
runOnce().catch((e) => console.error("[TRACKER] first run error:", e?.message || e));
