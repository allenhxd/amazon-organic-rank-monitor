import test from 'node:test';
import assert from 'node:assert/strict';
import {collectWithSession,SiteStop} from './collector.mjs';

const a = 'B000DEMO01', b = 'B000DEMO02', parent = 'B000PARENT';
const targets = [a,b].map(childAsin => ({keyword:'demo',childAsin,parentAsin:parent}));
function fixture() {
  const calls = [];
  return {calls, async initialize() {}, async close() {calls.push('close');},
    async search(keyword,n) {calls.push([keyword,n]); return {completed:true,cards:[]};},
    async detail(id) {calls.push(id);return {completed:true,verifiedParentAsin:parent,siblingAsins:[a,b]};},
    async rating(id) {calls.push(id);return {completed:id !== parent,ratingCount:12,rating:4};}};
}
test('one search per page per keyword, one detail per child, one deterministic family rating fallback', async () => {
  const f = fixture();
  const evidence = await collectWithSession(targets,async () => f);
  assert.deepEqual(f.calls,[['demo',1],['demo',2],['demo',3],a,b,parent,a,'close']);
  assert.equal(evidence.stopped,false);
  assert.ok(evidence.ratings[parent].completed);
});
test('a site block stops every remaining page, child and rating request', async () => {
  const f = fixture();
  f.search = async (_,n) => {
    f.calls.push(n);
    if (n === 2) throw new SiteStop('CAPTCHA');
    return {completed:true,cards:[]};
  };
  const evidence = await collectWithSession(targets,async () => f);
  assert.deepEqual(f.calls,[1,2,'close']);
  assert.equal(evidence.pages.length,1);
  assert.equal(evidence.reason,'CAPTCHA');
  assert.deepEqual(evidence.ratings,{});
});
test('a site block during the parent rating does not fall back to the child', async () => {
  const f = fixture();
  f.rating = async id => {f.calls.push(id);throw new SiteStop('blocked');};
  const evidence = await collectWithSession(targets,async () => f);
  assert.deepEqual(f.calls.slice(-2),[parent,'close']);
  assert.equal(evidence.stopped,true);
});
