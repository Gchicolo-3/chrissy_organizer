import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";
import { ALL_BUCKETS, isBucket } from "@/lib/buckets";

// Never statically cache API routes — every request must hit the function.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_TRANSCRIPT_CHARS = 4000;
const TIMEZONE = "America/New_York";

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
          due_at: {
            anyOf: [{ type: "string" as const }, { type: "null" as const }],
          },
        },
        required: ["bucket", "task_text", "due_at"],
        additionalProperties: false,
      },
    },
  },
  required: ["tasks"],
  additionalProperties: false,
};

function buildSystemPrompt(): string {
  const now = new Date();
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "longOffset",
  }).format(now);

  return `You turn one rambling voice memo from Christine into a clean task list.

Christine's buckets:
- Cheer: her kids' cheerleading — practices, uniforms, coaches, competitions, team events
- MFFA: everything related to the MFFA organization
- Real Estate: her real estate work — listings, showings, open houses, clients, closings
- Kids/Family: family life that isn't cheer — school, appointments, birthdays, household, errands for the kids
- Blind Works Job: her job at Blind Works
- HUNS Job: her job at HUNS
- Unsorted: anything that clearly fits none of the above

Splitting rules — err on the side of FEWER tasks:
- Create a new task only where she names a genuinely separate thing to do.
- Times, dates, addresses, people, and other qualifiers are DETAILS of a task, never their own tasks. "Schedule a showing tomorrow night at 276 Washington" is ONE task, not three.
- When unsure whether something is a separate task or a detail of the previous one, treat it as a detail and keep it in that task's text.
- If the whole memo is one thing, return exactly one task.
- Rewrite each task short and actionable (roughly under 15 words), keeping her exact names, places, and times in the text.
- Never invent tasks she didn't say. Never drop one she did.

Due dates:
- Right now it is ${local} (${TIMEZONE}).
- If a task mentions a specific day or time ("tomorrow night", "Thursday at noon", "5pm Aug 20", "Friday"), set due_at to that moment as a full ISO 8601 timestamp including the UTC offset shown above.
- Rough times of day: morning = 09:00, noon = 12:00, afternoon = 15:00, evening/night = 19:00. A day with no time = 09:00.
- If a task has no date or time, due_at is null. Never guess a date that wasn't said.`;
}

type ParsedTask = { bucket: string; task_text: string; due_at?: string | null };

function validDueAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  const now = Date.now();
  const YEAR = 365 * 24 * 3600 * 1000;
  // Reject nonsense far in the past or future — better no date than a wrong one.
  if (t < now - YEAR || t > now + 2 * YEAR) return null;
  return new Date(t).toISOString();
}

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

  let parsed: { tasks: ParsedTask[] };
  try {
    const client = new Anthropic({ timeout: 25_000 });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: buildSystemPrompt(),
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: `Voice memo: "${text}"` }],
    });

    const block = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !block || block.type !== "text") {
      throw new Error("No usable response from the sorter");
    }
    parsed = JSON.parse(block.text);
  } catch {
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
      due_at: validDueAt(t.due_at),
    }));

  if (rows.length === 0) {
    rows.push({
      bucket: "Unsorted",
      task_text: text.slice(0, 90),
      raw_transcript: text,
      due_at: null,
    });
  }

  const supabase = getSupabase();
  let { data: inserted, error } = await supabase
    .from("tasks")
    .insert(rows)
    .select();

  // Until the due_at migration has been run in Supabase, the column doesn't
  // exist — retry without it so capture keeps working either way.
  if (error && /due_at/i.test(error.message)) {
    const legacyRows = rows.map(({ due_at, ...rest }) => rest);
    ({ data: inserted, error } = await supabase
      .from("tasks")
      .insert(legacyRows)
      .select());
  }

  if (error) {
    return NextResponse.json(
      { error: `Couldn't save: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ tasks: inserted });
}
