// Server-only request metadata helpers.
import { getRequestHeader } from "@tanstack/react-start/server";

export function clientMeta() {
  const ua = getRequestHeader("user-agent") ?? "unknown";
  const ip =
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";

  let device = "Unknown device";
  if (/iPhone|iPad/i.test(ua)) device = "iOS device";
  else if (/Android/i.test(ua)) device = "Android device";
  else if (/Macintosh/i.test(ua)) device = "macOS computer";
  else if (/Windows/i.test(ua)) device = "Windows computer";
  else if (/Linux/i.test(ua)) device = "Linux workstation";

  const city = getRequestHeader("cf-ipcity");
  const location = city
    ? `${city}, ${getRequestHeader("cf-ipcountry") ?? ""}`.trim()
    : "Unknown location";

  return { ip, ua, device, location };
}
