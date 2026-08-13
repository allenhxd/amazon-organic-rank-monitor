"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Coins,
  Download,
  FolderKanban,
  Globe2,
  Grid3X3,
  ListChecks,
  Menu,
  PencilLine,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAppSnapshot } from "@/components/app-provider";

const navigation = [
  { href: "/projects", label: "项目", icon: FolderKanban },
  { href: "/tasks", label: "任务", icon: ListChecks },
  { href: "/history", label: "历史", icon: Clock3 },
  { href: "/exports", label: "导出", icon: Download },
  { href: "/guide", label: "使用说明", icon: BookOpen },
  { href: "/wallet", label: "点数", icon: Coins },
  { href: "/amazon-authorization", label: "Amazon授权", icon: ShieldCheck },
  { href: "/settings", label: "设置", icon: Settings },
];

export function AppShell({ children, adminAuthenticated }: { children: React.ReactNode; adminAuthenticated: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { snapshot } = useAppSnapshot();
  const visibleNavigation = navigation.filter((item) => snapshot.meteringEnabled || item.href !== "/wallet");
  const [mobileOpen, setMobileOpen] = useState(false);
  const logout = async () => {
    await fetch(adminAuthenticated ? "/api/admin/auth/logout" : "/api/auth/logout", { method: "POST" });
    router.push(adminAuthenticated ? "/admin/login" : "/login");
    router.refresh();
  };
  const isStandalone = pathname === "/" || pathname === "/welcome" || pathname === "/guide" || pathname === "/login" || pathname === "/admin/login" || pathname === "/admin/setup";
  if (isStandalone) return <>{children}</>;

  return (
    <div className="app-shell">
      <button className="mobile-menu-button" aria-label="打开导航" onClick={() => setMobileOpen(true)}>
        <Menu size={22} />
      </button>
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark"><Grid3X3 size={25} strokeWidth={1.5} /></div>
          <span>亚马逊排名监控</span>
          <button className="sidebar-close" aria-label="关闭导航" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>
        <nav className="sidebar-nav" aria-label="主导航">
          {[...visibleNavigation, ...(adminAuthenticated ? [{ href: "/admin", label: "管理后台", icon: ShieldCheck }] : [])].map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={`nav-item ${active ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
                <Icon size={19} strokeWidth={1.9} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-bottom"><ChevronLeft size={17} /><span>收起</span></div>
      </aside>
      {mobileOpen ? <button className="sidebar-backdrop" aria-label="关闭导航遮罩" onClick={() => setMobileOpen(false)} /> : null}
      <div className="app-main">
        <header className="topbar">
          <div className="tool-title">自然排名监控工具 <PencilLine size={16} strokeWidth={1.7} aria-hidden="true" /></div>
          <div className="market-note"><Globe2 size={19} /><span>目前仅支持 Amazon 美国站</span></div>
          <div className="topbar-spacer" />
          {snapshot.meteringEnabled ? <>
            <Link href="/wallet" className="points-summary">
              <Coins size={23} strokeWidth={1.6} />
              <span><small>监控点数</small><strong>{snapshot.wallet.available.toLocaleString("zh-CN")} 点</strong></span>
              <em>查看明细</em>
            </Link>
            <div className="topbar-divider" />
          </> : null}
          <button className="user-menu" aria-label="退出登录" title="退出登录" onClick={() => void logout()}>
            <span className="avatar"><UserRound size={22} /></span>
            <span>{snapshot.currentUser.name}</span>
            <ChevronDown size={15} />
          </button>
        </header>
        <main className="page-area">{children}</main>
      </div>
    </div>
  );
}
