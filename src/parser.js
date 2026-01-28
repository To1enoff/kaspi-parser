// src/parser.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { CONFIG } from "./config.js";
import { fetchWithRetry, extractCityFromUrl, addProduct, finalizeStorage, sleep } from "./utils.js";
import { buildProductObject } from "./product.js"; // ✅ тут должен быть buildProductObject (с merchantName)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readCategoriesJson() {
  const p = path.join(__dirname, "..", "data", "categories_b.json");
  const raw = fs.readFileSync(p, "utf8");
  const json = JSON.parse(raw);

  // поддержим 2 формата:
  // 1) ["https://....", "..."]
  // 2) [{ url: "https://..." }, { api: "https://..." }]
  if (Array.isArray(json)) {
    return json
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") return x.url || x.api || x.endpoint || null;
        return null;
      })
      .filter(Boolean);
  }

  // если вдруг { urls: [...] }
  if (json?.urls && Array.isArray(json.urls)) return json.urls.filter((x) => typeof x === "string");

  throw new Error("categories_b.json must be an array of urls (or {urls:[]})");
}

function setPage(url, page) {
  // аккуратно меняем/добавляем page=
  const u = new URL(url);
  u.searchParams.set("page", String(page));
  return u.toString();
}

function pickItems(resp) {
  // Kaspi API бывает разное — поэтому делаем “универсальный” парсинг
  if (!resp) return [];

  // часто: { data: { items: [...] } }
  const candidates = [
    resp?.data?.items,
    resp?.data?.products,
    resp?.data,
    resp?.items,
    resp?.products,
    resp?.result,
    resp?.results,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  // иногда: { data: { ... , items: [...] } } — уже выше
  return [];
}

function pickHasMore(resp, items, page) {
  // если API отдаёт totalPages/pageCount — используем
  const totalPages =
    resp?.data?.totalPages ??
    resp?.totalPages ??
    resp?.data?.pageCount ??
    resp?.pageCount ??
    null;

  if (typeof totalPages === "number" && Number.isFinite(totalPages)) {
    return page < totalPages;
  }

  // если есть total и limit/size — можно вычислить, но не всегда надёжно
  // fallback: есть items => пробуем следующую страницу, пока не станет пусто
  return items.length > 0;
}

async function parseCategory(apiUrl) {
  const city = extractCityFromUrl(apiUrl);
  let page = 0;
  let totalAdded = 0;

  while (page < CONFIG.MAX_PAGE) {
    const url = setPage(apiUrl, page);
    const resp = await fetchWithRetry(url);

    const items = pickItems(resp);

    if (!items.length) break;

    for (const item of items) {
      // ✅ НИКАКОГО isMagnumProduct — берём все товары
      const product = buildProductObject(item, city);
      const added = await addProduct(product);
      if (added) totalAdded++;
    }

    if (!pickHasMore(resp, items, page)) break;

    page++;
    if (CONFIG.REQUEST_DELAY) await sleep(CONFIG.REQUEST_DELAY);
  }

  return totalAdded;
}

export async function startParsing() {
  const urls = readCategoriesJson();
  console.log(`[START] categories urls: ${urls.length}`);

  let grandTotal = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`\n[CATEGORY ${i + 1}/${urls.length}] ${url}`);

    try {
      const added = await parseCategory(url);
      grandTotal += added;
      console.log(`[CATEGORY DONE] added=${added}, total=${grandTotal}`);
    } catch (e) {
      console.warn(`[CATEGORY FAIL] ${e?.message || e}`);
    }
  }

  await finalizeStorage();
  console.log(`\n[DONE] total added=${grandTotal}`);
}
