"use client";

import Link from "next/link";
import { useAppSnapshot } from "@/components/app-provider";
import { EmptyState } from "@/components/ui";

export default function TasksPage() {
  const { snapshot } = useAppSnapshot();
  return <div className="section-page"><h1 className="section-title">任务</h1><p className="section-subtitle">查看当前队列、执行进度与监控额度结算状态。</p><section className="panel"><div className="panel-heading"><h2>任务列表</h2><div className="heading-actions"><Link className="button button-primary" href="/projects">新建监控任务</Link></div></div>{snapshot.runs.length ? <div className="results-wrap" style={{ paddingTop: 12 }}><table className="data-table"><thead><tr><th>任务ID</th><th>项目</th><th>状态</th><th>搜索进度</th><th>冻结额度</th><th>实际消耗</th><th>创建时间</th></tr></thead><tbody>{snapshot.runs.map((run) => <tr key={run.id}><td><Link className="guide-link" href={`/history?run=${encodeURIComponent(run.id)}`}>{run.id}</Link></td><td>{snapshot.projects.find((project) => project.id === run.projectId)?.name}</td><td className={run.status === "已完成" ? "status-success" : run.status === "未完成" ? "status-warning" : ""}>{run.status}</td><td>{run.progress.searchCompleted}/{run.progress.searchTotal}</td><td>{run.frozenPoints}</td><td>{run.consumedPoints}</td><td>{new Date(run.requestedAt).toLocaleString("zh-CN", { hour12: false })}</td></tr>)}</tbody></table></div> : <EmptyState title="暂无任务" detail="从项目页面创建第一个监控任务。" />}</section></div>;
}
