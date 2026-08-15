export const BUCKETS = [
  "Cheer",
  "MFFA",
  "Real Estate",
  "Kids/Family",
  "Blind Works Job",
  "HUNS Job",
] as const;

export type Bucket = (typeof BUCKETS)[number] | "Unsorted";

export const ALL_BUCKETS: Bucket[] = [...BUCKETS, "Unsorted"];

export function isBucket(value: unknown): value is Bucket {
  return typeof value === "string" && (ALL_BUCKETS as string[]).includes(value);
}

export type Task = {
  id: string;
  bucket: Bucket;
  task_text: string;
  raw_transcript: string | null;
  completed: boolean;
  created_at: string;
  completed_at: string | null;
  due_at?: string | null;
};

// Display styling per bucket. Soft tinted surfaces with deep, readable text.
export const BUCKET_STYLE: Record<
  Bucket,
  { dot: string; chip: string; card: string }
> = {
  Cheer: {
    dot: "bg-rose-400",
    chip: "bg-rose-50 text-rose-900 ring-rose-200",
    card: "bg-rose-50/80 ring-rose-200/70 text-rose-950",
  },
  MFFA: {
    dot: "bg-violet-400",
    chip: "bg-violet-50 text-violet-900 ring-violet-200",
    card: "bg-violet-50/80 ring-violet-200/70 text-violet-950",
  },
  "Real Estate": {
    dot: "bg-sky-400",
    chip: "bg-sky-50 text-sky-900 ring-sky-200",
    card: "bg-sky-50/80 ring-sky-200/70 text-sky-950",
  },
  "Kids/Family": {
    dot: "bg-amber-400",
    chip: "bg-amber-50 text-amber-900 ring-amber-200",
    card: "bg-amber-50/80 ring-amber-200/70 text-amber-950",
  },
  "Blind Works Job": {
    dot: "bg-teal-400",
    chip: "bg-teal-50 text-teal-900 ring-teal-200",
    card: "bg-teal-50/80 ring-teal-200/70 text-teal-950",
  },
  "HUNS Job": {
    dot: "bg-indigo-400",
    chip: "bg-indigo-50 text-indigo-900 ring-indigo-200",
    card: "bg-indigo-50/80 ring-indigo-200/70 text-indigo-950",
  },
  Unsorted: {
    dot: "bg-stone-400",
    chip: "bg-stone-100 text-stone-700 ring-stone-200",
    card: "bg-stone-100/80 ring-stone-200/70 text-stone-800",
  },
};
