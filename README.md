# Brain Dump

Christine talks, the iPhone keyboard mic turns it into text, Claude sorts it
into her buckets, it saves to a list she can check off.

Buckets: Cheer, MFFA, Real Estate, Kids/Family, Blind Works Job, HUNS Job.
Anything unclear lands in Unsorted.

## What you need before it works

1. A Supabase project (her own, separate from focusedoutreach and
   leaselenz-prod).
2. An Anthropic API key from console.anthropic.com. This is different from
   your claude.ai login, it's a real API key for a real deployed app.

## Step by step

**1. Make her Supabase project**
Go to supabase.com, new project, name it something like
`christine-brain-dump`. Once it's done spinning up, go to the SQL Editor in
the left sidebar, paste in everything from `supabase/migration.sql` in this
folder, hit run. That creates the one table this app needs.

Then go to Project Settings, API. Grab two things:
- Project URL
- anon public key

**2. Push this to GitHub**
Same as always. New repo, name it `christine-brain-dump`, check "Add a
README file," check "Add .gitignore" and pick Node from the dropdown, skip
the license. Then push this folder's code into it (or hand this whole
folder to Claude Code and tell it to init the repo and push).

**3. Connect it to Vercel**
Import the repo in Vercel same as any other project. Before you deploy, add
three environment variables in the Vercel project settings:

```
NEXT_PUBLIC_SUPABASE_URL = (from step 1)
NEXT_PUBLIC_SUPABASE_ANON_KEY = (from step 1)
ANTHROPIC_API_KEY = (from console.anthropic.com)
```

Deploy. You'll get a URL.

**4. Get it on her phone**
Open the URL in Safari on her iPhone, tap the share icon, "Add to Home
Screen." Now it opens like a real app, no browser bar.

## How she actually uses it

Open the app, tap the text box, tap the mic icon on the iPhone keyboard,
talk. Tap "Sort it." It shows up under the right bucket in the Tasks tab.
Tap the circle to check something off.

## If something's off

- Nothing sorts / spinner never stops: check the ANTHROPIC_API_KEY is set
  right in Vercel and redeploy.
- Tasks tab stays empty: check the two Supabase env vars, and confirm the
  migration actually ran (Table Editor should show a `tasks` table).
- Everything lands in Unsorted: normal for weird phrasing, the model plays
  it safe. You can rename or tune the bucket list in `lib/buckets.ts`.
