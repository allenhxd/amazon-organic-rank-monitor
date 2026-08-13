"use client";

import { FormEvent, useState } from "react";
import { Coins, Database, ServerCog, UsersRound } from "lucide-react";
import { useAppSnapshot } from "@/components/app-provider";
import { Loading, Notice } from "@/components/ui";

export function AdminDashboard() {
  const { snapshot, refresh } = useAppSnapshot();
  const [amount, setAmount] = useState("1000");
  const [reason, setReason] = useState("管理员配额调整");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const running = snapshot.runs.filter((run) => ["等待中", "执行中"].includes(run.status)).length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/wallet-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: snapshot.currentUser.id, amount: Number(amount), reason }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "调整失败");
      await refresh();
      setMessage("点数调整已写入不可变流水。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section-page">
      <h1 className="section-title">管理后台</h1>
      <p className="section-subtitle">管理自托管实例的用户、运行队列与可选钱包计量。</p>
      <div className="stat-grid">
        <AdminStat icon={<UsersRound />} label="用户数" value={String(snapshot.users.length)} />
        <AdminStat icon={<Coins />} label={snapshot.meteringEnabled ? "用户可用点数" : "钱包计量"} value={snapshot.meteringEnabled ? snapshot.wallet.available.toLocaleString("zh-CN") : "未启用"} />
        <AdminStat icon={<ServerCog />} label="运行中任务" value={String(running)} />
        <AdminStat icon={<Database />} label="成功请求" value={String(snapshot.runs.reduce((sum, run) => sum + run.progress.searchCompleted + run.progress.detailCompleted + run.progress.ratingCompleted, 0))} />
      </div>

      {snapshot.meteringEnabled ? (
        <div className="content-grid-2">
          <section className="panel content-panel">
            <h2>人工配额调整</h2>
            <form onSubmit={submit} className="form-grid">
              <div className="field"><label>用户</label><select value={snapshot.currentUser.id} disabled><option value={snapshot.currentUser.id}>{snapshot.currentUser.name}（{snapshot.currentUser.email}）</option></select></div>
              <div className="field"><label>调整点数</label><input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
              <div className="field span-2"><label>原因（必填）</label><input value={reason} onChange={(event) => setReason(event.target.value)} /></div>
              <div className="span-2"><button className="button button-primary" disabled={busy}>{busy ? <Loading /> : "确认并写入流水"}</button></div>
            </form>
            {message ? <div style={{ marginTop: 12 }}><Notice tone={message.includes("已写入") ? "success" : "danger"}>{message}</Notice></div> : null}
          </section>
          <section className="panel content-panel">
            <h2>点数费率</h2>
            <ul className="simple-list">
              <li><span>搜索页</span><strong>{snapshot.rateConfig.searchPage} 点/页</strong></li>
              <li><span>ASIN 详情页</span><strong>{snapshot.rateConfig.detailPage} 点/个</strong></li>
              <li><span>评分主体</span><strong>{snapshot.rateConfig.ratingSubject} 点/个</strong></li>
              <li><span>生效版本</span><strong>{snapshot.rateConfig.version}</strong></li>
            </ul>
          </section>
        </div>
      ) : <Notice>钱包计量未启用。任务不会冻结、扣除或退回点数，但实际成功请求数量仍会保存在运行凭证中。</Notice>}

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-heading"><h2>实例成本记录</h2></div>
        <div className="results-wrap" style={{ paddingTop: 12 }}>
          <table className="data-table"><thead><tr><th>类别</th><th>期间</th><th>实际金额（CNY）</th><th>使用说明</th><th>状态</th><th>数据来源</th></tr></thead><tbody>{snapshot.costCenter.map((item) => <tr key={item.id}><td>{item.category}</td><td>{item.period}</td><td>{item.amountCny === null ? "待录入" : item.amountCny.toFixed(2)}</td><td className="left">{item.usage}</td><td>{item.providerStatus}</td><td className="left">{item.source}</td></tr>)}</tbody></table>
        </div>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-heading"><h2>用户</h2></div>
        <div className="results-wrap" style={{ paddingTop: 12 }}>
          <table className="data-table"><thead><tr><th>用户</th><th>邮箱</th><th>角色</th><th>状态</th></tr></thead><tbody>{snapshot.users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role}</td><td>{user.membershipStatus}</td></tr>)}</tbody></table>
        </div>
      </section>
    </div>
  );
}

function AdminStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="stat-card admin-stat"><span className="stat-icon">{icon}</span><span>{label}</span><strong>{value}</strong></div>;
}
