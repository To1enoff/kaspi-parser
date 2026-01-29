// calc.js - calculate product snapshot data

export function calcSnapshot(product) {
  if (!product) return null;

  const now = new Date();
  const offers = product.offers || [];

  let minPrice = null;
  let topMerchants = [];
  let priceHistory = null;

  if (offers.length > 0) {
    // Sort offers by price
    const sortedOffers = offers
      .filter((o) => o.price && o.price > 0)
      .sort((a, b) => a.price - b.price);

    if (sortedOffers.length > 0) {
      minPrice = sortedOffers[0].price;

      // Top 5 merchants
      topMerchants = sortedOffers.slice(0, 5).map((offer) => ({
        name: offer.merchantName || offer.merchantId || "Unknown",
        price: offer.price,
        url: offer.merchantUrl || null,
      }));

      // Price history (если есть snapshots)
      const lowest = product.lowestPrice || minPrice;
      priceHistory = {
        lowest: lowest,
        current: minPrice,
        allowable: Math.round(minPrice * 0.95), // 5% скидка как допустимая
      };
    }
  } else if (product.price) {
    // Use direct price from product
    minPrice = product.price;
    topMerchants = [
      {
        name: product.merchantName || "Kaspi Shop",
        price: product.price,
        url: product.url,
      },
    ];
    priceHistory = {
      lowest: product.price,
      current: product.price,
      allowable: Math.round(product.price * 0.95),
    };
  }

  return {
    productId: product.id,
    title: product.title || "Unknown Product",
    url: product.url || `https://kaspi.kz/shop/p/${product.id}/`,
    minPrice,
    topMerchants,
    priceHistory,
    changeUrl: `https://seller.forte.kz/products/manage/${product.id}`,
    timestamp: now,
  };
}