import Link from "next/link";
import { AlertTriangle, ArrowLeft, Database, FileSpreadsheet, FolderOpen, Grid3X3, ListChecks, MoveRight, SquareArrowOutUpRight } from "lucide-react";

const tabs = [
  ["quick-start", "快速开始"], ["manual", "手动录入"], ["template", "批量导入"], ["ranking", "排名口径"],
  ["status", "结果状态"], ["variance", "偏差与可比性"], ["billing", "可选计量"], ["faq", "常见问题"],
] as const;

export default function GuidePage() {
  return (
    <div className="public-guide-page">
      <header className="public-guide-header"><Link className="landing-brand" href="/"><Grid3X3 size={23} /><span>亚马逊排名监控<small>自然排名监控工具</small></span></Link><div><Link className="button" href="/"><ArrowLeft size={15} />返回网站首页</Link><Link className="button button-primary" href="/projects">登录工具</Link></div></header>
      <main className="guide-page">
      <h1>使用说明</h1>
      <p className="guide-lead">从录入 ASIN 到理解自然排名结果的完整指南</p>
      <nav className="guide-tabs" aria-label="使用说明目录">{tabs.map(([id, label], index) => <a key={id} className={index === 0 ? "active" : ""} href={`#${id}`}>{label}</a>)}</nav>

      <section id="quick-start" className="guide-section">
        <h2>1. 快速开始（四步完成一次自然排名监控）</h2>
        <div className="quick-steps">
          <GuideStep icon={<FolderOpen />} number={1} title="建立项目" text="创建项目并设置默认站点、邮编、扫描深度与排名口径。" />
          <MoveRight className="step-arrow" />
          <GuideStep icon={<ListChecks />} number={2} title="录入 ASIN 与关键词" text="手动添加或批量导入 ASIN 与关键词并确认。" />
          <MoveRight className="step-arrow" />
          <GuideStep icon={<Database />} number={3} title="确认请求并执行" text="系统预估页面请求数；如启用钱包计量，也会显示预计点数。" />
          <MoveRight className="step-arrow" />
          <GuideStep icon={<FileSpreadsheet />} number={4} title="查看结果与导出 Excel" text="查看执行进度、结果状态，并可导出完整结果到 Excel。" />
        </div>
      </section>

      <div className="guide-columns">
        <div>
          <section id="manual" className="guide-section">
            <h2>2. 录入方式对比</h2>
            <table className="guide-table"><thead><tr><th /><th>手动录入</th><th>批量导入</th></tr></thead><tbody>
              <tr><th>适用场景</th><td>少量或临时监控任务</td><td>大量或周期性监控任务</td></tr>
              <tr><th>操作方式</th><td>逐行添加 ASIN 与关键词</td><td>下载模板，按格式填写后上传</td></tr>
              <tr><th>校验与提示</th><td>实时校验、即时提示错误</td><td>批量校验、汇总提示错误</td></tr>
              <tr><th>效率</th><td>快速、灵活</td><td>高效、可复用</td></tr>
              <tr><th>模板</th><td>—</td><td>两张工作表（见右侧说明）</td></tr>
            </tbody></table>
          </section>

          <section id="ranking" className="guide-section">
            <h2>4. 排名口径（我们如何统计自然排名）</h2>
            <ul className="guide-bullets">
              <li>默认固定环境：1920×1080、100% 缩放、DPR 1。</li>
              <li>物理显示器 21 寸还是 27 寸，不作为统计口径。</li>
              <li>Amazon 每行实际展示数量可能因页面布局和模块变化而不同，系统按当次真实坐标记录。</li>
              <li>Sponsored 商品仅用于排除，不记录广告排名。</li>
              <li>精确子 ASIN 优先；仅在启用且父子关系已验证时使用同父体命中。</li>
            </ul>
            <div className="variance-warning"><AlertTriangle size={20} /><div><strong>为什么同一关键词两次结果可能略有差异？</strong><p>广告数量、广告位置、Amazon 页面实验和实时排序都可能改变当次页面组成。固定邮编与浏览器环境可提高趋势可比性，但不能保证消除所有波动。</p></div></div>
            <Link className="guide-link" href="#variance">查看偏差与可比性详情 <MoveRight size={16} /></Link>
          </section>
        </div>

        <div>
          <section id="template" className="guide-section">
            <h2>3. 批量导入模板说明</h2>
            <ul className="guide-bullets">
              <li>模板只有 2 张工作表：填写说明、导入数据。</li>
              <li>5 个必填列：类目、类型、子ASIN、产品简称、关键词。</li>
              <li>3 个选填列：父ASIN、同父体匹配、备注。</li>
              <li>每行只填 1 个关键词；同一 ASIN 有多个关键词时复制信息另起一行。</li>
              <li>最多 10,000 行、5MB；错误行可排除后仅导入有效行。</li>
            </ul>
            <a className="guide-link" href="/自然排名监控导入模板.xlsx" download><FileSpreadsheet size={16} />下载模板</a>
          </section>

          <section id="status" className="guide-section">
            <h2>5. 结果状态定义</h2>
            <table className="guide-table status-definition"><thead><tr><th>状态</th><th>定义</th></tr></thead><tbody>
              <tr><td className="status-muted">暂无</td><td>要求页数全部成功且没有匹配</td></tr>
              <tr><td className="status-warning">未完成</td><td>页面、邮编、分类或证据未完成，结果未知</td></tr>
              <tr><td className="status-success">已完成</td><td>全部要求成功完成，可能有匹配或无匹配</td></tr>
            </tbody></table>
          </section>

          <div className="guide-bottom-grid">
            <section id="billing" className="guide-section compact"><h2>6. 可选钱包计量</h2><p>钱包计量默认关闭。启用后按搜索页、详情页和评分主体冻结预计点数，并按实际成功请求结算；关闭时仅记录请求数量。</p></section>
            <section id="faq" className="guide-section compact"><h2>7. 需要帮助？</h2><p>如有使用问题或数据疑问，请联系管理员。任何无法确认的数据都会明确标记，不会猜测。</p><a className="guide-link" href="mailto:support@example.com">联系客服 <SquareArrowOutUpRight size={14} /></a></section>
          </div>
        </div>
      </div>

      <section id="variance" className="guide-section variance-section">
        <h2>偏差与可比性详细说明</h2>
        <div className="variance-grid"><div><strong>固定条件</strong><p>美国站、指定 5 位邮编、英文环境、未登录隔离会话、1920×1080、100% 缩放、DPR 1。</p></div><div><strong>仍可能变化</strong><p>广告数量与位置、Amazon A/B 实验、实时排序、库存与配送信息、搜索页面模块。</p></div><div><strong>正确解读</strong><p>单次结果是该次固定会话中的观察位置；趋势需要多个有效监控日期共同判断，少于 5 次时按低置信度处理。</p></div></div>
      </section>
      </main>
    </div>
  );
}

function GuideStep({ icon, number, title, text }: { icon: React.ReactNode; number: number; title: string; text: string }) {
  return <div className="guide-step"><div className="guide-step-icon">{icon}</div><div><strong><span>{number}</span>{title}</strong><p>{text}</p></div></div>;
}
