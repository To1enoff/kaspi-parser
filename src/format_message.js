export function fmtKzt(n) {
  if (typeof n !== "number") return "—";
  return `${n} ₸`;
}

export function formatDropMessage({ title, url, oldPrice, newPrice, merchantName, offersCount }) {
  const diff = oldPrice - newPrice;
  const pct = oldPrice ? (diff / oldPrice) * 100 : 0;

  return (
`📉 Цена упала!
🛒 ${title}
💰 Было: ${fmtKzt(oldPrice)}
✅ Стало: ${fmtKzt(newPrice)}  (−${diff} ₸, −${pct.toFixed(2)}%)
🏪 Теперь лучше: ${merchantName || "—"}
📦 Офферов: ${offersCount ?? "—"}
🔗 ${url}`
  );
}
