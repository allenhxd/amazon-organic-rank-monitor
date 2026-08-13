"use client";

import { CircleHelp, Coins, CreditCard, Snowflake, Undo2 } from "lucide-react";
import { useAppSnapshot } from "@/components/app-provider";
import { Notice } from "@/components/ui";

export default function WalletPage() {
  const { snapshot } = useAppSnapshot();
  const { wallet } = snapshot;
  if (!snapshot.meteringEnabled) return <div className="section-page"><h1 className="section-title">点数</h1><Notice>钱包计量功能未启用。请由实例管理员设置 <code>METERING_MODE=wallet</code> 后重启服务。</Notice></div>;
  return (
    <div className="section-page">
      <h1 className="section-title">点数</h1>
      <p className="section-subtitle">自托管实例的可选请求计量账本。</p>
      <div className="stat-grid">
        <WalletStat icon={<Coins />} label="可用点数" value={`${wallet.available.toLocaleString("zh-CN")} 点`} />
        <WalletStat icon={<Snowflake />} label="冻结点数" value={`${wallet.frozen.toLocaleString("zh-CN")} 点`} />
        <WalletStat icon={<CreditCard />} label="累计消耗" value={`${wallet.consumed.toLocaleString("zh-CN")} 点`} />
        <WalletStat icon={<Undo2 />} label="累计退回" value={`${wallet.refunded.toLocaleString("zh-CN")} 点`} />
      </div>
      <div className="content-grid-2">
        <section className="panel content-panel">
          <h2>计量状态</h2>
          <ul className="simple-list">
            <li><span>模式</span><strong className="status-success">wallet</strong></li>
            <li><span>费率版本</span><strong>{snapshot.rateConfig.version}</strong></li>
            <li><span>配额调整</span><strong>由实例管理员操作</strong></li>
          </ul>
        </section>
        <section className="panel content-panel">
          <h2>计量边界</h2>
          <p className="section-subtitle" style={{ lineHeight: 1.75 }}>点数只是此实例内部的请求计量，不代表任何外部平台余额，也不会向第三方自动付款。</p>
          <div className="notice notice-info"><CircleHelp size={17} />关闭钱包模式后仍会记录实际成功请求数量。</div>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-heading"><h2>点数流水</h2></div>
        <div className="results-wrap" style={{ paddingTop: 12 }}>
          <table className="data-table">
            <thead><tr><th>时间</th><th>类型</th><th>变动</th><th>变动后可用</th><th>关联任务</th><th>原因</th><th>操作人</th></tr></thead>
            <tbody>{snapshot.ledger.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.createdAt).toLocaleString("zh-CN", { hour12: false })}</td><td>{entry.kind}</td>
                <td className={entry.amount >= 0 ? "status-success" : "status-warning"}>{entry.amount >= 0 ? "+" : ""}{entry.amount}</td>
                <td>{entry.balanceAfter}</td><td>{entry.referenceId || "--"}</td><td className="left">{entry.reason}</td><td>{entry.actor}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function WalletStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="stat-card wallet-stat"><span className="stat-icon">{icon}</span><span>{label}</span><strong>{value}</strong></div>;
}
