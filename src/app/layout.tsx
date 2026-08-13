import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/components/app-provider";
import { AppShell } from "@/components/app-shell";
import { getSnapshot } from "@/server/store";
import { getOptionalActor, getOptionalAdminActor } from "@/server/auth";

export const metadata: Metadata = {
  title: "自然排名监控工具｜亚马逊排名监控",
  description: "Amazon 美国站自然排名、价格与评分监控工具",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const adminActor = await getOptionalAdminActor();
  const session = adminActor || await getOptionalActor();
  const snapshot = await getSnapshot(session);
  return (
    <html lang="zh-CN">
      <body>
        <AppProvider initialSnapshot={snapshot}>
          <AppShell adminAuthenticated={Boolean(adminActor)}>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
