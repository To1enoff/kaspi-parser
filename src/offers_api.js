// src/offers_api.js
import { fetchOffersStrict } from "./utils.js";

export function offersUrl(productId) {
  return `https://kaspi.kz/yml/offer-view/offers/${productId}`;
}

export function normalizeOffers(resp) {
  const arr = resp?.offers;
  if (!Array.isArray(arr)) return [];

  return arr.map((o) => ({
    merchantId: o?.merchantId ? String(o.merchantId) : null,
    merchantName: o?.merchantName || null,
    price: typeof o?.price === "number" ? o.price : Number(o?.price),
    deliveryType: o?.deliveryType || null,
    deliveryDuration: o?.deliveryDuration || null,
    kaspiDelivery: !!o?.kaspiDelivery,
    preorder: o?.preorder ?? null,
    locatedInPoint: o?.locatedInPoint ?? null,
    merchantRating: o?.merchantRating ?? null,
    merchantReviewsQuantity: o?.merchantReviewsQuantity ?? null,
  }));
}

export function pickBestOffer(offers) {
  const withPrice = offers
    .filter((o) => Number.isFinite(o.price))
    .sort((a, b) => a.price - b.price);

  return withPrice[0] || offers[0] || null;
}

export async function fetchOffersByProductId(productId) {
  const url = offersUrl(productId);
  const resp = await fetchOffersStrict(url);
  const offers = normalizeOffers(resp);
  const bestOffer = pickBestOffer(offers);

  return { url, offers, bestOffer };
}
