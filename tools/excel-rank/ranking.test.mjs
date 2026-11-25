import test from 'node:test';
import assert from 'node:assert/strict';
import {assignGridPositions} from './grid.mjs';
import {rankTarget} from './ranking.mjs';

const asin = 'B000DEMO01', sibling = 'B000DEMO02', other = 'B000DEMO03', parent = 'B000PARENT';
const target = {childAsin:asin,keyword:'demo',parentAsin:parent,sameParentMatch:true};
const card = (id, ad, x, y) => ({asin:id, sponsored:ad, x, y, width:100, height:100});
const row = (...slots) => slots.map(([id, ad], i) => card(id, ad, i*105, 100));
const page = (n, raw) => ({page:n, keyword:'demo', completed:true,cards:assignGridPositions(raw)});
const empty = n => page(n,row([other,false]));
const family = {[asin]:{completed:true,verifiedParentAsin:parent,siblingAsins:[asin,sibling]}};

test('4+1 excludes the whole row only from organic numbering; mixed rows preserve columns', () => {
  const cards = assignGridPositions([...row([asin,true],[sibling,true],[other,false],[asin,true],[asin,true]),
    card(asin,true,0,300),card(sibling,false,105,300)]);
  assert.equal(cards[2].naturalRow,null);
  assert.deepEqual([cards[6].visualColumn,cards[6].visualRow,cards[6].naturalRow,cards[6].naturalOrdinal],[2,2,1,1]);
});
test('each channel prefers direct child and overlap compares physical rows across all eligible pairs', () => {
  const pages = [page(1,row([sibling,false],[asin,true])),
    page(2,row([asin,false],[other,true])), empty(3)];
  const result = rankTarget(target,{pages,details:family});
  assert.equal(result.organic.page,2);
  assert.equal(result.sponsored.page,1);
  assert.equal(result.overlap,'同排');
  assert.equal(result.differentVariants,true);
});
test('partial pages prove only an earliest direct hit with a complete prefix', () => {
  const pages = [page(1,row([sibling,false],[asin,true])), page(3,row([asin,false]))];
  const result = rankTarget(target,{pages,details:family});
  assert.equal(result.sponsored.state,'已完成');
  assert.equal(result.organic.state,'未完成');
});
test('unverified family or missing page stays unknown; cross-page hits never count as adjacent', () => {
  const pages = [page(1,row([sibling,false],[sibling,true])),empty(2),empty(3)];
  assert.equal(rankTarget(target,{pages,details:{}}).organic.state,'未完成');
  assert.equal(rankTarget({...target,sameParentMatch:false},{pages}).organic.state,'暂无');
  assert.equal(rankTarget({...target,sameParentMatch:false},{pages:pages.slice(1)}).organic.state,'未完成');
  const separate = [page(1,row([asin,false])),page(2,row([asin,true])),empty(3)];
  assert.equal(rankTarget(target,{pages:separate,details:family}).overlap,'不同排');
});
test('malformed layout and ambiguous ad classification fail closed', () => {
  assert.throws(() => assignGridPositions([card(asin,null,0,0)]));
  assert.throws(() => assignGridPositions([card(asin,false,0,0),card(other,true,0,0)]));
});
