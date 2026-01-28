# Kaspi Bulk Parser + Offers Enricher

Парсер товаров Kaspi по категориям + обогащение (offers/merchants/prices) через `https://kaspi.kz/yml/offer-view/offers/...` **без Playwright**, только Axios.
Сохранение идёт в **MongoDB** (upsert), можно останавливать и запускать снова.

---

## Требования

- Node.js 18+ (у тебя Node 25 ок)
- Docker Desktop
- MongoDB в Docker

---

## 1) Запуск MongoDB

### Вариант A (новый контейнер)
```bash
docker run -d --name kaspi-mongo -p 27017:27017 mongo:7
