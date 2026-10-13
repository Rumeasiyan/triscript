import os from "node:os";

/**
 * Returns the primary reachable IPv4 address for local network pairing.
 * Prioritizes standard LAN subnets (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
 */
export function getLocalLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const addresses = interfaces[name];
    if (!addresses) continue;

    for (const addr of addresses) {
      if (addr.family === "IPv4" && !addr.internal) {
        // Prioritize Wi-Fi and Ethernet interfaces
        if (/wi-fi|wireless|wlan|ethernet|en|eth/i.test(name)) {
          return addr.address;
        }
        candidates.push(addr.address);
      }
    }
  }

  return candidates[0] || null;
}

/**
 * Returns the recommended base URL for the phone to reach the Next.js server.
 */
export function getReachableBaseUrl(req?: Request): string {
  if (process.env.NEXT_PUBLIC_PUBLIC_URL) {
    return process.env.NEXT_PUBLIC_PUBLIC_URL.replace(/\/$/, "");
  }

  // If request contains host header, inspect it
  let host = "";
  let protocol = "http";
  if (req) {
    const hostHeader = req.headers.get("host") || "";
    const protoHeader = req.headers.get("x-forwarded-proto");
    if (protoHeader) protocol = protoHeader.split(",")[0].trim();
    if (hostHeader && !hostHeader.startsWith("localhost") && !hostHeader.startsWith("127.0.0.1")) {
      return `${protocol}://${hostHeader}`.replace(/\/$/, "");
    }
    host = hostHeader;
  }

  const lanIp = getLocalLanIp();
  if (lanIp) {
    const port = host.includes(":") ? host.split(":")[1] : "3000";
    return `${protocol}://${lanIp}:${port}`.replace(/\/$/, "");
  }

  return "";
}
