import "server-only";

import type { MonitorItem, Project } from "@/domain/types";
import * as demo from "@/server/demo-store";
import * as postgres from "@/server/postgres-store";

export type StoreActor = postgres.StoreActor;
type ItemInput = Omit<MonitorItem, "id" | "projectId" | "enabled">;

const productionData = () => process.env.DATA_MODE === "postgres";

export async function getSnapshot(actor: StoreActor | null) {
  if (productionData()) return postgres.getSnapshot(actor);
  return demo.getSnapshot();
}

export async function getAccountByEmail(email: string) {
  if (productionData()) return postgres.getAccountByEmail(email);
  return demo.getSnapshot().users.find((user) => user.email.toLocaleLowerCase("en-US") === email.trim().toLocaleLowerCase("en-US")) || null;
}

export async function getAccountById(userId: string) {
  if (productionData()) return postgres.getAccountById(userId);
  return demo.getSnapshot().users.find((user) => user.id === userId) || null;
}

export async function hasAdminCredential() {
  if (productionData()) return postgres.hasAdminCredential();
  return false;
}

export async function getAdminCredentialByUsername(username: string) {
  if (productionData()) return postgres.getAdminCredentialByUsername(username);
  return null;
}

export async function createInitialAdminCredential(actor: StoreActor, username: string, passwordHash: string) {
  if (productionData()) return postgres.createInitialAdminCredential(actor, username, passwordHash);
  return { userId: actor.userId, username };
}

export async function getProject(actor: StoreActor, id: string) {
  if (productionData()) return postgres.getProject(actor, id);
  const project = demo.getProject(id);
  return project && (project.ownerId === actor.userId || actor.userId === "user-demo") ? project : null;
}

export async function saveProject(actor: StoreActor, project: Project) {
  if (productionData()) return postgres.saveProject(actor, project);
  const existing = demo.getProject(project.id);
  if (!existing || (existing.ownerId !== actor.userId && actor.userId !== "user-demo")) throw new Error("项目不存在或无权访问");
  return demo.saveProject(project);
}

export async function addProjectItem(actor: StoreActor, projectId: string, input: ItemInput) {
  if (productionData()) return postgres.addProjectItem(actor, projectId, input);
  await getProject(actor, projectId).then((project) => { if (!project) throw new Error("项目不存在或无权访问"); });
  return demo.addProjectItem(projectId, input);
}

export async function removeProjectItem(actor: StoreActor, projectId: string, itemId: string) {
  if (productionData()) return postgres.removeProjectItem(actor, projectId, itemId);
  await getProject(actor, projectId).then((project) => { if (!project) throw new Error("项目不存在或无权访问"); });
  return demo.removeProjectItem(projectId, itemId);
}

export async function importProjectItems(actor: StoreActor, projectId: string, rows: ItemInput[], mode: "append" | "replace") {
  if (productionData()) return postgres.importProjectItems(actor, projectId, rows, mode);
  await getProject(actor, projectId).then((project) => { if (!project) throw new Error("项目不存在或无权访问"); });
  return demo.importProjectItems(projectId, rows, mode);
}

export async function startRun(actor: StoreActor, projectId: string) {
  if (productionData()) return postgres.startRun(actor, projectId);
  await getProject(actor, projectId).then((project) => { if (!project) throw new Error("项目不存在或无权访问"); });
  return demo.startRun(projectId);
}

export async function getRun(actor: StoreActor, id: string) {
  if (productionData()) return postgres.getRun(actor, id);
  const run = demo.getRun(id);
  return run && (run.userId === actor.userId || actor.userId === "user-demo") ? run : null;
}

export async function cancelRun(actor: StoreActor, id: string) {
  if (productionData()) return postgres.cancelRun(actor, id);
  const run = await getRun(actor, id);
  if (!run) throw new Error("任务不存在或无权访问");
  return demo.cancelRun(id);
}

export async function adjustWallet(actor: StoreActor, userId: string, amount: number, reason: string) {
  if (productionData()) return postgres.adjustWallet(actor, userId, amount, reason);
  if (actor.role !== "ADMIN") throw new Error("需要管理员权限");
  return demo.adjustWallet(userId, amount, reason, "管理员");
}
