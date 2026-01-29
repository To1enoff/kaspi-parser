// src/utils_offers.js
import axios from "axios";
import { SocksProxyAgent } from "socks-proxy-agent";
import { OFFERS } from "./config.js";

export async function fetchOffersBySku({ sku }) {
  const cookie = process.env.KASPI_COOKIE;
  if (!cookie) throw new Error("KASPI_COOKIE is not set");

  const proxyUrl = process.env.PROXY_URL;
  const proxyAgent = proxyUrl ? new SocksProxyAgent(proxyUrl) : undefined;

  const url = `https://kaspi.kz/yml/offer-view/offers/${sku}`;

  const payload = {
    cityId: OFFERS.CITY_ID,
    id: String(sku),
    merchantUID: [],
    limit: OFFERS.LIMIT,
    page: 0,
    sortOption: "PRICE",
    highRating: null,
    searchText: null,
    isExcellentMerchant: false,
    installationId: "-1",
    zoneId: OFFERS.USE_MAGNUM_ZONE ? [OFFERS.ZONE_ID] : [],
    product: { brand: "Без бренда", categoryCodes: [], baseProductCodes: [], groups: null, productSeries: [] },
  };

  const res = await axios.post(url, payload, {
    // важно: отключаем встроенный axios proxy, используем agent
    proxy: false,
    httpAgent: proxyAgent,
    httpsAgent: proxyAgent,

    headers: {
      Cookie: cookie,
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      "Content-Type": "application/json; charset=UTF-8",
      Origin: "https://kaspi.kz",
      Referer: "https://kaspi.kz/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      "X-KS-City": String(OFFERS.CITY_ID),
      "X-Requested-With": "XMLHttpRequest",
    },
    timeout: 15000,
    validateStatus: () => true,
  });

  if (res.status !== 200) throw new Error(`OFFERS HTTP ${res.status}`);
  return res.data?.offers || [];
}
