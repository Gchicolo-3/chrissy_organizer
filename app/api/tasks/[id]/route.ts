import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isBucket } from "@/lib/buckets";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.completed === "boolean") {
    update.completed = body.completed;
    update.completed_at = body.completed ? new Date().toISOString() : null;
  }
  if (typeof body.task_text === "string" && body.task_text.trim()) {
    update.task_text = body.task_text.trim().slice(0, 200);
  }
  if (isBucket(body.bucket)) {
    update.bucket = body.bucket;
  }
  if ("due_at" in body) {
    if (body.due_at === null) {
      update.due_at = null;
    } else if (
      typeof body.due_at === "string" &&
      !Number.isNaN(Date.parse(body.due_at))
    ) {
      update.due_at = new Date(body.due_at).toISOString();
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("tasks")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  const { error } = await getSupabase()
    .from("tasks")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
