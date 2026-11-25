import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisTables} from './analytics.mjs';

test('rating deltas compare the same subject with the previous completed day and keep missing shares blank', () => {
  const rating = [['2026-01-01','B000DEMO01','已完成',4.4,100,60,null,10,10,10],
    ['2026-01-02','B000DEMO01','未完成'],['2026-01-03','B000DEMO01','已完成',4.5,110,65,10,10,null,10]];
  const table = analysisTables({rating,rank:[]}).find(t => t.slug === 'rating-change');
  assert.deepEqual(table.rows[1],['2026-01-03','B000DEMO01','2026-01-01','可比较',0.1,10,5,null,0,null,0]);
});
