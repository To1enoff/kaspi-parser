// bot.js
import "dotenv/config";
import { Telegraf } from "telegraf";

import { getCollections } from "./src/models.js";
import { extractProductId } from "./src/kaspi.js";
import { calcSnapshot } from "./src/calc.js";
import { formatStatus } from "./src/notify.js";

if (!process.env.BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing. Put it into .env рядом с bot.js");
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---- global errors ----
bot.catch((err) => {
  console.error("[BOT ERROR]", err?.response || err?.message || err);
});
process.on("unhandledRejection", (e) => console.error("[UNHANDLED]", e));
process.on("uncaughtException", (e) => console.error("[UNCAUGHT]", e));

// ---- FIRST middleware: incoming log ----
bot.use(async (ctx, next) => {
  if (ctx.message?.text) console.log("[INCOMING]", ctx.message.text);
  return next();
});

// ---- /start ----

bot.command("chatid", async (ctx) => {
  await ctx.reply(`🆔 Chat ID: ${ctx.chat.id}`);
  console.log("[CHAT_ID]", ctx.chat.id);
});


bot.start(async (ctx) => {
  try {
    await ctx.reply(
      "Привет! Я трекаю цены/офферы Kaspi ✅\n\n" +
        "Команды:\n" +
        "/track <kaspi_url> — добавить товар\n" +
        "/list — мои товары\n" +
        "/status <id> — статус товара\n" +
        "/untrack <id> — убрать\n\n" +
        "Тест: напиши любое слово (не команду) — я отвечу echo."
    );
    console.log("[REPLY] /start ok");
  } catch (e) {
    console.error("[REPLY] /start failed:", e?.response || e?.message || e);
  }
});


// ---- /track ----
bot.command("track", async (ctx) => {
    console.log("[TRACK] handler entered");

  try {
    const text = ctx.message?.text || "";
    const arg = text.split(" ").slice(1).join(" ").trim();

    const productId = extractProductId(arg);
    if (!productId) {
      return ctx.reply("Не смог найти id товара в ссылке. Пришли ссылку Kaspi или цифры id.");
    }

    const { products, watchlists } = await getCollections();

    const product = await products.findOne({ id: String(productId) });
    if (!product) {
      return ctx.reply("Товар не найден в базе. Сначала допарси его в Mongo (парсером).");
    }

    const userId = ctx.from.id;

    await watchlists.updateOne(
      { userId, productId: String(productId) },
      { $setOnInsert: { userId, productId: String(productId), createdAt: new Date() } },
      { upsert: true }
    );

    const snap = calcSnapshot(product);
    await ctx.reply(formatStatus(snap), {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });
    console.log("[REPLY] /track ok", productId);
  } catch (e) {
    console.error("[track] error:", e?.response || e?.message || e);
    await ctx.reply("Ошибка при /track. Смотри консоль.");
  }
});

// ---- /list ----
bot.command("list", async (ctx) => {
  const started = Date.now();
  try {
    console.log("[LIST] start");

    const { watchlists, products } = await getCollections();
    console.log("[LIST] got collections");

    const userId = ctx.from.id;

    const items = await watchlists.find({ userId }).limit(50).toArray();
    console.log("[LIST] watchlists count:", items.length);

    if (!items.length) {
      await ctx.reply("Пока пусто. Используй /track <kaspi_url>");
      console.log("[LIST] replied empty");
      return;
    }

    const ids = items.map((x) => String(x.productId));
    const prods = await products
      .find({ id: { $in: ids } })
      .project({ id: 1, title: 1 })
      .toArray();

    console.log("[LIST] products found:", prods.length);

    const map = new Map(prods.map((p) => [String(p.id), p.title]));
    const lines = items.map(
      (x, i) => `${i + 1}) ${x.productId} — ${map.get(String(x.productId)) || "—"}`
    );

    await ctx.reply(lines.join("\n"));
    console.log("[LIST] replied ok in", Date.now() - started, "ms");
  } catch (e) {
    console.error("[LIST] error:", e?.response || e?.message || e);
    await ctx.reply("Ошибка при /list. Смотри консоль.");
  }
});


// ---- /status ----
bot.command("status", async (ctx) => {
  try {
    const arg = (ctx.message?.text || "").split(" ").slice(1).join(" ").trim();
    const productId = extractProductId(arg);
    if (!productId) return ctx.reply("Формат: /status <id>");

    const { products } = await getCollections();
    const product = await products.findOne({ id: String(productId) });
    if (!product) return ctx.reply("Товар не найден в базе.");

    const snap = calcSnapshot(product);
    await ctx.reply(formatStatus(snap), {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });
    console.log("[REPLY] /status ok", productId);
  } catch (e) {
    console.error("[status] error:", e?.response || e?.message || e);
    await ctx.reply("Ошибка при /status. Смотри консоль.");
  }
});

// ---- /untrack ----
bot.command("untrack", async (ctx) => {
  try {
    const arg = (ctx.message?.text || "").split(" ").slice(1).join(" ").trim();
    const productId = extractProductId(arg);
    if (!productId) return ctx.reply("Формат: /untrack <id>");

    const { watchlists } = await getCollections();
    const userId = ctx.from.id;

    const r = await watchlists.deleteOne({ userId, productId: String(productId) });
    await ctx.reply(r.deletedCount ? "Удалил из отслеживания ✅" : "Не было в отслеживании.");
    console.log("[REPLY] /untrack ok", productId);
  } catch (e) {
    console.error("[untrack] error:", e?.response || e?.message || e);
    await ctx.reply("Ошибка при /untrack. Смотри консоль.");
  }
});

bot.on("text", async (ctx) => {
  const t = ctx.message?.text || "";
  if (t.startsWith("/")) return; // команды не трогаем
  try {
    await ctx.reply("✅ вижу: " + t);
    console.log("[REPLY] echo ok");
  } catch (e) {
    console.error("[REPLY] echo failed:", e?.response || e?.message || e);
  }
});


// ---- startup ----
async function main() {
  console.log("[BOT] booting...");

  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  console.log("[BOT] webhook deleted");

  const me = await bot.telegram.getMe();
  console.log("[BOT] getMe:", me.username);

  console.log("[BOT] starting polling...");
  bot.startPolling({ allowedUpdates: ["message"] }); // ✅ ВАЖНО
  console.log("[BOT] started ✅ (polling)");
}

main().catch((e) => {
  console.error("[BOT] fatal:", e?.response || e?.message || e);
  process.exit(1);
});

// graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
