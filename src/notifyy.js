import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";

const token = process.env.BOT_TOKEN;
const chatId = process.env.ALERT_CHAT_ID;

if (!token) throw new Error("TG_BOT_TOKEN is not set");
if (!chatId) throw new Error("TG_CHAT_ID is not set");

const bot = new TelegramBot(token, { polling: false });

export async function sendToTelegram(text) {
  await bot.sendMessage(chatId, text, { disable_web_page_preview: false });
}
