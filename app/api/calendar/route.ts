import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// ICS feed for Apple Calendar (Settings → Calendar → Accounts → Add
// Subscribed Calendar → this URL). Tasks with a due date become events.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function GET() {
  const { data, error } = await getSupabase()
    .from("tasks")
    .select("*")
    .not("due_at", "is", null)
    .eq("completed", false)
    .order("due_at", { ascending: true });

  if (error) {
    // Column not migrated yet, or DB error — serve an empty calendar rather
    // than breaking the subscription.
    return icsResponse([]);
  }
  return icsResponse((data ?? []) as CalendarTask[]);
}

type CalendarTask = {
  id: string;
  task_text: string;
  bucket: string;
  due_at: string;
};

function icsResponse(tasks: CalendarTask[]) {
  const now = icsUtc(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Brain Dump//chrissy-organizer//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Brain Dump",
  ];
  for (const t of tasks) {
    const start = new Date(t.due_at);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@chrissy-organizer`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsUtc(start.toISOString())}`,
      `DTEND:${icsUtc(end.toISOString())}`,
      `SUMMARY:${icsEscape(t.task_text)}`,
      `CATEGORIES:${icsEscape(t.bucket)}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="brain-dump.ics"',
    },
  });
}
