"use client";

import { BrainCircuit, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAppSnapshot } from "@/components/app-provider";

export default function SettingsPage() {
  const { snapshot } = useAppSnapshot();
  return <div className="section-page">
    <h1 className="section-title">设置</h1>
    <p className="section-subtitle">查看账户与扩展能力状态。</p>
    <section className="panel content-panel"><div className="settings-callout"><BrainCircuit size={30} /><div><h2>AI 分析不是自然排名采集的依赖</h2><p>排名由自托管 Playwright Worker 打开 Amazon 页面采集。AI 仅用于完成任务后的可选分析，不会补填或修改原始结果。</p></div></div></section>
    <div className="provider-grid">{snapshot.credentials.map((credential) => <section className="panel provider-card" key={credential.provider}><div className="provider-card-title"><KeyRound size={20} /><h2>{credential.provider}</h2><span className="provider-status">{credential.status}</span></div><p>支持用户自带 API，但必须先由管理员配置经过验证的密钥管理与信封加密。当前实例尚未配置，因此不接收或保存 API Key。</p><div className="masked-key"><LockKeyhole size={15} />{credential.maskedKey || "尚未绑定"}</div><div className="notice notice-info">密钥加密配置完成并通过测试后，这里才会显示绑定、验证和删除操作。</div></section>)}</div>
    <section className="panel content-panel" style={{ marginTop: 16 }}><h2>费用与安全边界</h2><ul className="guide-bullets"><li>自带 API 的模型费用由用户在对应厂商账户承担，平台不扣 AI 模型费用。</li><li>云端浏览器监控仍消耗监控额度，因为它会使用服务器 CPU、内存、带宽和任务队列。</li><li>API Key 不得出现在仓库、日志、导出或截图中；页面只能显示掩码。</li><li>支付商户号、证书和回调签名尚未配置，购买入口保持关闭。</li></ul><div className="notice notice-success" style={{ marginTop: 14 }}><ShieldCheck size={17} />AI 分析失败不会改变、覆盖或补填原始监控结果。</div></section>
  </div>;
}
