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
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAppSnapshot } from "@/components/app-provider";

const navigation = [
  { href: "/projects", label: "项目", icon: FolderKanban },
  { href: "/tasks", label: "任务", icon: ListChecks },
  { href: "/history", label: "历史", icon: Clock3 },
  { href: "/exports", label: "导出", icon: Download },
  { href: "/guide", label: "使用说明", icon: BookOpen },
  { href: "/wallet", label: "监控额度", icon: Coins },
  { href: "/amazon-authorization", label: "Amazon授权", icon: ShieldCheck },
  { href: "/settings", label: "设置", icon: Settings },
];

const sidebarStorageKey = "rank-monitor:sidebar-collapsed";
const sidebarStorageEvent = "rank-monitor:sidebar-change";
const subscribeSidebar = (listener: () => void) => { window.addEventListener("storage", listener); window.addEventListener(sidebarStorageEvent, listener); return () => { window.removeEventListener("storage", listener); window.removeEventListener(sidebarStorageEvent, listener); }; };
const sidebarSnapshot = () => window.localStorage.getItem(sidebarStorageKey) === "1";

export function AppShell({ children, adminAuthenticated }: { children: React.ReactNode; adminAuthenticated: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { snapshot } = useAppSnapshot();
  const visibleNavigation = navigation.filter((item) => snapshot.meteringEnabled || item.href !== "/wallet");
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeSidebar, sidebarSnapshot, () => false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const toggleSidebar = () => { window.localStorage.setItem(sidebarStorageKey, collapsed ? "0" : "1"); window.dispatchEvent(new Event(sidebarStorageEvent)); };
  const logout = async () => {
    await fetch(adminAuthenticated ? "/api/admin/auth/logout" : "/api/auth/logout", { method: "POST" });
    router.push(adminAuthenticated ? "/admin/login" : "/login");
    router.refresh();
  };
  const isStandalone = pathname === "/" || pathname === "/welcome" || pathname === "/guide" || pathname === "/login" || pathname === "/admin/login" || pathname === "/admin/setup";
  if (isStandalone) return <>{children}</>;

  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
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
        <button className="sidebar-bottom" type="button" aria-label={collapsed ? "展开侧栏" : "收起侧栏"} onClick={toggleSidebar}><ChevronLeft size={17} style={{ transform: collapsed ? "rotate(180deg)" : undefined }} /><span>{collapsed ? "展开" : "收起"}</span></button>
      </aside>
      {mobileOpen ? <button className="sidebar-backdrop" aria-label="关闭导航遮罩" onClick={() => setMobileOpen(false)} /> : null}
      <div className="app-main">
        <header className="topbar">
          <div className="tool-title">自然排名监控工具 <PencilLine size={16} strokeWidth={1.7} aria-hidden="true" /></div>
          <div className="market-note"><Globe2 size={19} /><span>美国站已开放；加拿大、墨西哥回归通过后开放</span></div>
          <div className="topbar-spacer" />
          {snapshot.meteringEnabled ? <>
            <Link href="/wallet" className="points-summary">
              <Coins size={23} strokeWidth={1.6} />
              <span><small>监控额度</small><strong>{snapshot.wallet.available.toLocaleString("zh-CN")} 额度</strong></span>
              <em>查看明细</em>
            </Link>
            <div className="topbar-divider" />
          </> : null}
          <div className="user-menu-wrap" ref={userMenuRef}>
            <button className="user-menu" aria-haspopup="menu" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)}>
              <span className="avatar"><UserRound size={22} /></span><span>{snapshot.currentUser.name}</span><ChevronDown size={15} />
            </button>
            {userMenuOpen ? <div className="user-dropdown" role="menu"><span>{snapshot.currentUser.email}</span><Link href="/settings" role="menuitem" onClick={() => setUserMenuOpen(false)}>账户设置</Link><button role="menuitem" onClick={() => void logout()}>退出登录</button></div> : null}
          </div>
        </header>
        <main className="page-area">{children}</main>
      </div>
    </div>
  );
}
