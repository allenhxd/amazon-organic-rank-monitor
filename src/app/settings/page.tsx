"use client";

import { BrainCircuit, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAppSnapshot } from "@/components/app-provider";

export default function SettingsPage() {
  const { snapshot } = useAppSnapshot();
  return <div className="section-page"><h1 className="section-title">设置</h1><p className="section-subtitle">查看当前实例的扩展能力状态。</p><section className="panel content-panel"><div className="settings-callout"><BrainCircuit size={30} /><div><h2>AI 分析不是自然排名采集的依赖</h2><p>当前仅保留可扩展接口，不进行任何真实模型调用。原始监控结果不会由 AI 补填。</p></div></div></section><div className="provider-grid">{snapshot.credentials.map((credential) => <section className="panel provider-card" key={credential.provider}><div className="provider-card-title"><KeyRound size={20} /><h2>{credential.provider}</h2><span className="provider-status">{credential.status}</span></div><p>如未来接入，部署者应选择适合自身环境的密钥管理服务，且不得记录或导出明文密钥。</p><div className="masked-key"><LockKeyhole size={15} />{credential.maskedKey || "尚未绑定"}</div><button className="button" disabled>当前未启用</button></section>)}</div><section className="panel content-panel" style={{ marginTop: 16 }}><h2>安全边界</h2><ul className="guide-bullets"><li>自然排名采集不调用生成式 AI。</li><li>凭据只能通过环境变量或外部密钥管理系统注入。</li><li>仓库、日志、导出和截图均不得包含明文密钥。</li></ul><div className="notice notice-success" style={{ marginTop: 14 }}><ShieldCheck size={17} />AI 分析失败不会改变、覆盖或补填原始监控结果。</div></section></div>;
}
