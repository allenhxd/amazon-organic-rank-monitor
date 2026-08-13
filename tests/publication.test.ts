import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseImportWorkbook } from "@/server/imports";

const root = path.resolve(".");
const toArrayBuffer = (buffer: Buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

describe("开源发布内容", () => {
  it("管理员初始化审计 SQL 对复用 UUID 参数使用一致类型", async () => {
    const source = await fs.readFile(path.join(root, "src/server/postgres-store.ts"), "utf8");
    expect(source).toContain("VALUES ($1::uuid, 'ADMIN_CREDENTIAL_CREATED', 'ADMIN_CREDENTIAL', $1::uuid::text, $2::jsonb)");
  });

  it("模板与演示数据库只包含允许的合成 ASIN", async () => {
    const template = await fs.readFile(path.join(root, "public/自然排名监控导入模板.xlsx"));
    const imported = parseImportWorkbook(toArrayBuffer(template));
    const templateAsins = imported.validRows.flatMap((row) => [row.childAsin, row.parentAsin].filter(Boolean));
    expect(templateAsins.every((asin) => /^B000(?:DEMO\d{2}|PARENT)$/.test(String(asin)))).toBe(true);

    const demoSource = await fs.readFile(path.join(root, "src/server/demo-store.ts"), "utf8");
    const demoAsins = demoSource.match(/\bB[A-Z0-9]{9}\b/g) || [];
    expect(demoAsins.length).toBeGreaterThan(0);
    expect(demoAsins.every((asin) => /^B000(?:DEMO\d{2}|PAREN[2T])$/.test(asin))).toBe(true);
  });

  it("导出列不包含广告排名字段", async () => {
    const route = await fs.readFile(path.join(root, "src/app/api/exports/[runId]/route.ts"), "utf8");
    expect(route).not.toMatch(/广告排名|sponsoredRank|adRank/i);
  });

  it("模板无个人作者元数据或宏内容", async () => {
    const bytes = await fs.readFile(path.join(root, "public/自然排名监控导入模板.xlsx"));
    const workbook = XLSX.read(bytes, { type: "buffer", bookProps: true, bookVBA: true });
    const properties = JSON.stringify(workbook.Props || {});
    expect(properties).not.toMatch(/hanxiangdong|allenhxd|@qq\.com|maixora/i);
    expect(workbook.vbaraw).toBeUndefined();
  });

  it("示例配置不包含可用秘密或特定业务域名", async () => {
    const paths = [".env.example", ".env.production.example", "docker-compose.yml", "infra/Caddyfile"];
    const text = (await Promise.all(paths.map((file) => fs.readFile(path.join(root, file), "utf8")))).join("\n");
    expect(text).not.toMatch(/maixora|smtp\.qq\.com|BEGIN (RSA |OPENSSH )?PRIVATE KEY/i);
    expect(text).toMatch(/replace-with/);
  });
});
