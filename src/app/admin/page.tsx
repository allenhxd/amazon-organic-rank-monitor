import { AdminDashboard } from "@/components/admin-dashboard";
import { assertAdmin } from "@/server/auth";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  try { await assertAdmin(); }
  catch { redirect("/admin/login"); }
  return <AdminDashboard />;
}
