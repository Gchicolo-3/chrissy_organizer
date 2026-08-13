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
