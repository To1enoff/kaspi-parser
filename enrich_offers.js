// enrich_offers.js
import "dotenv/config";
import pLimit from "p-limit";
import { fetchOffersBySku } from "./src/utils_offers.js";
import { getProductsCollection } from "./src/mongo.js";
import { OFFERS } from "./src/config.js";
console.log("[ENRICH] script file:", import.meta.url);


const limit = pLimit(OFFERS.CONCURRENCY);

async function enrich() {
  const col = await getProductsCollection();

  const cursor = col.find(
    {},
    { projection: { id: 1 } }
  );

  let processed = 0;

  const tasks = [];

  for await (const doc of cursor) {
    tasks.push(
      limit(async () => {
        try {
          const offers = await fetchOffersBySku({ sku: doc.id });

          if (!offers.length) return;

          const best = offers[0]; // т.к. sort=PRICE

          await col.updateOne(
            { id: doc.id },
            {
              $set: {
                offers,
                price: best.price,
                merchantName: best.merchantName,
                deliveryDate: best.delivery,
                enrichedAt: new Date().toISOString(),
              },
            }
          );

          processed++;
          if (processed % 50 === 0) {
            console.log(`[ENRICH] updated ${processed}`);
          }
        } catch (e) {
          console.warn(`[ENRICH FAIL] ${doc.id}: ${e.message}`);
        }
      })
    );
  }

  await Promise.all(tasks);
  console.log("[ENRICH] tasks:", tasks.length);

  console.log("✅ Enrichment finished");
  console.log("[ENRICH] exiting now");
process.exit(0);

}

enrich().catch(console.error);
