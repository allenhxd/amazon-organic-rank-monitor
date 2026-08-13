import { describe, expect, it } from "vitest";
import { hashAdminPassword, verifyAdminPassword } from "@/server/password";

describe("管理员密码", () => {
  it("使用随机盐 scrypt 哈希并可验证", () => {
    const password = "correct horse battery staple";
    const first = hashAdminPassword(password);
    const second = hashAdminPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(verifyAdminPassword(password, first)).toBe(true);
    expect(verifyAdminPassword("wrong password", first)).toBe(false);
  });

  it("拒绝损坏或不受支持的哈希", () => {
    expect(verifyAdminPassword("password", "sha256:bad")).toBe(false);
    expect(verifyAdminPassword("password", undefined)).toBe(false);
  });
});
