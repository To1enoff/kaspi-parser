import "dotenv/config";
import cron from "node-cron";
import { Telegraf } from "telegraf";
import { getCollections } from "./src/models.js";

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.ALERT_CHAT_ID;

const EVERY_MIN = Number(process.env.PRICE_CHECK_MIN || 5);

let running = false;

// MarkdownV2 escape
function escapeMd(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

function buildTop5(offers = []) {
  return offers
    .filter(o => typeof o.price === "number")
    .sort((a, b) => a.price - b.price)
    .slice(0, 5)
    .map((o, i) =>
      `${i + 1}) ${escapeMd(o.merchantName || "—")}: *${o.price} ₸*`
    )
    .join("\n");
}

async function checkPriceChanges() {
  const { products } = await getCollections();

  const cursor = products.find({
    price: { $exists: true, $ne: null },
    offers: { $exists: true, $ne: [] },
  });

  let alerts = 0;

  while (await cursor.hasNext()) {
    const p = await cursor.next();

    const oldPrice =
      typeof p.prevPrice === "number" ? p.prevPrice : p.price;

    const newPrice = p.price;

    if (oldPrice === newPrice) continue;

    const diff = newPrice - oldPrice;
    const arrow = diff < 0 ? "⬇️" : "⬆️";

    const top5 = buildTop5(p.offers);

    const msg =
      `🛒 *${escapeMd(p.title)}*\n\n` +
      `Самая низкая цена была: *${oldPrice} ₸*\n` +
      `Самая низкая цена стала: *${newPrice} ₸* ${arrow}\n\n` +
      `🔗 ${escapeMd(p.url)}\n\n` +
      `*Топ 5:*\n${top5}`;

    await bot.telegram.sendMessage(CHAT_ID, msg, {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });

    // обновляем Mongo
    await products.updateOne(
      { _id: p._id },
      {
        $set: {
          prevPrice: newPrice,
          priceChangedAt: new Date(),
        },
      }
    );

    alerts++;
  }

  console.log(`[PRICE] alerts sent=${alerts}`);
}

cron.schedule(`*/${EVERY_MIN} * * * *`, async () => {
  if (running) return;
  running = true;
  try {
    console.log("[PRICE] tick");
    await checkPriceChanges();
  } catch (e) {
    console.error("[PRICE] error:", e);
  } finally {
    running = false;
  }
});

console.log(`[PRICE] tracker started every ${EVERY_MIN} min`);
checkPriceChanges();
