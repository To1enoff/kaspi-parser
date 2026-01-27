import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import CATEGORY_URLS from '../data/categories.json' assert { type: 'json' };
import { CONFIG } from './config.js';
import {
  addProduct,
  allResults,
  extractCityFromUrl,
  fetchWithRetry,
  isMagnumProduct,
  sleep,
} from './utils.js';
import { buildProductObject } from './product.js';

// ==========================================
// PROCESS A SINGLE CATEGORY
// ==========================================
const processCategory = async (categoryUrl, categoryIndex, totalCategories) => {
  const categoryName = decodeURIComponent(
    (categoryUrl.match(/category%3A([^&]+)/) || [null, `Category ${categoryIndex}`])[1] || 
    `Category ${categoryIndex}`
  );
  
  const city = extractCityFromUrl(categoryUrl);
  
  console.log(`[${categoryIndex}/${totalCategories}] Starting: ${categoryName} (City: ${city || 'Unknown'})`);

  let page = 0;
  const hasPageParam = /page=\d+/.test(categoryUrl);
  let categoryMatches = 0;
  let keepGoing = true;

  while (keepGoing) {
    if (CONFIG.MAX_PAGE != null && page > CONFIG.MAX_PAGE) break;

    const pageUrls = [];
    for (let i = 0; i < CONFIG.PAGE_PARALLEL; i++) {
      const p = page + i;
      if (CONFIG.MAX_PAGE != null && p > CONFIG.MAX_PAGE) break;
      
      let paginatedUrl;
      if (hasPageParam) {
        paginatedUrl = categoryUrl.replace(/page=\d+/, `page=${p}`);
      } else {
        paginatedUrl = categoryUrl.includes('?') ? `${categoryUrl}&page=${p}` : `${categoryUrl}?page=${p}`;
      }
      
      paginatedUrl = paginatedUrl.replace(/requestId=[^&]+/, `requestId=${uuidv4()}`);
      if (!/requestId=/.test(paginatedUrl)) {
        paginatedUrl += (paginatedUrl.includes('?') ? '&' : '?') + `requestId=${uuidv4()}`;
      }
      pageUrls.push({ url: paginatedUrl, pageNumber: p });
    }

    if (pageUrls.length === 0) break;

    const fetchPromises = pageUrls.map(pu => fetchWithRetry(pu.url));
    const responses = await Promise.all(fetchPromises);

    let anyData = false;
    for (let i = 0; i < responses.length; i++) {
      const data = responses[i];
      if (!data || !Array.isArray(data.data) || data.data.length === 0) {
        continue;
      }
      anyData = true;
      for (const item of data.data) {
        try {
          if (!item) continue;
          if (isMagnumProduct(item)) {
            const product = buildProductObject(item, city);
            if (addProduct(product)) {
              categoryMatches++;
            }
          }
        } catch (err) {
          console.warn(`[WARN] Failed processing item in ${categoryName}: ${err.message}`);
        }
      }
    }

    page += pageUrls.length;
    if (!anyData) keepGoing = false;
    await sleep(CONFIG.REQUEST_DELAY);
  }

  console.log(`[${categoryIndex}/${totalCategories}] Done: ${categoryName} - ${categoryMatches} items`);
  return categoryMatches;
};

// ==========================================
// CONCURRENCY RUNNER
// ==========================================
const runWithConcurrency = async (tasks, concurrency) => {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);

    executing.add(p);
    const remove = () => executing.delete(p);
    p.then(remove).catch(remove);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
};

// ==========================================
// MAIN EXPORT
// ==========================================
export async function startParsing() {
  console.log(`Starting Kaspi Parser (concurrency=${CONFIG.CONCURRENCY}, pageParallel=${CONFIG.PAGE_PARALLEL}, MAX_PAGE=${CONFIG.MAX_PAGE === null ? 'none' : CONFIG.MAX_PAGE})`);
  console.log(`${CATEGORY_URLS.length} categories to process`);
  const startTime = Date.now();

  try {
    const tasks = CATEGORY_URLS.map((url, index) => {
      return () => processCategory(url, index + 1, CATEGORY_URLS.length);
    });

    await runWithConcurrency(tasks, CONFIG.CONCURRENCY);
  } catch (error) {
    console.error('Critical Error:', error && error.message ? error.message : error);
  } finally {
    fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(allResults, null, 2), 'utf8');
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('='.repeat(60));
    console.log(`Done! Saved ${allResults.length} unique items to ${CONFIG.OUTPUT_FILE}`);
    console.log(`Total time: ${elapsed}s`);
    console.log('='.repeat(60));
  }
}
