import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseImportWorkbook, validateOoxmlPackage } from "@/server/imports";

const toArrayBuffer = (buffer: Buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
const centralDirectoryOffsets = (buffer: Buffer) => {
  const offsets: number[] = [];
  for (let index = 0; index <= buffer.length - 4; index += 1) {
    if (buffer.readUInt32LE(index) === 0x02014b50) offsets.push(index);
  }
  return offsets;
};

function replaceBytes(buffer: Buffer, source: string, replacement: string) {
  expect(Buffer.byteLength(source)).toBe(Buffer.byteLength(replacement));
  const output = Buffer.from(buffer);
  let index = output.indexOf(Buffer.from(source));
  while (index >= 0) {
    output.set(Buffer.from(replacement), index);
    index = output.indexOf(Buffer.from(source), index + replacement.length);
  }
  return output;
}

describe("Excel 导入", () => {
  it("系统模板只有指定字段且示例行全部通过", async () => {
    const bytes = await fs.readFile(path.resolve("public/自然排名监控导入模板.xlsx"));
    const result = parseImportWorkbook(toArrayBuffer(bytes));
    expect(result.validRows).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.requiredHeaders).toEqual(["类目", "类型", "子ASIN", "产品简称", "关键词"]);
    expect(result.optionalHeaders).toEqual(["父ASIN", "同父体匹配", "备注"]);
  });

  it("拒绝缺少必填列的文件", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["类目", "类型"]]), "导入数据");
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    expect(() => parseImportWorkbook(toArrayBuffer(bytes))).toThrow("缺少必填列");
  });

  it("修正已知类目错字并排除重复组合", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["类目", "类型", "子ASIN", "产品简称", "关键词", "父ASIN", "同父体匹配", "备注"],
      ["仿粘帽", "自有", "B000DEMO01", "Demo Hat", "demo keyword", "", "否", ""],
      ["仿粘帽", "自有", "B000DEMO01", "Demo Hat", "demo keyword", "", "否", ""],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "导入数据");
    const result = parseImportWorkbook(toArrayBuffer(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })));
    expect(result.validRows[0].category).toBe("仿毡帽");
    expect(result.errors[0].message).toContain("重复");
  });

  it("拒绝损坏或伪装成 xlsx 的内容", () => {
    expect(() => validateOoxmlPackage(toArrayBuffer(Buffer.from("not a zip")))).toThrow("OOXML ZIP");
  });

  it("拒绝 OOXML 路径穿越、加密和宏条目", async () => {
    const template = await fs.readFile(path.resolve("public/自然排名监控导入模板.xlsx"));
    const traversal = replaceBytes(template, "xl/workbook.xml", "../workbook.xml");
    expect(() => validateOoxmlPackage(toArrayBuffer(traversal))).toThrow("不安全路径");

    const encrypted = Buffer.from(template);
    const firstCentral = centralDirectoryOffsets(encrypted)[0];
    encrypted.writeUInt16LE(encrypted.readUInt16LE(firstCentral + 8) | 0x1, firstCentral + 8);
    expect(() => validateOoxmlPackage(toArrayBuffer(encrypted))).toThrow("加密");

    const macro = replaceBytes(template, "xl/workbook.xml", "xl/vbaProj_.bin");
    expect(() => validateOoxmlPackage(toArrayBuffer(macro))).toThrow("宏");
  });

  it("拒绝异常条目数量和解压后大小", async () => {
    const template = await fs.readFile(path.resolve("public/自然排名监控导入模板.xlsx"));
    const oversized = Buffer.from(template);
    const firstCentral = centralDirectoryOffsets(oversized)[0];
    oversized.writeUInt32LE(33 * 1024 * 1024, firstCentral + 24);
    expect(() => validateOoxmlPackage(toArrayBuffer(oversized))).toThrow("解压后过大");

    const entryBomb = Buffer.from(template);
    let eocd = -1;
    for (let index = entryBomb.length - 22; index >= 0; index -= 1) {
      if (entryBomb.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
    }
    entryBomb.writeUInt16LE(2049, eocd + 8);
    entryBomb.writeUInt16LE(2049, eocd + 10);
    expect(() => validateOoxmlPackage(toArrayBuffer(entryBomb))).toThrow("条目数量异常");
  });

  it("拒绝超过 10,000 行的工作簿", () => {
    const workbook = XLSX.utils.book_new();
    const rows = Array.from({ length: 10_001 }, (_, index) => ["演示类目", "自有", "B000DEMO01", "Demo", `keyword-${index}`, "", "否", ""]);
    const sheet = XLSX.utils.aoa_to_sheet([["类目", "类型", "子ASIN", "产品简称", "关键词", "父ASIN", "同父体匹配", "备注"], ...rows]);
    XLSX.utils.book_append_sheet(workbook, sheet, "导入数据");
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true });
    expect(() => parseImportWorkbook(toArrayBuffer(bytes))).toThrow("10,000 行");
  });
});
