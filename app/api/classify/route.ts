import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { BUCKETS } from "@/lib/buckets";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  const { transcript } = await req.json();

  if (!transcript || !transcript.trim()) {
    return NextResponse.json({ error: "Empty transcript" }, { status: 400 });
  }

  const prompt = `You sort quick voice memos into buckets and clean them up into short tasks.

Buckets: ${BUCKETS.join(", ")}

If it clearly does not fit any bucket, use "Unsorted".

Voice memo: "${transcript}"

Reply with ONLY valid JSON, no markdown, no explanation:
{"bucket": "<one of the buckets above or Unsorted>", "task_text": "<short clean task, under 12 words>"}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      { error: `Claude API error: ${errText}` },
      { status: 500 }
    );
  }

  const data = await res.json();
  const raw =
    data.content?.find((c: any) => c.type === "text")?.text ?? "{}";

  let parsed: { bucket: string; task_text: string };
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(clean);
  } catch {
    parsed = { bucket: "Unsorted", task_text: transcript.slice(0, 80) };
  }

  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert({
      bucket: parsed.bucket,
      task_text: parsed.task_text,
      raw_transcript: transcript,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ task: inserted });
}
