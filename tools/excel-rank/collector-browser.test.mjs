import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {collectWithSession, openSession} from './collector.mjs';
import {rankTarget} from './ranking.mjs';

// Set RANK_TEST_BROWSER=1 after installing Playwright Chromium. The optional
// executable path is useful when testing against an installed local Chrome.
const options = {skip: process.env.RANK_TEST_BROWSER !== '1'};
const child = 'B000DEMO01';
const other = 'B000DEMO02';
const target = {childAsin:child,keyword:'demo'};
const nav = '<span id="nav-link-accountList-nav-line-1">Hello, sign in</span><span id="nav-global-location-popover-link">Deliver to 96038</span>';
function html(url) {
  if (url.pathname === '/') return nav;
  if (url.pathname === '/s') return nav + '<div id="search"><div class="s-main-slot" style="display:flex">' +
    [child,other].map((asin,i) => '<article style="width:180px;height:100px" data-component-type="s-search-result" data-asin="'+asin+'"><h2>Demo</h2>'+
      (i ? '<span aria-label="Sponsored">Sponsored</span>':'')+'</article>').join('') +
    '</div></div><span class="s-pagination-selected">'+url.searchParams.get('page')+'</span>';
  return nav + '<input id="ASIN" value="'+child+'"><h1 id="productTitle">Demo</h1>' +
    '<span id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$19.95</span></span></span>'+
    '<span id="acrPopover" title="4.5 out of 5 stars"></span><span id="acrCustomerReviewText">2,000 ratings</span>'+
    '<div id="histogramTable"><a aria-label="80% of reviews have 5 stars"></a></div>';
}
async function replay(respond) {
  const urls = [];
  const browser = await chromium.launch({executablePath:process.env.RANK_TEST_CHROME || undefined});
  const evidence = await collectWithSession([target], () => openSession({browser,
    configureContext: async context => {
      // Every browser request, including incidental requests, terminates here.
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (!route.request().isNavigationRequest()) return route.abort();
        urls.push(url);
        return route.fulfill({contentType:'text/html',...respond(url)});
      });
    }}));
  return {urls,evidence};
}
test('collects and replays three synthetic US SERPs and observed product fields', options, async () => {
  const {urls,evidence} = await replay(url => ({body:html(url)}));
  assert.equal(evidence.reason,null);
  assert.deepEqual(urls.map(u => u.pathname),['/','/s','/s','/s','/dp/'+child,'/dp/'+child]);
  assert.ok(evidence.pages.every(p => p.completed));
  assert.equal(evidence.pages[0].cards[1].sponsored,true);
  assert.equal(rankTarget(target,evidence).organic.row,1);
  assert.equal(evidence.details[child].price,19.95);
  assert.equal(evidence.ratings[child].ratingCount,2000);
  assert.equal(evidence.ratings[child].histogram[5],80);
  assert.equal(evidence.ratings[child].histogram[1],null);
});
test('a challenge appearing during a grid wait stops before another navigation', options, async () => {
  const {urls,evidence} = await replay(url => ({body:url.pathname === '/' ? nav :
    nav + '<script>setTimeout(()=>{document.body.innerText="Robot Check"},400)</script>'}));
  assert.deepEqual(urls.map(u => u.pathname),['/','/s']);
  assert.equal(evidence.stopped,true);
  assert.match(evidence.reason,/验证码/);
});
test('a WAF response ends a batch without a follow-up request', options, async () => {
  const {urls,evidence} = await replay(() => ({status:202,headers:{'x-amzn-waf-action':'challenge'},body:'Please wait'}));
  assert.equal(urls.length,1);
  assert.equal(evidence.stopped,true);
  assert.match(evidence.reason,/限制访问/);
});
