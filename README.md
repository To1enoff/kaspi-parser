# Kaspi Bulk Parser + Offers Enricher

Парсер товаров Kaspi по категориям + обогащение (offers/merchants/prices) через `https://kaspi.kz/yml/offer-view/offers/...` **без Playwright**, только Axios.
Сохранение идёт в **MongoDB** (upsert), можно останавливать и запускать снова.

---

## Требования

- Node.js 18+ (у тебя Node 25 ок)
- Docker Desktop
- MongoDB в Docker

---

## 1) Установка зависимостей 
```bash
docker run -d --name kaspi-mongo -p 27017:27017 mongo:7

npm install
npm i dotenv
```
## 2) Запуск парсинга товаров
```bash
node index.js
```
## 3) Enrich Offers
```bash
node enrich_offers.js
```

## 4) Tracking in Telegram bot
node loop.js


