import { HttpsProxyAgent } from "https-proxy-agent";

const urls = (process.env.PROXY_URLS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let idx = 0;

export function nextProxyAgent() {
  if (!urls.length) return undefined;
  const url = urls[idx % urls.length];
  idx++;
  return new HttpsProxyAgent(url);
}
