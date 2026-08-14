import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";
import { ALL_BUCKETS, BUCKETS, isBucket } from "@/lib/buckets";

// Never statically cache API routes — every request must hit the function.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_TRANSCRIPT_CHARS = 4000;

const OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    tasks: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          bucket: { type: "string" as const, enum: [...ALL_BUCKETS] },
          task_text: { type: "string" as const },
        },
        required: ["bucket", "task_text"],
        additionalProperties: false,
      },
    },
  },
  required: ["tasks"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You turn one rambling voice memo from Christine into a clean task list.

Christine's buckets:
- Cheer: her kids' cheerleading — practices, uniforms, coaches, competitions, team events
- MFFA: everything related to the MFFA organization
- Real Estate: her real estate work — listings, showings, open houses, clients, closings
- Kids/Family: family life that isn't cheer — school, appointments, birthdays, household, errands for the kids
- Blind Works Job: her job at Blind Works
- HUNS Job: her job at HUNS
- Unsorted: anything that clearly fits none of the above

Rules:
- Split the memo into separate tasks wherever she mentions distinct things to do. One thought = one task.
- Rewrite each as a short, actionable task under 12 words, keeping her names and specifics.
- Never invent tasks she didn't say. Never drop one she did.
- If the whole memo is one thing, return one task.`;

export async function POST(req: NextRequest) {
  let transcript: unknown;
  try {
    ({ transcript } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof transcript !== "string" || !transcript.trim()) {
    return NextResponse.json({ error: "Say something first" }, { status: 400 });
  }
  const text = transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY" },
      { status: 500 }
    );
  }

  let parsed: { tasks: { bucket: string; task_text: string }[] };
  try {
    const client = new Anthropic({ timeout: 25_000 });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: `Voice memo: "${text}"` }],
    });

    const block = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !block || block.type !== "text") {
      throw new Error("No usable response from the sorter");
    }
    parsed = JSON.parse(block.text);
  } catch (err) {
    // If sorting fails for any reason, still capture the dump so nothing is lost.
    parsed = { tasks: [{ bucket: "Unsorted", task_text: text.slice(0, 90) }] };
  }

  const rows = (parsed.tasks ?? [])
    .filter((t) => typeof t.task_text === "string" && t.task_text.trim())
    .slice(0, 20)
    .map((t) => ({
      bucket: isBucket(t.bucket) ? t.bucket : ("Unsorted" as const),
      task_text: t.task_text.trim().slice(0, 200),
      raw_transcript: text,
    }));

  if (rows.length === 0) {
    rows.push({
      bucket: "Unsorted",
      task_text: text.slice(0, 90),
      raw_transcript: text,
    });
  }

  const { data: inserted, error } = await getSupabase()
    .from("tasks")
    .insert(rows)
    .select();

  if (error) {
    return NextResponse.json(
      { error: `Couldn't save: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ tasks: inserted });
}
