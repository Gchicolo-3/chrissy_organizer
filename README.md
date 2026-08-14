# Brain Dump (chrissy-organizer)

Voice brain-dump app for Christine. She taps the box, talks with the iPhone
keyboard mic, hits **Sort it**, and Claude splits the ramble into separate
tasks, sorts each into one of her buckets, and saves them. The **Tasks** tab
shows everything grouped by bucket.

Live at **https://chrissy-organizer.vercel.app**

## Stack

- **Next.js 14** (app router) on Vercel — project `chrissy-organizer`
- **Supabase** — one `tasks` table (`supabase/migration.sql`)
- **Claude API** (`claude-haiku-4-5`) via the official `@anthropic-ai/sdk`,
  using structured outputs (JSON schema) so the split/classify result is
  always valid JSON — no fence-stripping or parse retries

## How it works

- `POST /api/classify` — takes the raw transcript, asks Haiku to split it
  into tasks (each assigned to a bucket via an enum-constrained schema),
  validates buckets server-side, and batch-inserts all rows in one call.
  If the model call fails for any reason, the dump is still saved as a
  single Unsorted task so nothing she says is ever lost.
- `GET /api/tasks` — returns all tasks, newest first.
- `POST /api/tasks` — manual insert (used by undo-after-delete).
- `PATCH/DELETE /api/tasks/[id]` — complete/uncomplete, edit, delete.

Buckets live in `lib/buckets.ts` (names, type guard, and per-bucket colors).
To add or rename a bucket, edit that file and the classify system prompt in
`app/api/classify/route.ts`.

## The bug this rebuild fixed (do not regress this)

Every API route exports `export const dynamic = "force-dynamic"`.

Without it, Next.js 14 **statically prerenders a GET route handler at build
time** and Vercel serves that frozen snapshot from its edge cache forever.
That is exactly what happened to `/api/tasks`: inserts succeeded, but the
Tasks tab always received the empty `{"tasks":[]}` captured when the build
ran against an empty table (confirmed in Vercel runtime logs — the requests
were served `cache=HIT` from the static prerender and never reached a
function). If you add a new API route, copy the `dynamic`/`runtime` exports
from an existing one.

## Environment variables (set in the Vercel project)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
```

For local dev, copy `.env.example` to `.env.local` and fill these in, then
`npm install && npm run dev`.

## Deploying — important

The Vercel project **is connected to this GitHub repo**: pushes to `main`
deploy to production, and pushes to other branches build previews.

**Deploy through git only.** The project also accepts direct uploads
(`vercel --prod` / API), and several deployments were made that way —
which is how production ended up running code that was never committed,
making the caching bug much harder to trace. Treat this repo as the single
source of truth: commit, push, let Vercel build.
