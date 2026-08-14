"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileSpreadsheet, Grid3X3 } from "lucide-react";

const tabs = [
  ["quick-start", "快速开始"], ["manual", "手动录入"], ["template", "批量导入"], ["ranking", "排名口径"],
  ["status", "结果状态"], ["variance", "偏差与可比性"], ["billing", "监控额度"], ["faq", "常见问题"],
] as const;
type TabId = typeof tabs[number][0];

function validTab(value: string | null): TabId {
  return tabs.some(([id]) => id === value) ? value as TabId : "quick-start";
}

export default function GuidePage() { return <Suspense fallback={null}><GuideContent /></Suspense>; }

function GuideContent() {
  const search = useSearchParams();
  const [selected, setSelected] = useState<TabId | null>(null);
  const active = selected || validTab(search.get("tab"));
  const select = (id: TabId) => {
    setSelected(id);
    window.history.replaceState(null, "", `${window.location.pathname}?tab=${id}`);
  };
  return <div className="public-guide-page">
    <header className="public-guide-header"><Link className="landing-brand" href="/"><Grid3X3 size={23} /><span>亚马逊排名监控<small>自然排名监控工具</small></span></Link><div><Link className="button" href="/"><ArrowLeft size={15} />返回网站首页</Link><Link className="button button-primary" href="/projects">登录工具</Link></div></header>
    <main className="guide-page"><h1>使用说明</h1><p className="guide-lead">从注册试用、录入 ASIN 到理解自然排名结果的完整指南</p>
      <nav className="guide-tabs" aria-label="使用说明目录" role="tablist">{tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={active === id} className={active === id ? "active" : ""} onClick={() => select(id)}>{label}</button>)}</nav>
      <div role="tabpanel" className="guide-panel">{active === "quick-start" ? <QuickStart /> : active === "manual" ? <Manual /> : active === "template" ? <Template /> : active === "ranking" ? <Ranking /> : active === "status" ? <Status /> : active === "variance" ? <Variance /> : active === "billing" ? <Billing /> : <Faq />}</div>
    </main>
  </div>;
}

function QuickStart() { return <section className="guide-section"><h2>快速开始</h2><ol className="guide-bullets"><li>使用邮箱验证码登录；新邮箱验证后自动创建试用账号。</li><li>选择已开放站点，再从常用地区列表选择邮编或手动输入合法邮编。</li><li>手动添加、批量粘贴或导入 Excel。试用最多 5 个 ASIN＋关键词组合和 5 个唯一关键词。</li><li>确认预计请求与监控额度后执行。试用固定扫描 1 页。</li><li>查看自然排名、状态、运行凭证和 Excel 导出。</li></ol></section>; }
function Manual() { return <section className="guide-section"><h2>手动录入</h2><ul className="guide-bullets"><li>必填：类目、类型、子 ASIN、产品简称和关键词。</li><li>父 ASIN、同父体匹配和备注为可选项。</li><li>一个 ASIN 可填写多个关键词；每个 ASIN＋关键词算一个监控组合。</li><li>精确子 ASIN 始终优先，同父体只有在详情页验证父子关系后才扩展匹配。</li></ul></section>; }
function Template() { return <section className="guide-section"><h2>批量导入</h2><ul className="guide-bullets"><li>模板只有“填写说明”和“导入数据”两张工作表。</li><li>5 个必填列：类目、类型、子ASIN、产品简称、关键词。</li><li>3 个选填列：父ASIN、同父体匹配、备注。</li><li>每行只填 1 个关键词；同一 ASIN 多个关键词时复制信息另起一行。</li><li>文件不超过 5MB、最多 10,000 行；系统先校验，错误行不写入。</li></ul><a className="guide-link" href="/自然排名监控导入模板.xlsx" download><FileSpreadsheet size={16} />下载简化模板</a></section>; }
function Ranking() { return <section className="guide-section"><h2>自然排名口径</h2><ul className="guide-bullets"><li>固定云端浏览器 1920×1080、100% 缩放、DPR 1；物理显示器尺寸不是统计条件。</li><li>系统按页面卡片实际坐标从左到右、从上到下记录。</li><li>Sponsored、Patrocinado 等广告卡片全部排除，不生成或导出广告排名。</li><li>“自然排”是固定会话中的观察位置，不是 Amazon 提供的绝对排名。</li></ul></section>; }
function Status() { return <section className="guide-section"><h2>结果状态</h2><table className="guide-table status-definition"><thead><tr><th>状态</th><th>定义</th></tr></thead><tbody><tr><td className="status-success">已完成</td><td>要求的页面与证据链均成功</td></tr><tr><td className="status-muted">暂无</td><td>要求页数全部成功，但没有找到目标</td></tr><tr><td className="status-warning">未完成</td><td>页面、邮编、验证码、分类或证据链有任一失败，结果未知</td></tr></tbody></table><p>失败任务不会用 0、旧值或猜测值填补，也不会覆盖当天已有有效结果。</p></section>; }
function Variance() { return <section className="guide-section"><h2>偏差与可比性</h2><div className="variance-warning"><AlertTriangle size={20} /><div><strong>同一关键词两次结果可能略有差异</strong><p>广告数量和位置、Amazon 页面实验、实时排序、库存和配送信息都可能改变当次页面组成。固定站点、邮编与浏览器环境可提高趋势可比性，但不能保证完全消除波动。</p></div></div><p>建议用多个有效监控日期观察趋势；少于 5 次有效运行时按低置信度解读。</p></section>; }
function Billing() { return <section className="guide-section"><h2>监控额度与会员</h2><ul className="guide-bullets"><li>额度计量由自托管实例管理员选择启用；本项目不内置售价、支付商户或自动续费配置。</li><li>搜索页、ASIN 详情页、评分主体每成功请求一次各消耗 1 额度。</li><li>创建任务先冻结预计额度，完成后按实际成功请求结算，未执行部分退回。</li><li>额度用于浏览器采集，不是大模型 Token。用户自带 AI API 时，模型费用由用户承担，但浏览器监控仍可按实例规则计量。</li><li>当前版本不提供购买入口；管理员只能通过审计流水手动调整内部额度。</li></ul></section>; }
function Faq() { return <section className="guide-section"><h2>常见问题</h2><h3>支持哪些站点？</h3><p>美国站先开放；加拿大站、墨西哥站的适配已纳入系统，但只有真实搜索、邮编、广告排除、详情和评分回归通过后才会开放选择。</p><h3>为什么不能直接用大模型查排名？</h3><p>自然排名必须由自托管 Worker 实际打开 Amazon 搜索页观察；大模型只用于可选的结果分析，不能替代采集。</p><h3>AI API 为什么暂时不能绑定？</h3><p>实例必须先接入经过验证的密钥管理与信封加密方案。在此之前入口保持关闭，系统不接收或保存 API Key。</p></section>; }
