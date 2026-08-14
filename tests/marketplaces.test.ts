import { describe, expect, it } from "vitest";
import { enabledMarketplaces, isValidPostalCode, MARKETPLACES, normalizePostalCode } from "@/domain/marketplaces";
import { projectConfigSchema } from "@/domain/schemas";

describe("站点与邮编", () => {
  it("校验美国和墨西哥 5 位邮编", () => {
    expect(isValidPostalCode("amazon.com", "10001")).toBe(true);
    expect(isValidPostalCode("amazon.com.mx", "06000")).toBe(true);
    expect(isValidPostalCode("amazon.com", "M5V 3L9")).toBe(false);
  });

  it("规范化并校验加拿大邮编", () => {
    expect(normalizePostalCode("amazon.ca", "m5v3l9")).toBe("M5V 3L9");
    expect(isValidPostalCode("amazon.ca", "M5V 3L9")).toBe(true);
    expect(isValidPostalCode("amazon.ca", "D5V 3L9")).toBe(false);
  });

  it("按站点提供对应币种和地区预设", () => {
    expect(MARKETPLACES["amazon.com"].currency).toBe("USD");
    expect(MARKETPLACES["amazon.ca"].currency).toBe("CAD");
    expect(MARKETPLACES["amazon.com.mx"].currency).toBe("MXN");
    expect(MARKETPLACES["amazon.ca"].postalPresets.length).toBeGreaterThanOrEqual(5);
    expect(MARKETPLACES["amazon.com.mx"].signedOutMarkers).toContain("Hola, Identifícate");
    expect(MARKETPLACES["amazon.ca"].locationConfirmationLabels).toContain("Continuer");
  });

  it("允许先保存空邮编，但拒绝站点不匹配的邮编", () => {
    expect(projectConfigSchema.safeParse({ name: "x", marketplace: "amazon.com", zipCode: "", scanDepth: 1 }).success).toBe(true);
    expect(projectConfigSchema.safeParse({ name: "x", marketplace: "amazon.ca", zipCode: "10001", scanDepth: 1 }).success).toBe(false);
  });

  it("站点必须通过显式配置开放", () => {
    expect(enabledMarketplaces("amazon.com")).toEqual(["amazon.com"]);
    expect(enabledMarketplaces("amazon.com,amazon.ca")).toEqual(["amazon.com", "amazon.ca"]);
    expect(enabledMarketplaces("amazon.invalid")).toEqual([]);
  });
});
