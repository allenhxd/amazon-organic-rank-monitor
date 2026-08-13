"use client";

import { FormEvent, Suspense, useState } from "react";
import { ArrowLeft, ArrowRight, Grid3X3, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loading, Notice } from "@/components/ui";

export default function AdminLoginPage() {
  return <Suspense fallback={null}><AdminLoginContent /></Suspense>;
}

function AdminLoginContent() {
  const search = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "管理员登录失败");
      const requestedNext = search.get("next");
      const next = requestedNext?.startsWith("/admin") && !requestedNext.startsWith("//") ? requestedNext : "/admin";
      window.location.assign(next);
    } catch (cause) {
      setError((cause as Error).message); setBusy(false);
    }
  };

  return <div className="auth-page admin-auth-page">
    <Link className="auth-home-link" href="/"><ArrowLeft size={16} />返回网站首页</Link>
    <div className="auth-brand"><Grid3X3 size={26} /><span>亚马逊排名监控</span></div>
    <main className="auth-card">
      <div className="auth-icon admin-auth-icon"><ShieldCheck size={27} /></div>
      <h1>管理后台登录</h1>
      <p>管理员账号与普通用户邮箱验证码登录相互独立</p>
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="admin-username">管理员账号</label><input id="admin-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></div>
        <div className="field" style={{ marginTop: 14 }}><label htmlFor="admin-password">管理员密码</label><div className="password-field"><LockKeyhole size={17} /><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div></div>
        {error ? <div style={{ marginTop: 12 }}><Notice tone="danger">{error}</Notice></div> : null}
        <div className="auth-actions"><button className="button button-primary button-large" disabled={busy || username.trim().length < 3 || password.length < 12}>{busy ? <Loading /> : <>进入管理后台 <ArrowRight size={16} /></>}</button></div>
      </form>
      <Link className="auth-secondary-link" href="/login">普通用户邮箱登录</Link>
      <Link className="auth-secondary-link" href="/login?next=%2Fadmin%2Fsetup">首次设置管理账号</Link>
    </main>
  </div>;
}
