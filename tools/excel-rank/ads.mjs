// Request only read operations against Amazon's US advertising API.
const api = 'https://advertising-api.amazon.com';
const resources = { campaigns: 'Campaign', adGroups: 'AdGroup', productAds: 'ProductAd', keywords: 'Keyword' };
const normalize = text => String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const key = row => JSON.stringify([row.childAsin, normalize(row.keyword)]);
const group = row => JSON.stringify([String(row.campaignId), String(row.adGroupId)]);
const enabled = row => row.state?.toUpperCase() === 'ENABLED';
const unique = (map, key, value) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
};

export async function fetchAdSnapshot(env = process.env, send = fetch) {
  const client = env.AMAZON_ADS_CLIENT_ID;
  const token = env.AMAZON_ADS_ACCESS_TOKEN;
  const profile = env.AMAZON_ADS_PROFILE_ID;
  if (!client || !token || !/^\d+$/.test(profile ?? '')) throw Error('Set AMAZON_ADS_CLIENT_ID, AMAZON_ADS_ACCESS_TOKEN and AMAZON_ADS_PROFILE_ID.');
  const headers = { 'Amazon-Advertising-API-ClientId': client, Authorization: 'Bearer ' + token };
  async function request(path, options) {
    const result = await send(api + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!result.ok) throw Error(path + ' returned HTTP ' + result.status);
    return result.json();
  }
  const profiles = await request('/v2/profiles', {headers});
  if (!Array.isArray(profiles) || !profiles.some(p => String(p.profileId) === profile && p.countryCode === 'US')) throw Error('A verified US advertising profile is required.');
  const config = { countryCode: 'US', date: new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Los_Angeles' }) };
  for (const [key, type] of Object.entries(resources)) {
    const mime = 'application/vnd.sp' + type + '.v3+json';
    const rows = [];
    const seen = new Set();
    let nextToken;
    do {
      const page = await request('/sp/' + key + '/list', { method: 'POST',
        headers: { ...headers, 'Amazon-Advertising-API-Scope': profile, Accept: mime, 'Content-Type': mime },
        body: JSON.stringify({ stateFilter: {include:['ENABLED']}, maxResults: 100, nextToken })
      });
      if (!Array.isArray(page[key])) throw Error('Incomplete response for ' + key);
      rows.push(...page[key]);
      nextToken = page.nextToken;
      if (nextToken && seen.has(nextToken)) throw Error('Repeated page for ' + key);
      seen.add(nextToken);
      if (!nextToken && page.totalResults != null && Number(page.totalResults) !== rows.length) throw Error('Incomplete pagination for ' + key);
    } while (nextToken);
    config[key] = rows;
  }
  return config;
}

export function expandKeywords(rows, config) {
  if (config.countryCode !== 'US' || !/^\d{4}-\d{2}-\d{2}$/.test(config.date) ||
      !Object.keys(resources).every(k => Array.isArray(config[k]))) throw Error('Expected a dated US Sponsored Products configuration snapshot.');
  const day = config.date.replaceAll('-', '');
  const campaigns = new Set(config.campaigns.filter(c => enabled(c) && String(c.targetingType).toUpperCase() === 'MANUAL' &&
    (!c.startDate || String(c.startDate).replaceAll('-', '') <= day) &&
    (!c.endDate || String(c.endDate).replaceAll('-', '') >= day)).map(c => String(c.campaignId)));
  const groups = new Set(config.adGroups.filter(g => enabled(g) && campaigns.has(String(g.campaignId))).map(group));
  const byGroup = new Map();
  for (const word of config.keywords) {
    if (enabled(word) && groups.has(group(word)) && ['EXACT','PHRASE','BROAD'].includes(String(word.matchType).toUpperCase()) && word.keywordText?.trim()) {
      unique(byGroup, group(word), word.keywordText.trim());
    }
  }
  const byProduct = new Map();
  for (const product of config.productAds.filter(enabled)) {
    for (const term of byGroup.get(group(product)) ?? []) unique(byProduct, product.asin, term);
  }
  const byCategory = new Map();
  for (const row of rows.filter(r => r.enabled && r.type === '自有')) {
    for (const term of byProduct.get(row.childAsin) ?? []) unique(byCategory, row.category, term);
  }
  const seen = new Set(rows.map(key));
  const additions = [];
  for (const row of rows.filter(r => r.enabled)) {
    const terms = row.type === '竞品' ? byCategory.get(row.category) : byProduct.get(row.childAsin);
    for (const keyword of terms ?? []) {
      const next = { ...row, keyword };
      if (!seen.has(key(next))) {
        additions.push(next);
        seen.add(key(next));
      }
    }
  }
  return additions;
}
