import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { makeTemplate, readTargets, buildReport, expandWatchlist } from './workbook.mjs';
import { fetchAdSnapshot, expandKeywords } from './ads.mjs';

const help = `US Excel dual-rank monitor
  pnpm excel-rank template WATCHLIST.xlsx
  pnpm excel-rank demo REPORT.xlsx
  pnpm excel-rank run WATCHLIST.xlsx EVIDENCE.json REPORT.xlsx
  pnpm excel-rank replay WATCHLIST.xlsx EVIDENCE.json REPORT.xlsx
  pnpm excel-rank ads-snapshot CONFIG.json
  pnpm excel-rank sync WATCHLIST.xlsx CONFIG.json UPDATED.xlsx

Use a new path for each output. demo, template, sync and replay run offline.
run opens Amazon.com. ads-snapshot reads a US Sponsored Products account.`;

async function input(file, maxBytes) {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw Error('Input must be a regular file within the size limit.');
    return await handle.readFile();
  } finally { await handle.close(); }
}

async function newOutput(file, extension) {
  if (path.extname(file).toLowerCase() !== extension) throw Error('Expected output ending in ' + extension);
  await fs.mkdir(path.dirname(file), {recursive: true});
  if (await fs.lstat(file).catch(e => { if (e.code !== 'ENOENT') throw e; })) throw Error('Output already exists: ' + file);
}

// A hard link publishes a fully written sibling file, atomically, without overwriting a concurrent result.
async function publish(file, data) {
  const temp = path.join(path.dirname(file), '.excel-rank-' + randomUUID() + '.tmp');
  await fs.writeFile(temp, data, {mode: 0o600, flag: 'wx'});
  try { await fs.link(temp, file); } finally { await fs.unlink(temp); }
}

function synthetic(targets) {
  const pages = [];
  const details = {};
  const ratings = {};
  for (const keyword of new Set(targets.map(t => t.keyword))) {
    const asin = targets.find(t => t.keyword === keyword).childAsin;
    for (const page of [1, 2, 3]) {
      const card = { asin: 'B000DEMO99', sponsored: false, visualRow: 1, visualColumn: 1, naturalRow: 1, naturalOrdinal: 1 };
      const cards = page === 1 ? [{...card, asin}, {...card, asin, sponsored:true, naturalRow:null, naturalOrdinal:null, visualColumn:2}] : [card];
      pages.push({keyword, page, completed:true, cards, zip:'96038', reason:null});
    }
    details[asin] = {completed:true, price:19.95, stock:'In stock', verifiedParentAsin:null, siblingAsins:[]};
    ratings[asin] = {completed:true, rating:4.5, ratingCount:20, histogram:{5:70,4:20,3:5,2:5,1:0}};
  }
  return {date:'2026-01-15', marketplace:'amazon.com', zip:'96038', pages, details, ratings, stopped:false, reason:null, source:'synthetic'};
}

function checkEvidence(evidence) {
  if (evidence?.marketplace !== 'amazon.com' || evidence.zip !== '96038' || !Array.isArray(evidence.pages) ||
      typeof evidence.stopped !== 'boolean' || !/^\d{4}-\d{2}-\d{2}$/.test(evidence.date) ||
      !Number.isFinite(Date.parse(evidence.date)) || new Date(evidence.date).toISOString().slice(0,10) !== evidence.date ||
      ![evidence.details, evidence.ratings].every(v => v && typeof v === 'object' && !Array.isArray(v))) {
    throw Error('Invalid US evidence envelope. Supply the JSON saved by run.');
  }
  const seen = new Set();
  for (const p of evidence.pages) {
    const key = JSON.stringify([p.keyword,p.page]);
    if (typeof p.keyword !== 'string' || ![1,2,3].includes(p.page) || typeof p.completed !== 'boolean' ||
        seen.has(key) || !Array.isArray(p.cards) || (p.completed && (!p.cards.length || p.zip !== evidence.zip))) throw Error('Invalid or duplicate search page');
    seen.add(key);
    const positions = new Set();
    for (const card of p.cards) {
      const pos = JSON.stringify([card.visualRow, card.visualColumn]);
      if (!/^[A-Z0-9]{10}$/.test(card.asin) || typeof card.sponsored !== 'boolean' ||
          positions.has(pos) || (card.naturalRow !== null && !(Number.isInteger(card.naturalRow) && card.naturalRow > 0)) ||
          (card.sponsored && card.naturalRow !== null) ||
          ![card.visualRow,card.visualColumn].every(n => Number.isInteger(n) && n > 0)) throw Error('Invalid grid evidence');
      positions.add(pos);
    }
  }
  return evidence;
}

async function main([command, ...args]) {
  if (!command || command === '--help' || command === '-h') { console.log(help); return; }
  const arity = {template:1, demo:1, run:3, replay:3, sync:3, 'ads-snapshot':1};
  if (!Object.hasOwn(arity,command) || arity[command] !== args.length) throw Error(help);
  const output = path.resolve(args.at(-1));
  await newOutput(output, command === 'ads-snapshot' ? '.json' : '.xlsx');
  if (command === 'template') return publish(output, await makeTemplate());
  if (command === 'ads-snapshot') return publish(output, JSON.stringify(await fetchAdSnapshot()));
  const bytes = command === 'demo' ? await makeTemplate() : await input(args[0], 64 * 1024 * 1024);
  if (command === 'sync') {
    const rows = await readTargets(bytes,{includeDisabled:true});
    const snapshot = JSON.parse(await input(args[1], 64 * 1024 * 1024));
    const extra = expandKeywords(rows,snapshot);
    await publish(output, await expandWatchlist(bytes,extra));
    console.log('Added keyword combinations: ' + extra.length);
    return;
  }
  const targets = await readTargets(bytes);
  if (!targets.length) throw Error('The watchlist has no enabled targets.');
  let evidence;
  if (command === 'demo') evidence = synthetic(targets);
  if (command === 'replay') evidence = JSON.parse(await input(args[1], 128 * 1024 * 1024));
  if (command === 'run') {
    const checkpoint = path.resolve(args[1]);
    await newOutput(checkpoint, '.json');
    const { collect } = await import('./collector.mjs');
    evidence = await collect(targets);
    await publish(checkpoint, JSON.stringify(evidence));
    console.log('Saved browser evidence to ' + checkpoint);
  }
  checkEvidence(evidence);
  await publish(output, await buildReport(bytes, targets, evidence, evidence.date));
  console.log('Saved ' + output);
  if (evidence.stopped) {
    console.error(evidence.reason || 'Collection stopped.');
    process.exitCode = 2;
  }
}

main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
