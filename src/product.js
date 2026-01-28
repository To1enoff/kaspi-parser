// src/product.js
import { extractMeasureAndWeight, toIntSafe } from "./utils.js";

export function buildProductObject(item, city = null) {
  const id = item?.id ? String(item.id) : null;

  const title = item?.title || null;

  const { measure, weight, volume } = extractMeasureAndWeight(title || "");

  // ✅ цены из твоего sample
  const price = toIntSafe(item?.unitSalePrice ?? item?.unitPrice ?? 0);

  // ✅ url из shopLink (относительный)
  const url = item?.shopLink ? `https://kaspi.kz${item.shopLink}` : (id ? `https://kaspi.kz/shop/p/${id}` : null);

  // ✅ картинка из previewImages
  const image =
    Array.isArray(item?.previewImages) && item.previewImages.length
      ? (item.previewImages[0].large || item.previewImages[0].medium || item.previewImages[0].small || null)
      : null;

  // ✅ категория
  const category_full_path = Array.isArray(item?.category) ? item.category.join(" > ") : null;

  // ✅ отзывы и рейтинг
  const rating = item?.rating ?? null;
  const review_count = toIntSafe(item?.reviewsQuantity ?? 0);

  // ⚠️ merchantName в listing-ответе нет (по sample)
  const merchantName = null;

  return {
    id,
    title,
    city,

    price,
    rating: rating == null ? null : Number(rating),
    review_count,

    url,
    image,

    category_full_path,
    merchantName,

    measure,
    weight: weight ?? null,   // это “из названия”, не item.weight (у item.weight = 0)
    volume,

    parsedAt: new Date().toISOString(),
  };
}
