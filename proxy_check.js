import "dotenv/config";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";

const proxyUrl = process.env.PROXY_URL; // <-- ОДИН прокси
if (!proxyUrl) throw new Error("PROXY_URL is not set");

const agent = new HttpsProxyAgent(proxyUrl);

try {
  const r = await axios.get("https://api.ipify.org?format=json", {
    proxy: false,
    httpsAgent: agent,
    timeout: 20000,
  });
  console.log("OK", r.data);
} catch (e) {
  console.log("FAIL", e.message);
}
