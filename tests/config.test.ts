import { describe, expect, it } from "vitest";
import { smtpConfig, validateProductionEnvironment } from "@/server/config";

const validEnvironment = {
  DATABASE_URL: "postgresql://rank_monitor:secret@postgres:5432/rank_monitor",
  REDIS_URL: "redis://redis:6379",
  AUTH_SECRET: "synthetic-test-secret-".repeat(2),
  APP_ORIGIN: "https://rank.example.com",
  APP_DOMAIN: "rank.example.com",
  INITIAL_ADMIN_EMAIL: "admin@example.com",
  METERING_MODE: "disabled",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "mailer@example.com",
  SMTP_PASSWORD: "secret",
  SMTP_FROM: "Rank Monitor <mailer@example.com>",
};

describe("生产环境配置", () => {
  it("接受通用 SMTP STARTTLS 配置和默认关闭的钱包", () => {
    expect(validateProductionEnvironment(validEnvironment)).toMatchObject({
      domain: "rank.example.com",
      meteringMode: "disabled",
      smtp: { host: "smtp.example.com", port: 587, secure: false },
    });
  });

  it("缺失必要配置时明确拒绝启动", () => {
    expect(() => validateProductionEnvironment({ ...validEnvironment, APP_DOMAIN: undefined })).toThrow("APP_DOMAIN");
    expect(() => validateProductionEnvironment({ ...validEnvironment, AUTH_SECRET: "short" })).toThrow("32 个字符");
  });

  it("拒绝域名不一致和无效 SMTP 安全模式", () => {
    expect(() => validateProductionEnvironment({ ...validEnvironment, APP_DOMAIN: "other.example.com" })).toThrow("不一致");
    expect(() => smtpConfig({ ...validEnvironment, SMTP_SECURE: "auto" })).toThrow("true 或 false");
  });
});
