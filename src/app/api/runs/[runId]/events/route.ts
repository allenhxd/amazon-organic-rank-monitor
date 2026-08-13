import { getRun } from "@/server/store";
import { assertUser } from "@/server/auth";

type Context = { params: Promise<{ runId: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: Context) {
  const actor = await assertUser();
  const { runId } = await context.params;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      const send = async () => {
        if (closed) return;
        const run = await getRun(actor, runId);
        if (closed) return;
        controller.enqueue(encoder.encode(`event: progress\ndata: ${JSON.stringify(run)}\n\n`));
        if (!run || ["已完成", "部分完成", "未完成", "已取消"].includes(run.status)) close();
      };
      void send();
      const interval = setInterval(() => void send(), 1_000);
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        close();
      });
      setTimeout(() => {
        clearInterval(interval);
        close();
      }, 60_000);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
