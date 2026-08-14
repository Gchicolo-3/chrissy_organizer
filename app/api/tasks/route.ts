import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isBucket } from "@/lib/buckets";

// Without this, Next.js statically prerenders this GET at build time and
// Vercel serves the frozen build-time snapshot forever — the exact bug that
// made the Tasks tab show nothing while inserts were succeeding.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const { data, error } = await getSupabase()
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { tasks: data },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Manual add / restore (used by undo after delete).
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.task_text !== "string" || !body.task_text.trim()) {
    return NextResponse.json({ error: "task_text is required" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("tasks")
    .insert({
      bucket: isBucket(body.bucket) ? body.bucket : "Unsorted",
      task_text: body.task_text.trim().slice(0, 200),
      raw_transcript:
        typeof body.raw_transcript === "string" ? body.raw_transcript : null,
      completed: body.completed === true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: data });
}
