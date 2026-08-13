"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAppSnapshot } from "@/components/app-provider";
import { EmptyState } from "@/components/ui";
import { formatNaturalRank } from "@/domain/monitoring";

export default function HistoryPage() { return <Suspense fallback={null}><HistoryContent /></Suspense>; }
function HistoryContent() {
  const params = useSearchParams(); const { snapshot } = useAppSnapshot(); const selectedId = params.get("run"); const run = snapshot.runs.find((item) => item.id === selectedId) || snapshot.runs.find((item) => item.results.length) || snapshot.runs[0];
  return <div className="section-page"><h1 className="section-title">历史</h1><p className="section-subtitle">每次任务保留固定环境、点数费率、执行状态和自然结果凭证。</p>{run ? <><div className="stat-grid"><Stat label="任务状态" value={run.status} /><Stat label="监控邮编" value={run.receipt.zipCode} /><Stat label="显示环境" value={`${run.receipt.viewport} / ${run.receipt.zoom}`} /><Stat label="费率版本" value={run.receipt.rateVersion} /></div><section className="panel" style={{ marginTop: 16 }}><div className="panel-heading"><h2>运行凭证：{run.id}</h2></div><div className="content-panel"><div className="receipt-grid"><span>协议版本</span><strong>{run.receipt.protocolVersion}</strong><span>浏览器会话</span><strong>未登录、隔离</strong><span>自然排名口径</span><strong>{run.receipt.rankingPolicy}</strong><span>广告排名字段</span><strong>不保存</strong></div></div></section><section className="panel" style={{ marginTop: 16 }}><div className="panel-heading"><h2>结果明细</h2></div>{run.results.length ? <div className="results-wrap" style={{ paddingTop: 12 }}><table className="data-table"><thead><tr><th>ASIN</th><th>关键词</th><th>页/自然排</th><th>实际展示ASIN</th><th>命中类型</th><th>状态</th><th>备注</th></tr></thead><tbody>{run.results.map((result) => <tr key={result.id}><td>{result.childAsin}</td><td className="left">{result.keyword}</td><td>{formatNaturalRank(result)}</td><td>{result.displayedAsin || "--"}</td><td>{result.matchType || "--"}</td><td>{result.state}</td><td className="left">{result.note || "--"}</td></tr>)}</tbody></table></div> : <EmptyState title="任务尚未产生结果" detail="等待任务完成或查看运行中的实时进度。" />}</section></> : <EmptyState title="暂无历史" detail="完成一次任务后会在这里生成运行凭证。" />}</div>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="stat-card"><span>{label}</span><strong style={{ fontSize: 18 }}>{value}</strong></div>; }
