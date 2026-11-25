import assert from 'node:assert/strict';
import test from 'node:test';
import { expandKeywords, fetchAdSnapshot } from './ads.mjs';

test('positive enabled US keywords propagate by active product and category, honoring disabled rows', () => {
  const g = {state:'ENABLED',campaignId:'1',adGroupId:'2'};
  const row = {enabled:true,type:'自有',childAsin:'B000DEMO01',category:'厨房',keyword:'existing'};
  const other = {...row,type:'竞品',childAsin:'B000DEMO02'};
  const snapshot = {countryCode:'US',date:'2026-01-15',campaigns:[{...g,targetingType:'MANUAL'}],adGroups:[g],
    productAds:[{...g,asin:row.childAsin}],keywords:[
      {...g,matchType:'EXACT',keywordText:'new'}, {...g,matchType:'NEGATIVE_EXACT',keywordText:'negative'},
      {...g,matchType:'BROAD',state:'PAUSED',keywordText:'paused'}, {...g,matchType:'PHRASE',adGroupId:'4',keywordText:'unrelated'}]};
  const rows = [row, other, {...row,enabled:false,keyword:'NEW'}];
  assert.deepEqual(expandKeywords(rows,snapshot), [{...other,keyword:'new'}]);
  assert.deepEqual(expandKeywords(rows,{...snapshot,campaigns:[{...g,targetingType:'AUTO'}]}), []);
});

test('refuses a mismatched marketplace before listing campaigns', async () => {
  const env = { AMAZON_ADS_CLIENT_ID:'demo', AMAZON_ADS_ACCESS_TOKEN:'demo', AMAZON_ADS_PROFILE_ID:'123' };
  const calls = [];
  const send = async (url, opts) => {
    calls.push(url);
    assert.equal(opts.redirect,'error');
    return {ok:true,json:async()=>[{profileId:123,countryCode:'CA'}]};
  };
  await assert.rejects(fetchAdSnapshot(env,send),/verified US/);
  assert.deepEqual(calls,['https://advertising-api.amazon.com/v2/profiles']);
});
