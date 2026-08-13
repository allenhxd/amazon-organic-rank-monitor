"use client";

import { AlertCircle, CheckCircle2, LoaderCircle, X } from "lucide-react";

export function Modal({ title, children, onClose, width = 760 }: { title: string; children: React.ReactNode; onClose: () => void; width?: number }) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-backdrop" aria-label="关闭弹窗" onClick={onClose} />
      <section className="modal" style={{ maxWidth: width }}>
        <header className="modal-header"><h2>{title}</h2><button aria-label="关闭" onClick={onClose}><X size={20} /></button></header>
        {children}
      </section>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "warning" | "danger"; children: React.ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? AlertCircle : AlertCircle;
  return <div className={`notice notice-${tone}`}><Icon size={17} />{children}</div>;
}

export function Loading({ label = "处理中" }: { label?: string }) {
  return <span className="inline-loading"><LoaderCircle className="spin" size={16} />{label}</span>;
}

export function ProgressBar({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(100, value));
  return <div className="progress-track" aria-label={`进度 ${normalized}%`}><span style={{ width: `${normalized}%` }} /></div>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><AlertCircle size={26} /><strong>{title}</strong><p>{detail}</p></div>;
}
