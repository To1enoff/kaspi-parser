// src/notify.js

export function formatStatus(s) {
  const lines = [];

  lines.push(`🛒 *${escapeMd(s.title || "Товар")}*`);
  lines.push(`id *${escapeMd(s.id || "id")}*`);
  if (s.minPrice != null) lines.push(`💰 Лучшая цена: *${escapeMd(String(s.minPrice))} ₸*`);

  lines.push(`🏪 Продавец: ${escapeMd(s.bestMerchantName || "—")}`);
  lines.push(`📦 Офферов: *${escapeMd(String(s.offersCount ?? 0))}*`);

  if (s.deliveryDuration) lines.push(`🚚 Доставка: ${escapeMd(s.deliveryDuration)}`);
  else if (s.delivery) lines.push(`🚚 Доставка: ${escapeMd(String(s.delivery))}`);

  if (s.url) lines.push(`🔗 ${escapeMd(s.url)}`); // ✅ экранируем URL

  return lines.join("\n");
}



/**
 * Escape for Telegram MarkdownV2
 * Ref: Telegram MarkdownV2 special chars: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
function escapeMd(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
