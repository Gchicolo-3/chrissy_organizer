import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const update: Record<string, any> = {};

  if (typeof body.completed === "boolean") {
    update.completed = body.completed;
    update.completed_at = body.completed ? new Date().toISOString() : null;
  }
  if (body.task_text) update.task_text = body.task_text;
  if (body.bucket) update.bucket = body.bucket;

  const { data, error } = await supabase
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
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await supabase.from("tasks").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
