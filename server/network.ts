import os from "node:os";
import { PORT } from "../shared/constants.js";
import type { NetworkInfo } from "../shared/types.js";

function isUsefulIpv4(address: string, internal: boolean): boolean {
  if (internal) return false;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return false;
  if (address.startsWith("127.")) return false;
  if (address.startsWith("169.254.")) return false;
  return true;
}

export function getNetworkInfo(port = PORT): NetworkInfo {
  const urls: string[] = [];
  const nets = os.networkInterfaces();

  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family !== "IPv4" && Number(net.family) !== 4) continue;
      if (!isUsefulIpv4(net.address, net.internal)) continue;
      urls.push(`http://${net.address}:${port}`);
    }
  }

  // Prefer common private LAN ranges
  const preferred =
    urls.find((u) => u.includes("192.168.")) ??
    urls.find((u) => /http:\/\/10\./.test(u)) ??
    urls.find((u) => /http:\/\/172\.(1[6-9]|2\d|3[0-1])\./.test(u)) ??
    urls[0] ??
    null;

  return { port, urls, preferredUrl: preferred };
}
