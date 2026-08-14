"use client";

import {
  ChevronUp,
  CircleHelp,
  Download,
  FileSpreadsheet,
  FileUp,
  PencilLine,
  Plus,
  RotateCw,
  Trash2,
  Upload,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAppSnapshot } from "@/components/app-provider";
import { EmptyState, Loading, Modal, Notice, ProgressBar } from "@/components/ui";
import { estimatePoints } from "@/domain/pricing";
import { formatNaturalRank } from "@/domain/monitoring";
import { enabledMarketplaces, MARKETPLACES, type Marketplace } from "@/domain/marketplaces";
import type { CollectionDimensions, MonitorItem, MonitorRun, ProductType, Project } from "@/domain/types";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json() as ApiResponse<T>;
  if (!response.ok || !body.ok) throw new Error("error" in body ? body.error : "请求失败");
  return body.data;
}

type ItemGroup = {
  key: string;
  category: string;
  productType: ProductType;
  childAsin: string;
  parentAsin: string | null;
  productName: string;
  sameParentMatch: boolean;
  items: MonitorItem[];
};

function groupItems(items: MonitorItem[]): ItemGroup[] {
  const groups = new Map<string, ItemGroup>();
  for (const item of items.filter((candidate) => candidate.enabled)) {
    const key = [item.category, item.productType, item.childAsin, item.parentAsin || "", item.productName].join("::");
    const current = groups.get(key);
    if (current) current.items.push(item);
    else groups.set(key, {
      key,
      category: item.category,
      productType: item.productType,
      childAsin: item.childAsin,
      parentAsin: item.parentAsin,
      productName: item.productName,
      sameParentMatch: item.sameParentMatch,
      items: [item],
    });
  }
  return [...groups.values()];
}

const dimensions: Array<{ key: keyof CollectionDimensions; label: string }> = [
  { key: "organicRank", label: "自然商品序号" },
  { key: "sameParentMatch", label: "同父体匹配" },
  { key: "price", label: "采集价格" },
  { key: "coupon", label: "Coupon" },
  { key: "monthlySales", label: "月销标识" },
  { key: "stock", label: "库存" },
  { key: "seller", label: "卖家" },
  { key: "ratingDistribution", label: "评分与星级分布" },
];

export function MonitorWorkspace() {
  const { snapshot, refresh } = useAppSnapshot();
  const project = snapshot.projects[0];
  const [localProject, setLocalProject] = useState(project);
  const [editingName, setEditingName] = useState(false);
  const [modal, setModal] = useState<"manual" | "paste" | "import" | null>(null);
  const [run, setRun] = useState<MonitorRun | null>(snapshot.runs[0] || null);
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null);
  const [starting, setStarting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const syncProject = useCallback(async () => {
    const nextSnapshot = await refresh();
    const nextProject = nextSnapshot.projects.find((candidate) => candidate.id === project.id);
    if (nextProject) setLocalProject(nextProject);
    return nextSnapshot;
  }, [project.id, refresh]);
  const runId = run?.id;
  const runIsActive = Boolean(run && ["等待中", "执行中"].includes(run.status));
  useEffect(() => {
    if (!runId || !runIsActive) return;
    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
    source.addEventListener("progress", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as MonitorRun | null;
      if (!next) return;
      setRun(next);
      if (!["等待中", "执行中"].includes(next.status)) {
        source.close();
        void refresh();
      }
    });
    source.onerror = () => source.close();
    return () => source.close();
  }, [runId, runIsActive, refresh]);

  const groups = useMemo(() => groupItems(localProject.items), [localProject.items]);
  const estimate = useMemo(
    () => estimatePoints(localProject.items, localProject.scanDepth, localProject.dimensions, snapshot.rateConfig),
    [localProject, snapshot.rateConfig],
  );
  const results = run?.results || snapshot.runs.find((candidate) => candidate.results.length)?.results || [];

  const persistProject = useCallback(async (patch: Partial<Project>) => {
    try {
      const next = await requestJson<Project>(`/api/projects/${localProject.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setLocalProject(next);
      await refresh();
    } catch (error) {
      setMessage({ tone: "danger", text: (error as Error).message });
    }
  }, [localProject.id, refresh]);

  const changeDimension = (key: keyof CollectionDimensions, checked: boolean) => {
    const nextDimensions = { ...localProject.dimensions, [key]: checked };
    setLocalProject({ ...localProject, dimensions: nextDimensions });
    void persistProject({ dimensions: nextDimensions } as Partial<Project>);
  };

  const start = async () => {
    setStarting(true);
    setMessage(null);
    try {
      const next = await requestJson<MonitorRun>("/api/runs", { method: "POST", body: JSON.stringify({ projectId: localProject.id }) });
      setRun(next);
      await syncProject();
    } catch (error) {
      setMessage({ tone: "danger", text: (error as Error).message });
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!run) return;
    try {
      const next = await requestJson<MonitorRun>(`/api/runs/${run.id}`, { method: "DELETE" });
      setRun(next);
      await syncProject();
    } catch (error) {
      setMessage({ tone: "danger", text: (error as Error).message });
    }
  };

  const removeGroup = async (group: ItemGroup) => {
    try {
      await Promise.all(group.items.map((item) => requestJson(`/api/projects/${localProject.id}/items/${item.id}`, { method: "DELETE" })));
      await syncProject();
    } catch (error) {
      setMessage({ tone: "danger", text: (error as Error).message });
    }
  };

  if (!project) return <EmptyState title="暂无项目" detail="请先创建一个自然排名监控项目" />;

  return (
    <div className="monitor-page">
      <div className="page-heading">
        <span>当前项目：</span>
        {editingName ? (
          <input
            className="table-input project-name-input"
            aria-label="项目名称"
            autoFocus
            value={localProject.name}
            onChange={(event) => setLocalProject({ ...localProject, name: event.target.value })}
            onBlur={() => { setEditingName(false); void persistProject({ name: localProject.name }); }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          />
        ) : <h1>{localProject.name}</h1>}
        <button className="icon-button" aria-label="编辑项目名称" onClick={() => setEditingName(true)}><PencilLine size={17} /></button>
      </div>

      {message ? <div style={{ marginBottom: 9 }}><Notice tone={message.tone}>{message.text}</Notice></div> : null}

      <section className="panel settings-panel">
        <div className="settings-title">项目设置</div>
        <div className="settings-grid">
          <div className="field"><label htmlFor="marketplace">站点</label><select id="marketplace" value={localProject.marketplace} onChange={(event) => { const marketplace = event.target.value as Marketplace; const next = { ...localProject, marketplace, zipCode: "" }; setLocalProject(next); void persistProject({ marketplace, zipCode: "" }); }}>{(Object.keys(MARKETPLACES) as Marketplace[]).map((marketplace) => { const enabled = enabledMarketplaces().includes(marketplace); return <option key={marketplace} value={marketplace} disabled={!enabled}>{MARKETPLACES[marketplace].label}{enabled ? "" : "（真实回归通过后开放）"}</option>; })}</select></div>
          <div className="field"><label htmlFor="postal-preset">常用地区</label><select id="postal-preset" value={MARKETPLACES[localProject.marketplace].postalPresets.some((item) => item.value === localProject.zipCode) ? localProject.zipCode : ""} onChange={(event) => { const zipCode = event.target.value; setLocalProject({ ...localProject, zipCode }); void persistProject({ zipCode }); }}><option value="">请选择常用地区</option>{MARKETPLACES[localProject.marketplace].postalPresets.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</select></div>
          <div className="field"><label htmlFor="zip">手动输入邮编</label><input id="zip" value={localProject.zipCode} maxLength={10} placeholder={MARKETPLACES[localProject.marketplace].postalExample} onChange={(event) => setLocalProject({ ...localProject, zipCode: event.target.value.toUpperCase() })} onBlur={() => { if (localProject.zipCode) void persistProject({ zipCode: localProject.zipCode }); }} /></div>
          <div className="field"><label>显示基线（固定）</label><input readOnly value="1920×1080 / 100%" title="DPR 固定为 1；物理显示器尺寸不是统计口径" /></div>
          <div className="field"><label htmlFor="depth">扫描深度</label><select id="depth" value={localProject.scanDepth} onChange={(event) => { const scanDepth = Number(event.target.value) as 1 | 2 | 3; setLocalProject({ ...localProject, scanDepth }); void persistProject({ scanDepth }); }}><option value={1}>1 页</option><option value={2}>2 页</option><option value={3}>3 页</option></select></div>
          <div className="field"><label>排名口径</label><select value={localProject.rankingPolicy} disabled><option>广告排除后的自然行</option></select></div>
          <button className="button button-quiet" type="button" aria-expanded={advancedOpen} aria-controls="advanced-options" onClick={() => setAdvancedOpen((open) => !open)}>高级选项 <ChevronUp size={15} style={{ transform: advancedOpen ? undefined : "rotate(180deg)" }} /></button>
        </div>
        {advancedOpen ? <div className="settings-advanced" id="advanced-options">
          <strong>高级选项（可选）</strong>
          <div className="advanced-options">
            {dimensions.map(({ key, label }) => <label className="checkbox-row" key={key}><input type="checkbox" checked={localProject.dimensions[key]} onChange={(event) => changeDimension(key, event.target.checked)} />{label}</label>)}
          </div>
        </div> : null}
      </section>

      <div className="monitor-grid">
        <section className="panel items-panel">
          <div className="panel-heading">
            <h2>ASIN 与关键词（{groups.length} 组 / {localProject.items.filter((item) => item.enabled).length} 个组合）</h2>
            <div className="heading-actions">
              <button className="button" onClick={() => setModal("manual")}><Plus size={16} />手动添加</button>
              <button className="button" onClick={() => setModal("paste")}><FileSpreadsheet size={16} />批量粘贴</button>
              <a className="button button-quiet" href="/guide#template">模板填写说明 <CircleHelp size={15} /></a>
            </div>
          </div>
          <div className="monitor-table-wrap">
            <table className="monitor-table">
              <thead><tr><th className="index-cell" /><th className="category-cell">类目</th><th className="type-cell">类型</th><th className="asin-cell">子ASIN</th><th className="parent-cell">父ASIN（可选）</th><th className="name-cell">产品简称</th><th className="keywords-header">关键词</th><th className="action-cell">操作</th></tr></thead>
              <tbody>
                {groups.map((group, index) => (
                  <tr key={group.key}>
                    <td className="index-cell">{index + 1}</td><td>{group.category}</td><td>{group.productType}</td><td>{group.childAsin}</td><td>{group.parentAsin || "（可选）"}</td><td>{group.productName}</td>
                    <td className="keywords-cell">{group.items.map((item) => item.keyword).join("\n")}</td>
                    <td className="action-cell"><button className="icon-button" aria-label={`停用 ${group.productName}`} onClick={() => void removeGroup(group)}><Trash2 size={17} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footnote">支持已开放站点的普通商品品类；同一 ASIN 可对应多个关键词。加拿大站和墨西哥站只会在真实回归通过后开放。</div>
        </section>

        <aside className="panel estimate-panel">
          <div className="toolbar" style={{ marginBottom: 8 }}>
            <a className="button" href="/自然排名监控导入模板.xlsx" download><Download size={16} />下载导入模板</a>
            <button className="button button-primary" onClick={() => setModal("import")}><FileUp size={16} />导入 Excel</button>
          </div>
          <h2>{snapshot.meteringEnabled ? "预计监控额度" : "预计页面请求"} <CircleHelp size={15} /></h2>
          <div className="estimate-units">
            <div className="estimate-unit"><span>关键词搜索页</span><strong>{estimate.searchPages} 页</strong></div>
            <div className="estimate-unit"><span>ASIN 详情页</span><strong>{estimate.detailPages} 个</strong></div>
            <div className="estimate-unit"><span>评分主体</span><strong>{estimate.ratingSubjects} 个</strong></div>
          </div>
          <div className="estimate-formula">搜索页＋详情页＋评分主体</div>
          {snapshot.meteringEnabled ? <>
            <div className="estimate-total"><span>预计监控额度</span><strong>{estimate.total.toLocaleString("zh-CN")} 额度</strong></div>
            <div className="estimate-note">* 创建任务时冻结，任务完成后按实际成功请求结算。</div>
          </> : <>
            <div className="estimate-total"><span>预计请求数量</span><strong>{estimate.total.toLocaleString("zh-CN")} 次</strong></div>
            <div className="estimate-note">* 额度计量已关闭；仍记录实际成功页面请求数量，不冻结或扣除额度。</div>
          </>}
          <button className="button button-primary button-large" disabled={starting || Boolean(run && ["等待中", "执行中"].includes(run.status))} onClick={() => void start()}>{starting ? <Loading label="正在创建" /> : "开始执行"}</button>
        </aside>
      </div>

      <RunPanel run={run} onCancel={cancel} />
      <ResultsPanel run={run} results={results} />

      {modal === "manual" ? <ManualAddModal project={localProject} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await syncProject(); }} /> : null}
      {modal === "paste" ? <BatchPasteModal project={localProject} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await syncProject(); }} /> : null}
      {modal === "import" ? <ImportModal project={localProject} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await syncProject(); }} /> : null}
    </div>
  );
}

function RunPanel({ run, onCancel }: { run: MonitorRun | null; onCancel: () => Promise<void> }) {
  if (!run) return null;
  const percent = (done: number, total: number) => total ? Math.round(done / total * 100) : 100;
  return (
    <section className="panel run-panel">
      <div className="run-toolbar">
        <div className="run-state"><RotateCw className={["等待中", "执行中"].includes(run.status) ? "spin" : ""} size={19} />{run.status}</div>
        <div className="run-meta">任务ID：#{run.id}</div>
        <div className="run-meta">开始时间：{run.startedAt ? new Date(run.startedAt).toLocaleString("zh-CN", { hour12: false }) : "等待 Worker"}</div>
        <div className="run-actions"><a className="button" href={`/history?run=${encodeURIComponent(run.id)}`}>查看运行日志</a>{["等待中", "执行中"].includes(run.status) ? <button className="button button-danger" onClick={() => void onCancel()}>取消后续任务</button> : null}</div>
      </div>
      <div className="progress-grid">
        <ProgressItem label="搜索页进度" done={run.progress.searchCompleted} total={run.progress.searchTotal} percent={percent(run.progress.searchCompleted, run.progress.searchTotal)} />
        <ProgressItem label="详情页进度" done={run.progress.detailCompleted} total={run.progress.detailTotal} percent={percent(run.progress.detailCompleted, run.progress.detailTotal)} />
        <ProgressItem label="评分主体进度" done={run.progress.ratingCompleted} total={run.progress.ratingTotal} percent={percent(run.progress.ratingCompleted, run.progress.ratingTotal)} />
      </div>
    </section>
  );
}

function ProgressItem({ label, done, total, percent }: { label: string; done: number; total: number; percent: number }) {
  return <div className="progress-item"><div className="progress-label"><span>{label}</span><strong>{done} / {total}　{percent}%</strong></div><ProgressBar value={percent} /></div>;
}

function ResultsPanel({ run, results }: { run: MonitorRun | null; results: MonitorRun["results"] }) {
  return (
    <section className="panel results-panel">
      <div className="panel-heading"><h2>结果预览（实时更新）</h2><div className="heading-actions">{run?.results.length ? <a className="button" href={`/api/exports/${encodeURIComponent(run.id)}`}><Upload size={16} />导出完整 Excel</a> : null}</div></div>
      {results.length ? (
        <div className="results-wrap"><table className="data-table"><thead><tr><th>类目</th><th>子ASIN</th><th>关键词</th><th>自然排名</th><th>自然商品序号</th><th>售价</th><th>评分</th><th>状态</th><th>更新时间</th></tr></thead><tbody>{results.map((result) => <tr key={result.id}><td className="left">{result.category}</td><td>{result.childAsin}</td><td className="left">{result.keyword}</td><td>{formatNaturalRank(result)}</td><td>{result.naturalOrdinal ?? "--"}</td><td>{result.priceAmount === null ? "--" : `${result.currency} ${result.priceAmount.toFixed(2)}`}</td><td>{result.rating ? <>{result.rating.toFixed(1)} <span className="rating-star">★</span> ({result.ratingCount?.toLocaleString("en-US")})</> : "--"}</td><td className={result.state === "已完成" ? "status-success" : result.state === "暂无" ? "status-muted" : "status-warning"}>{result.state}</td><td>{result.observedAt ? new Date(result.observedAt).toLocaleString("zh-CN", { hour12: false }) : "--"}</td></tr>)}</tbody></table></div>
      ) : <EmptyState title="尚无正式结果" detail="创建任务后，这里会显示实时结果；系统不会用旧值或 0 填补未完成数据。" />}
    </section>
  );
}

type ManualFormState = {
  category: string; productType: ProductType; childAsin: string; parentAsin: string; productName: string; keywords: string; sameParentMatch: boolean; notes: string;
};

const initialManualForm: ManualFormState = { category: "", productType: "自有", childAsin: "", parentAsin: "", productName: "", keywords: "", sameParentMatch: false, notes: "" };

function ManualAddModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(initialManualForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    const keywords = form.keywords.split(/\n|,/).map((keyword) => keyword.trim()).filter(Boolean);
    if (!keywords.length) { setError("请至少填写一个关键词"); setSaving(false); return; }
    try {
      await Promise.all(keywords.map((keyword) => requestJson(`/api/projects/${project.id}/items`, { method: "POST", body: JSON.stringify({ ...form, keyword, keywords: undefined }) })));
      await onSaved();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  };
  return <Modal title="手动添加 ASIN 与关键词" onClose={onClose}><form onSubmit={submit}><div className="modal-body"><div className="form-grid"><Field label="类目"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="例如：厨房小家电" /></Field><Field label="类型"><select value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value as ProductType })}><option>自有</option><option>竞品</option></select></Field><Field label="子ASIN"><input value={form.childAsin} maxLength={10} onChange={(e) => setForm({ ...form, childAsin: e.target.value.toUpperCase() })} placeholder="10 位 ASIN" /></Field><Field label="父ASIN（可选）"><input value={form.parentAsin} maxLength={10} onChange={(e) => setForm({ ...form, parentAsin: e.target.value.toUpperCase() })} /></Field><Field label="产品简称"><input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} /></Field><label className="checkbox-row" style={{ alignSelf: "end", minHeight: 38 }}><input type="checkbox" checked={form.sameParentMatch} onChange={(e) => setForm({ ...form, sameParentMatch: e.target.checked })} />启用同父体匹配</label><Field label="关键词（每行一个）" className="span-2"><textarea value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder={"coffee maker\ndrip coffee maker"} /></Field><Field label="备注（可选）" className="span-2"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>{error ? <div style={{ marginTop: 12 }}><Notice tone="danger">{error}</Notice></div> : null}</div><div className="modal-footer"><button type="button" className="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={saving}>{saving ? <Loading /> : "确认添加"}</button></div></form></Modal>;
}

function BatchPasteModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true); setError("");
    try {
      const rows = value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
        const [category, productType, childAsin, productName, keyword, parentAsin = "", sameParent = "否", notes = ""] = line.split("\t");
        return { category, productType, childAsin, productName, keyword, parentAsin, sameParentMatch: ["是", "yes", "true", "1"].includes((sameParent || "").toLocaleLowerCase("en-US")), notes };
      });
      if (!rows.length) throw new Error("请粘贴至少一行数据");
      await requestJson("/api/imports/commit", { method: "POST", body: JSON.stringify({ projectId: project.id, mode: "append", rows }) });
      await onSaved();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  };
  return <Modal title="批量粘贴" onClose={onClose}><div className="modal-body"><Notice>从 Excel 复制后直接粘贴。列顺序：类目、类型、子ASIN、产品简称、关键词、父ASIN、同父体匹配、备注。</Notice><div className="field" style={{ marginTop: 14 }}><label>粘贴数据</label><textarea style={{ minHeight: 220 }} value={value} onChange={(e) => setValue(e.target.value)} placeholder={"演示类目\t自有\tB000DEMO01\tDemo Product\tdemo keyword\tB000PARENT\t是\t合成示例"} /></div>{error ? <div style={{ marginTop: 12 }}><Notice tone="danger">{error}</Notice></div> : null}</div><div className="modal-footer"><button className="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={saving} onClick={() => void submit()}>{saving ? <Loading /> : "校验并导入"}</button></div></Modal>;
}

type ValidationResult = { totalRows: number; validRows: Array<Record<string, unknown>>; errors: Array<{ row: number; field: string; value: string; message: string }> };

function ImportModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null); const [result, setResult] = useState<ValidationResult | null>(null); const [mode, setMode] = useState<"append" | "replace">("append"); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const validate = async (selected: File) => {
    setFile(selected); setBusy(true); setError(""); setResult(null);
    const form = new FormData(); form.append("file", selected);
    try { setResult(await requestJson<ValidationResult>("/api/imports/validate", { method: "POST", body: form })); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    if (!result) return; setBusy(true); setError("");
    try { await requestJson("/api/imports/commit", { method: "POST", body: JSON.stringify({ projectId: project.id, mode, rows: result.validRows }) }); await onSaved(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };
  return <Modal title="导入 Excel" width={860} onClose={onClose}><div className="modal-body"><div className="step-row"><Step number={1} title="下载模板" text="模板只有填写说明和导入数据两张表。" /><Step number={2} title="填写并上传" text="5 个必填列，父ASIN等 3 列可选。" /><Step number={3} title="校验后导入" text="错误行不会写入，可只导入有效行。" /></div><label className="drop-zone"><FileSpreadsheet size={34} color="#075be8" /><strong>{file?.name || "点击选择 .xlsx 文件"}</strong><span>文件不超过 5MB，最多 10,000 行</span><input type="file" accept=".xlsx" onChange={(e) => { const selected = e.target.files?.[0]; if (selected) void validate(selected); }} /></label>{busy ? <div style={{ marginTop: 12 }}><Notice><Loading label="正在校验文件" /></Notice></div> : null}{error ? <div style={{ marginTop: 12 }}><Notice tone="danger">{error}</Notice></div> : null}{result ? <><div className="import-summary"><div className="summary-chip"><strong>{result.totalRows}</strong><span>读取行数</span></div><div className="summary-chip"><strong className="status-success">{result.validRows.length}</strong><span>有效行</span></div><div className="summary-chip"><strong className={result.errors.length ? "status-warning" : "status-success"}>{result.errors.length}</strong><span>错误项</span></div></div>{result.errors.length ? <div style={{ marginTop: 12 }}><Notice tone="warning">第 {result.errors.slice(0, 4).map((item) => `${item.row} 行：${item.message}`).join("；")}。错误行将被排除。</Notice></div> : <div style={{ marginTop: 12 }}><Notice tone="success">校验通过，可以导入。</Notice></div>}<div className="field" style={{ marginTop: 14 }}><label>导入方式</label><select value={mode} onChange={(e) => setMode(e.target.value as "append" | "replace")}><option value="append">追加/更新（推荐）</option><option value="replace">替换当前清单（历史结果保留）</option></select></div></> : null}</div><div className="modal-footer"><a className="button" href="/自然排名监控导入模板.xlsx" download><Download size={16} />下载模板</a><button className="button" onClick={onClose}>取消</button><button className="button button-primary" disabled={!result?.validRows.length || busy} onClick={() => void commit()}>{busy ? <Loading /> : `导入 ${result?.validRows.length || 0} 行`}</button></div></Modal>;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) { return <div className={`field ${className}`}><label>{label}</label>{children}</div>; }
function Step({ number, title, text }: { number: number; title: string; text: string }) { return <div className="step-item"><span className="step-number">{number}</span><div><strong>{title}</strong><p>{text}</p></div></div>; }
