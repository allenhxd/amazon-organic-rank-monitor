import { z } from "zod";

export type Marketplace = "amazon.com" | "amazon.ca" | "amazon.com.mx";
export type Currency = "USD" | "CAD" | "MXN";

export type PostalPreset = {
  value: string;
  label: string;
};

export type MarketplaceConfig = {
  id: Marketplace;
  label: string;
  shortLabel: string;
  locale: "en-US" | "en-CA" | "es-MX";
  currency: Currency;
  timezone: string;
  postalExample: string;
  postalPresets: PostalPreset[];
  sponsoredLabels: string[];
  signedOutMarkers: string[];
  locationConfirmationLabels: string[];
};

export const MARKETPLACES: Record<Marketplace, MarketplaceConfig> = {
  "amazon.com": {
    id: "amazon.com",
    label: "Amazon.com（美国站）",
    shortLabel: "美国站",
    locale: "en-US",
    currency: "USD",
    timezone: "America/Los_Angeles",
    postalExample: "10001",
    sponsoredLabels: ["Sponsored"],
    signedOutMarkers: ["Hello, sign in"],
    locationConfirmationLabels: ["Done", "Continue"],
    postalPresets: [
      { value: "96038", label: "标准验收－加州北部（96038）" },
      { value: "10001", label: "美东－纽约（10001）" },
      { value: "02108", label: "美东－波士顿（02108）" },
      { value: "33101", label: "美东南－迈阿密（33101）" },
      { value: "60601", label: "中部－芝加哥（60601）" },
      { value: "75201", label: "中南部－达拉斯（75201）" },
      { value: "90001", label: "美西－洛杉矶（90001）" },
      { value: "94105", label: "美西－旧金山（94105）" },
      { value: "98101", label: "西北－西雅图（98101）" },
    ],
  },
  "amazon.ca": {
    id: "amazon.ca",
    label: "Amazon.ca（加拿大站）",
    shortLabel: "加拿大站",
    locale: "en-CA",
    currency: "CAD",
    timezone: "America/Toronto",
    postalExample: "M5V 3L9",
    sponsoredLabels: ["Sponsored", "Commandité"],
    signedOutMarkers: ["Hello, sign in", "Bonjour, Identifiez-vous"],
    locationConfirmationLabels: ["Done", "Continue", "Terminé", "Continuer"],
    postalPresets: [
      { value: "M5V 3L9", label: "加东－多伦多（M5V 3L9）" },
      { value: "H2Y 1C6", label: "加东－蒙特利尔（H2Y 1C6）" },
      { value: "K1P 1J1", label: "首都区－渥太华（K1P 1J1）" },
      { value: "V6B 1A1", label: "加西－温哥华（V6B 1A1）" },
      { value: "T2P 1J9", label: "加西－卡尔加里（T2P 1J9）" },
    ],
  },
  "amazon.com.mx": {
    id: "amazon.com.mx",
    label: "Amazon.com.mx（墨西哥站）",
    shortLabel: "墨西哥站",
    locale: "es-MX",
    currency: "MXN",
    timezone: "America/Mexico_City",
    postalExample: "06000",
    sponsoredLabels: ["Patrocinado", "Sponsored"],
    signedOutMarkers: ["Hola, Identifícate", "Hola, Inicia sesión"],
    locationConfirmationLabels: ["Listo", "Hecho", "Continuar"],
    postalPresets: [
      { value: "06000", label: "中部－墨西哥城（06000）" },
      { value: "44100", label: "西部－瓜达拉哈拉（44100）" },
      { value: "64000", label: "北部－蒙特雷（64000）" },
      { value: "22000", label: "边境－蒂华纳（22000）" },
      { value: "76000", label: "中部－克雷塔罗（76000）" },
    ],
  },
};

export const marketplaceSchema = z.enum(["amazon.com", "amazon.ca", "amazon.com.mx"]);

export function normalizePostalCode(marketplace: Marketplace, value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, " ");
  if (marketplace === "amazon.ca") {
    const compact = normalized.replace(/\s/g, "");
    return compact.length === 6 ? `${compact.slice(0, 3)} ${compact.slice(3)}` : normalized;
  }
  return normalized;
}

export function isValidPostalCode(marketplace: Marketplace, value: string) {
  const normalized = normalizePostalCode(marketplace, value);
  if (marketplace === "amazon.ca") return /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$/.test(normalized);
  return /^\d{5}$/.test(normalized);
}

export function enabledMarketplaces(value = process.env.NEXT_PUBLIC_ENABLED_MARKETPLACES || "amazon.com") {
  const configured = new Set(value.split(",").map((item) => item.trim()));
  return (Object.keys(MARKETPLACES) as Marketplace[]).filter((marketplace) => configured.has(marketplace));
}
