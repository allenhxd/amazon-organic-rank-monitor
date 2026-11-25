const key = (...parts) => JSON.stringify(parts);
const keywordKey = value => value.trim().replace(/\s+/g,' ').toLowerCase();

function by(rows, groupOf) {
  const groups = new Map();
  for (const row of rows) {
    const name = groupOf(row);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }
  return [...groups.values()];
}
const observed = (row, index) => row[index] === '已完成' || row[index] === '暂无';
const byDate = (a,b) => String(a[0]).localeCompare(String(b[0]));
function change(previous, current, i) {
  if (!observed(current, i)) return '未完成';
  if (!previous) return '首次有效记录';
  if (previous[i] === '暂无' && current[i] === '已完成') return '进入前三页';
  if (previous[i] === '已完成' && current[i] === '暂无') return '离开前三页';
  if (current[i] === '暂无') return '均未出现';
  for (const [offset, unit] of [[1,'页'],[2,'排']]) {
    const delta = Number(current[i+offset]) - Number(previous[i+offset]);
    if (delta !== 0) return (delta > 0 ? '后移 ' : '前移 ') + Math.abs(delta) + ' ' + unit;
  }
  return '同一页/排';
}

export function analysisTables({rank, rating}) {
  const movement = [['监测日期','子ASIN','关键词','上次有效自然日期','自然位变化','上次有效广告日期','广告位变化','有效自然日期数']];
  const compare = [['监测日期','类目','关键词','类型','子ASIN','自然状态','自然页','自然排','广告状态','广告页','广告视觉排','自然与广告靠近']];
  const shares = [['监测日期','评分主体ASIN','上次有效日期','状态','星级变化','评分数变化', ...[5,4,3,2,1].map(s => s + '星占比变化(百分点)')]];
  for (const group of by(rank,r => key(r[1],keywordKey(r[2])))) {
    group.sort(byDate);
    const current = group.at(-1);
    const prior = group.slice(0,-1);
    const n = prior.findLast(r => observed(r,7)), a = prior.findLast(r => observed(r,12));
    movement.push([current[0],current[1],current[2],n?.[0],change(n,current,7),a?.[0],change(a,current,12),group.filter(r => observed(r,7)).length]);
  }
  for (const group of by(rank,r => key(r[3],keywordKey(r[2])))) {
    const day = group.reduce((last,r) => last < r[0] ? r[0] : last,'');
    const best = group.filter(r => r[0] === day).sort((a,b) =>
      (a[8] ?? Infinity) - (b[8] ?? Infinity) || (a[9] ?? Infinity) - (b[9] ?? Infinity) || a[1].localeCompare(b[1]));
    for (const r of best) compare.push([r[0],r[3],r[2],r[4],r[1],...r.slice(7,10),...r.slice(12,15),r[17]]);
  }
  for (const group of by(rating,r => r[1])) {
    group.sort(byDate);
    const current = group.at(-1);
    const previous = group.slice(0,-1).findLast(r => r[2] === '已完成');
    const valid = current[2] === '已完成';
    const delta = i => valid && Number.isFinite(previous?.[i]) && Number.isFinite(current[i])
      ? Number((current[i] - previous[i]).toFixed(2)) : null;
    shares.push([current[0],current[1],previous?.[0],valid ? (previous ? '可比较' : '首次有效记录') : '未完成',
      ...[3,4,5,6,7,8,9].map(delta)]);
  }
  return [{name:'CLI同词对比',slug:'comparison',rows:compare},{name:'CLI排名变化',slug:'movement',rows:movement},
    {name:'CLI评分变化',slug:'rating-change',rows:shares}];
}
