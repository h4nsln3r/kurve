import os from "node:os";
import { PORT } from "../shared/constants.js";
import type { NetworkInfo } from "../shared/types.js";

const DEV_CLIENT_PORT = 5173;

function isUsefulIpv4(address: string, internal: boolean): boolean {
  if (internal) return false;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return false;
  if (address.startsWith("127.")) return false;
  if (address.startsWith("169.254.")) return false;
  return true;
}

function lanIpv4Addresses(): string[] {
  const addresses: string[] = [];
  const nets = os.networkInterfaces();

  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family !== "IPv4" && Number(net.family) !== 4) continue;
      if (!isUsefulIpv4(net.address, net.internal)) continue;
      addresses.push(net.address);
    }
  }
  return addresses;
}

function preferLan(urls: string[]): string | null {
  return (
    urls.find((u) => u.includes("192.168.")) ??
    urls.find((u) => /http:\/\/10\./.test(u)) ??
    urls.find((u) => /http:\/\/172\.(1[6-9]|2\d|3[0-1])\./.test(u)) ??
    urls[0] ??
    null
  );
}

export function getNetworkInfo(serverPort = PORT): NetworkInfo {
  const isProd = process.env.NODE_ENV === "production";
  const joinPort = isProd ? serverPort : DEV_CLIENT_PORT;
  const urls = lanIpv4Addresses().map((ip) => `http://${ip}:${joinPort}`);

  return {
    port: serverPort,
    joinPort,
    urls,
    preferredUrl: preferLan(urls),
    mode: isProd ? "production" : "development",
  };
}
