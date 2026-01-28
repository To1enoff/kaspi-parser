function rankDelivery(o) {
  // чем меньше — тем лучше
  const d = (o?.deliveryDuration || "").toUpperCase();
  if (d.includes("TODAY")) return 0;
  if (d.includes("TOMORROW")) return 1;
  if (o?.delivery) return 2;
  return 3;
}

export function pickBestOffer(offers = []) {
  if (!Array.isArray(offers) || offers.length === 0) return null;

  // min price, если одинаково — быстрее доставка
  const sorted = [...offers].sort((a, b) => {
    const pa = Number(a?.price ?? Infinity);
    const pb = Number(b?.price ?? Infinity);
    if (pa !== pb) return pa - pb;
    return rankDelivery(a) - rankDelivery(b);
  });

  return sorted[0] || null;
}

export function calcSnapshot(productDoc) {
  const offers = productDoc?.offers || [];
  const best = pickBestOffer(offers);

  const minPrice = best?.price ?? productDoc?.price ?? null;
  const offersCount = Array.isArray(offers) ? offers.length : 0;

  const fingerprint = [
    minPrice ?? "null",
    offersCount,
    best?.merchantId ?? best?.merchantName ?? "null",
    best?.deliveryDuration ?? best?.delivery ?? "null",
  ].join("|");

  return {
    productId: String(productDoc.id),
    title: productDoc.title ?? null,
    city: productDoc.city ?? null,
    url: productDoc.url ?? null,

    minPrice,
    offersCount,
    bestMerchantId: best?.merchantId ?? null,
    bestMerchantName: best?.merchantName ?? null,
    delivery: best?.delivery ?? productDoc.deliveryDate ?? null,
    deliveryDuration: best?.deliveryDuration ?? null,

    fingerprint,
  };
}
