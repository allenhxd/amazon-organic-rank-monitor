import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import XLSX from 'xlsx';

test('template, replay and demo use local workbooks and protect the input and existing reports', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'excel-rank-test-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const file = name => path.join(dir,name);
  const cli = (...args) => execFileSync(process.execPath,['--import','tsx','tools/excel-rank/cli.mjs',...args],{stdio:'pipe'});
  cli('template',file('input.xlsx'));
  const original = fs.readFileSync(file('input.xlsx'));
  const evidence = {date:'2026-01-02',zip:'96038',marketplace:'amazon.com',pages:[],details:{},ratings:{},stopped:true,reason:'fixture stop'};
  fs.writeFileSync(file('fixture.json'),JSON.stringify(evidence));
  assert.throws(()=>cli('replay',file('input.xlsx'),file('fixture.json'),file('partial.xlsx')),error => error.status === 2);
  const partial = XLSX.read(fs.readFileSync(file('partial.xlsx')), {type:'buffer'});
  const rows = XLSX.utils.sheet_to_json(partial.Sheets['CLI排名历史']);
  assert.equal(rows[0]['自然状态'],'未完成');
  assert.equal(rows[0]['广告状态'],'未完成');
  assert.throws(()=>cli('demo',file('input.xlsx')),/Output already exists/);
  assert.deepEqual(original,fs.readFileSync(file('input.xlsx')));
  cli('demo',file('demo.xlsx'));
  const demo = XLSX.read(fs.readFileSync(file('demo.xlsx')), {type:'buffer'});
  assert.equal(XLSX.utils.sheet_to_json(demo.Sheets['CLI排名历史'])[0]['自然与广告靠近'],'同排');
});
