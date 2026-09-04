import { NextResponse } from "next/server";
import { getSqliteQueueService } from "@/lib/sqliteQueue";

/**
 * Cron job endpoint that processes pending jobs in the queue.
 * This is triggered by Vercel Cron Jobs (configured in vercel.json).
 *
 * Vercel injects the value of the `CRON_SECRET` environment variable as an
 * `Authorization: Bearer <CRON_SECRET>` header on every cron invocation.
 * For backward compatibility we also accept the legacy `?token=` query param.
 * Both are validated against `CRON_SECRET` (preferred) or `CRON_SECRET_TOKEN`.
 * When neither variable is configured, the endpoint is open (dev mode).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.CRON_SECRET_TOKEN;

  if (secret) {
    const authHeader = request.headers.get("authorization") || "";
    const bearerMatch = authHeader.match(/^Bearer (.+)$/);
    const bearer = bearerMatch ? bearerMatch[1] : "";
    const queryToken = new URL(request.url).searchParams.get("token");

    if (bearer !== secret && queryToken !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const queue = getSqliteQueueService();
    await queue.processPendingJobs();

    const stats = await queue.getQueueStats();
    return NextResponse.json({
      status: "completed",
      timestamp: new Date().toISOString(),
      stats,
    });
  } catch (error) {
    console.error("[Cron] Error processing pending jobs:", error);
    return NextResponse.json(
      {
        error: "Failed to process jobs",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export { GET as POST };
