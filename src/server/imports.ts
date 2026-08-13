import * as XLSX from "xlsx";
import { monitorItemInputSchema } from "@/domain/schemas";
import type { MonitorItem } from "@/domain/types";

const REQUIRED_HEADERS = ["类目", "类型", "子ASIN", "产品简称", "关键词"] as const;
const OPTIONAL_HEADERS = ["父ASIN", "同父体匹配", "备注"] as const;
const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS] as const;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ZIP_ENTRIES = 2_048;
const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 250;

export type ImportRow = Omit<MonitorItem, "id" | "projectId" | "enabled">;
export type ImportError = { row: number; field: string; value: string; message: string };

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseBoolean(value: unknown) {
  const normalized = text(value).toLocaleLowerCase("en-US");
  if (["是", "yes", "y", "true", "1"].includes(normalized)) return true;
  if (["", "否", "no", "n", "false", "0"].includes(normalized)) return false;
  throw new Error("请填写 是 或 否");
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const lowerBound = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= lowerBound; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

function safeZipPath(name: string) {
  if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[a-z]:/i.test(name)) return false;
  const segments = name.split("/");
  return !segments.some((segment) => segment === ".." || segment === ".");
}

export function validateOoxmlPackage(bytes: ArrayBuffer) {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new Error("文件不是有效的 OOXML ZIP 工作簿");
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new Error("OOXML ZIP 目录损坏或不完整");

  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
  const diskEntries = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== entryCount) throw new Error("不支持分卷 ZIP 工作簿");
  if ([entryCount, diskEntries].includes(0xffff) || [centralSize, centralOffset].includes(0xffffffff)) throw new Error("不支持 ZIP64 工作簿");
  if (entryCount < 1 || entryCount > MAX_ZIP_ENTRIES) throw new Error(`OOXML ZIP 条目数量异常（最多 ${MAX_ZIP_ENTRIES} 个）`);
  if (centralOffset + centralSize > eocdOffset) throw new Error("OOXML ZIP 中央目录越界");

  const names = new Set<string>();
  let offset = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw new Error("OOXML ZIP 中央目录条目损坏");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > eocdOffset) throw new Error("OOXML ZIP 文件名或扩展字段越界");
    if ((flags & 0x1) !== 0) throw new Error("不支持加密的 Excel 工作簿");
    if (![0, 8].includes(method)) throw new Error("OOXML ZIP 包含不支持的压缩方法");
    if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error("不支持 ZIP64 工作簿");

    let name: string;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(offset + 46, offset + 46 + nameLength));
    } catch {
      throw new Error("OOXML ZIP 包含无效文件名编码");
    }
    if (!safeZipPath(name)) throw new Error("OOXML ZIP 包含不安全路径");
    if (names.has(name)) throw new Error("OOXML ZIP 包含重复条目");
    names.add(name);
    const lowerName = name.toLocaleLowerCase("en-US");
    if (lowerName.endsWith(".bin") || lowerName.includes("vbaproject") || lowerName === "encryptedpackage" || lowerName === "encryptioninfo") {
      throw new Error("不支持宏、二进制或加密工作簿");
    }
    if (uncompressedSize > MAX_ENTRY_BYTES) throw new Error("OOXML ZIP 单个条目解压后过大");
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error("OOXML ZIP 解压后总大小异常");
    if (uncompressedSize > 5 * 1024 * 1024 && uncompressedSize / Math.max(1, compressedSize) > MAX_COMPRESSION_RATIO) {
      throw new Error("OOXML ZIP 压缩比异常，疑似解压膨胀文件");
    }
    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw new Error("OOXML ZIP 本地条目损坏");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    if (localOffset + 30 + localNameLength + localExtraLength + compressedSize > centralOffset) throw new Error("OOXML ZIP 条目数据越界");
    offset = nextOffset;
  }
  if (offset !== centralOffset + centralSize) throw new Error("OOXML ZIP 中央目录大小不一致");
  for (const required of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml"]) {
    if (!names.has(required)) throw new Error(`OOXML 工作簿缺少必要条目：${required}`);
  }
  return { entryCount, totalUncompressed };
}

export function parseImportWorkbook(bytes: ArrayBuffer) {
  validateOoxmlPackage(bytes);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "array", cellDates: false, bookVBA: false, WTF: true });
  } catch {
    throw new Error("Excel 工作簿损坏或无法安全解析");
  }
  const sheetName = workbook.SheetNames.find((name) => name.trim() === "导入数据");
  if (!sheetName) throw new Error("未找到“导入数据”工作表，请使用系统模板");
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (rawRows.length > 10_000) throw new Error("单次最多导入 10,000 行");
  const headerRow = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0, blankrows: false })[0] || [];
  const headers = new Set(headerRow.map(text));
  const missing = REQUIRED_HEADERS.filter((header) => !headers.has(header));
  if (missing.length) throw new Error(`缺少必填列：${missing.join("、")}`);

  const validRows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const seen = new Set<string>();

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2;
    if (ALL_HEADERS.every((header) => !text(raw[header]))) return;
    let sameParentMatch = false;
    try {
      sameParentMatch = parseBoolean(raw["同父体匹配"]);
    } catch (error) {
      errors.push({ row: rowNumber, field: "同父体匹配", value: text(raw["同父体匹配"]), message: (error as Error).message });
      return;
    }
    const parsed = monitorItemInputSchema.safeParse({
      category: text(raw["类目"]),
      productType: text(raw["类型"]),
      childAsin: text(raw["子ASIN"]),
      parentAsin: text(raw["父ASIN"]),
      productName: text(raw["产品简称"]),
      keyword: text(raw["关键词"]),
      sameParentMatch,
      notes: text(raw["备注"]),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] || "整行");
        errors.push({ row: rowNumber, field, value: "", message: issue.message });
      }
      return;
    }
    const key = `${parsed.data.childAsin}::${parsed.data.keyword.toLocaleLowerCase("en-US")}`;
    if (seen.has(key)) {
      errors.push({ row: rowNumber, field: "关键词", value: parsed.data.keyword, message: "文件内存在重复的 ASIN＋关键词" });
      return;
    }
    seen.add(key);
    validRows.push(parsed.data);
  });

  return {
    totalRows: rawRows.length,
    validRows,
    errors,
    requiredHeaders: REQUIRED_HEADERS,
    optionalHeaders: OPTIONAL_HEADERS,
  };
}
