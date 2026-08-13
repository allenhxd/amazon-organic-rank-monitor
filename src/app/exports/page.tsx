"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { useAppSnapshot } from "@/components/app-provider";
import { EmptyState } from "@/components/ui";

export default function ExportsPage() {
  const { snapshot } = useAppSnapshot(); const completed = snapshot.runs.filter((run) => run.results.length);
  return <div className="section-page"><h1 className="section-title">导出</h1><p className="section-subtitle">下载简化导入模板或完整监控结果。</p><div className="content-grid-2"><section className="panel content-panel"><FileSpreadsheet size={30} color="#075be8" /><h2 style={{ marginTop: 12 }}>导入模板</h2><p className="section-subtitle">两张工作表、5 个必填列、3 个可选列。</p><a className="button button-primary" href="/自然排名监控导入模板.xlsx" download><Download size={16} />下载模板</a></section><section className="panel content-panel"><h2>历史结果</h2>{completed.length ? <ul className="simple-list">{completed.map((run) => <li key={run.id}><span><strong>{run.id}</strong><br/><small>{new Date(run.completedAt || run.requestedAt).toLocaleString("zh-CN", { hour12: false })}</small></span><a className="button" href={`/api/exports/${encodeURIComponent(run.id)}`}><Download size={15} />Excel</a></li>)}</ul> : <EmptyState title="暂无可导出结果" detail="监控任务完成后可下载完整 Excel。" />}</section></div></div>;
}
