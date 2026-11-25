import XLSX from "xlsx";
import { posix } from "node:path";
import { validateOoxmlPackage } from "../../src/server/imports.ts";

const REL_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const SHEET_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";

export function checkPackage(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.length > 32 * 1024 * 1024) throw new Error("工作簿超过 32 MiB");
  validateOoxmlPackage(buffer);
  return buffer;
}

function part(zip, name) {
  const entry = XLSX.CFB.find(zip, "/" + name);
  if (!entry) throw new Error("缺少 OOXML 部件 " + name);
  return Buffer.from(entry.content);
}

function appendElement(xml, parent, makeChild) {
  const closing = new RegExp("</([\\w.-]+:)?" + parent + "\\s*>");
  if (!closing.test(xml)) throw new Error("无法定位 OOXML 元素 " + parent);
  return xml.replace(closing, (match, prefix) => makeChild(prefix || "") + match);
}

function elements(xml, tag) {
  return [...xml.matchAll(new RegExp("<(?:[\\w.-]+:)?" + tag + "(?=\\s)[^>]*>", "g"))].map(match => {
    const attributes = {};
    for (const [, attr, , value] of match[0].matchAll(/([^\s<>=]+)\s*=\s*(["'])(.*?)\2/gs)) {
      attributes[attr] = value;
    }
    return attributes;
  });
}

// Excel can renumber both worksheet paths and relationship IDs on save.
function worksheetPath(workbook, relationships, name) {
  const sheet = elements(workbook, "sheet").find(node => node.name === name);
  const rid = Object.entries(sheet || {}).find(([attribute]) => attribute.endsWith(":id"))?.[1];
  const rel = elements(relationships, "Relationship").find(entry => entry.Id === rid);
  if (!rel || rel.TargetMode === "External" || rel.Type !== REL_NAMESPACE + "/worksheet") throw new Error("无法定位工作表 " + name);
  const path = posix.resolve("/xl", rel.Target).slice(1);
  if (!path.startsWith("xl/worksheets/") || !path.endsWith(".xml")) throw new Error("工作表路径异常");
  return path;
}

// Generate independent sheet parts without importing style IDs or shared strings
// from a different workbook. Existing chart, table, style and worksheet parts
// stay byte-for-byte intact.
function sheetPart(rows) {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = rows[0].map((heading) => ({ wch: Math.min(52, Math.max(14, heading.length * 2 + 3)) }));
  sheet["!autofilter"] = { ref: sheet["!ref"] };
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  const zip = XLSX.CFB.read(XLSX.write(book, { type: "buffer", bookType: "xlsx", bookSST: false }), { type: "buffer" });
  return part(zip, "xl/worksheets/sheet1.xml");
}

export function withTables(bytes, existingNames, tables) {
  const updating = tables.filter(table => existingNames.includes(table.name)).map(table => table.name);
  if (updating.length) {
    const headers = XLSX.read(bytes, { type: "buffer", sheets: updating, sheetRows: 1, cellHTML: false });
    for (const table of tables.filter(table => updating.includes(table.name))) {
      const sheet = headers.Sheets[table.name];
      if (!sheet?.["!ref"] || XLSX.utils.decode_range(sheet["!ref"]).e.c > 255) throw new Error("报告表头异常：" + table.name);
      const [first] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (JSON.stringify(first) !== JSON.stringify(table.rows[0])) throw new Error("报告工作表表头不兼容：" + table.name);
    }
  }
  const zip = XLSX.CFB.read(bytes, { type: "buffer" });
  let workbook = part(zip, "xl/workbook.xml").toString("utf8");
  let relationships = part(zip, "xl/_rels/workbook.xml.rels").toString("utf8");
  let types = part(zip, "[Content_Types].xml").toString("utf8");
  let sheetId = Math.max(0, ...Array.from(workbook.matchAll(/\bsheetId\s*=\s*["'](\d+)["']/g), match => Number(match[1])));
  const put = (name, content) => XLSX.CFB.utils.cfb_add(zip, "/" + name, Buffer.from(content));
  for (const { name, slug, rows } of tables) {
    if (rows.length > 150_001) throw new Error("报告超出单表行数上限");
    const exists = existingNames.includes(name);
    const path = exists ? worksheetPath(workbook, relationships, name) : "xl/worksheets/excel-rank-" + slug + ".xml";
    const relationshipId = "rIdExcelRank_" + slug;
    if (!exists) {
      if (XLSX.CFB.find(zip, "/" + path) || elements(relationships, "Relationship").some(rel => rel.Id === relationshipId)) {
        throw new Error("工作簿已使用待添加报告的部件标识");
      }
      sheetId++;
      workbook = appendElement(workbook, "sheets", prefix =>
        '<' + prefix + 'sheet xmlns:r="' + REL_NAMESPACE + '" name="' + name + '" sheetId="' + sheetId + '" r:id="' + relationshipId + '"/>');
      relationships = appendElement(relationships, "Relationships", prefix =>
        '<' + prefix + 'Relationship Id="' + relationshipId + '" Type="' + REL_NAMESPACE + '/worksheet" Target="/' + path + '"/>');
      types = appendElement(types, "Types", prefix =>
        '<' + prefix + 'Override PartName="/' + path + '" ContentType="' + SHEET_CONTENT_TYPE + '"/>');
    }
    put(path, sheetPart(rows));
  }
  put("xl/workbook.xml", workbook);
  put("xl/_rels/workbook.xml.rels", relationships);
  put("[Content_Types].xml", types);
  const result = XLSX.CFB.write(zip, { type: "buffer", fileType: "zip", compression: true });
  return checkPackage(result);
}
