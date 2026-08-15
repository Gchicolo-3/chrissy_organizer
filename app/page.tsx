"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ALL_BUCKETS, BUCKET_STYLE, Bucket, Task } from "@/lib/buckets";

function formatDue(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Tab = "capture" | "tasks";

export default function Home() {
  const [tab, setTab] = useState<Tab>("capture");

  // Capture state
  const [text, setText] = useState("");
  const [sorting, setSorting] = useState(false);
  const [justSorted, setJustSorted] = useState<Task[]>([]);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  // Undo-delete toast
  const [pendingUndo, setPendingUndo] = useState<Task | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit sheet
  const [editing, setEditing] = useState<Task | null>(null);
  const [editText, setEditText] = useState("");
  const [editBucket, setEditBucket] = useState<Bucket>("Unsorted");
  const [editDueCleared, setEditDueCleared] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  function openEdit(task: Task) {
    setEditing(task);
    setEditText(task.task_text);
    setEditBucket(task.bucket);
    setEditDueCleared(false);
  }

  async function saveEdit() {
    if (!editing || !editText.trim() || editSaving) return;
    setEditSaving(true);
    const patch: Record<string, unknown> = {
      task_text: editText.trim(),
      bucket: editBucket,
    };
    if (editDueCleared) patch.due_at = null;
    try {
      const res = await fetch(`/api/tasks/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.task) throw new Error(data.error);
      setTasks((prev) =>
        prev.map((t) => (t.id === editing.id ? { ...t, ...data.task } : t))
      );
      setEditing(null);
    } catch {
      // Keep the sheet open so nothing she typed is lost.
    } finally {
      setEditSaving(false);
    }
  }

  const loadTasks = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't load tasks");
      setTasks(data.tasks || []);
    } catch (e: any) {
      if (!silent) setLoadError(e?.message || "Couldn't load tasks");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "tasks") loadTasks();
  }, [tab, loadTasks]);

  // Refresh quietly when she comes back to the app.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") loadTasks(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadTasks]);

  async function handleSort() {
    if (!text.trim() || sorting) return;
    setSorting(true);
    setJustSorted([]);
    setCaptureError(null);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.tasks?.length) {
        throw new Error(data.error || "Something went wrong. Try again?");
      }
      setJustSorted(data.tasks);
      setTasks((prev) => [...data.tasks, ...prev]);
      setText("");
    } catch (e: any) {
      setCaptureError(e?.message || "No connection. Your words are still in the box — try again.");
    } finally {
      setSorting(false);
    }
  }

  async function toggleComplete(task: Task) {
    const completed = !task.completed;
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed } : t))
    );
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, completed: !completed } : t))
      );
    }
  }

  async function deleteTask(task: Task) {
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setPendingUndo(task);
    undoTimer.current = setTimeout(() => setPendingUndo(null), 6000);
    try {
      await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    } catch {
      // Row may survive; next refresh will show it again.
    }
  }

  async function undoDelete() {
    const task = pendingUndo;
    if (!task) return;
    setPendingUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket: task.bucket,
          task_text: task.task_text,
          raw_transcript: task.raw_transcript,
          completed: task.completed,
        }),
      });
      const data = await res.json();
      if (res.ok && data.task) {
        setTasks((prev) => [data.task, ...prev]);
      }
    } catch {
      // If restore fails, a refresh keeps state honest.
    }
  }

  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);
  const grouped = ALL_BUCKETS.map((bucket) => ({
    bucket,
    items: open.filter((t) => t.bucket === bucket),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header
        className="sticky top-0 z-10 bg-paper/90 backdrop-blur px-5 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <h1 className="text-[22px] font-bold tracking-tight text-ink">
          {tab === "capture" ? "Brain Dump" : "Tasks"}
        </h1>
        <p className="text-[13px] text-stone-500 mt-0.5">
          {tab === "capture"
            ? "Talk it out. It sorts itself."
            : open.length === 0
              ? "All clear."
              : `${open.length} thing${open.length === 1 ? "" : "s"} on your plate`}
        </p>
      </header>

      <main className="flex-1 px-5 pt-2 pb-40">
        {tab === "capture" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl bg-white ring-1 ring-stone-200 shadow-sm p-1.5">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Tap here, hit the mic, and just talk — ramble all you want."
                rows={7}
                autoFocus
                enterKeyHint="done"
                className="w-full rounded-[20px] p-4 text-[17px] leading-relaxed bg-transparent placeholder:text-stone-400 focus:outline-none resize-none"
              />
            </div>

            <button
              onClick={handleSort}
              disabled={sorting || !text.trim()}
              className="w-full rounded-2xl bg-ink text-white text-[17px] font-semibold py-4 min-h-[56px] shadow-sm disabled:opacity-30 active:scale-[0.98] transition-transform"
            >
              {sorting ? "Sorting it out…" : "Sort it"}
            </button>

            {captureError && (
              <div className="animate-card-in rounded-2xl bg-red-50 ring-1 ring-red-200 text-red-800 px-4 py-3 text-[15px]">
                {captureError}
              </div>
            )}

            {justSorted.length > 0 && (
              <div className="flex flex-col gap-2 pt-1">
                <p className="text-[13px] font-medium text-stone-500 px-1">
                  Saved {justSorted.length}{" "}
                  {justSorted.length === 1 ? "task" : "tasks"} ✓
                </p>
                {justSorted.map((t, i) => {
                  const s = BUCKET_STYLE[t.bucket] || BUCKET_STYLE.Unsorted;
                  return (
                    <div
                      key={t.id}
                      className={`animate-card-in rounded-2xl ring-1 px-4 py-3 ${s.card}`}
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <span className="block text-[11px] font-semibold uppercase tracking-wider opacity-70">
                        {t.bucket}
                      </span>
                      <span className="block text-[15px] mt-0.5">
                        {t.task_text}
                      </span>
                    </div>
                  );
                })}
                <button
                  onClick={() => setTab("tasks")}
                  className="self-start px-1 py-2 text-[15px] font-medium text-stone-600 underline underline-offset-4 decoration-stone-300"
                >
                  See all tasks →
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "tasks" && (
          <div className="flex flex-col gap-6">
            {loading && (
              <div className="flex flex-col gap-3 pt-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-14 rounded-2xl bg-stone-200/60 animate-pulse"
                  />
                ))}
              </div>
            )}

            {!loading && loadError && (
              <div className="rounded-2xl bg-red-50 ring-1 ring-red-200 text-red-800 px-4 py-3 text-[15px]">
                {loadError}
                <button
                  onClick={() => loadTasks()}
                  className="block mt-2 font-semibold underline underline-offset-4"
                >
                  Try again
                </button>
              </div>
            )}

            {!loading && !loadError && grouped.length === 0 && (
              <div className="pt-16 text-center">
                <p className="text-4xl mb-3">🎉</p>
                <p className="text-[15px] text-stone-500">
                  Nothing on the list.
                  <br />
                  Go dump something.
                </p>
              </div>
            )}

            {!loading &&
              grouped.map((g) => {
                const s = BUCKET_STYLE[g.bucket];
                return (
                  <section key={g.bucket}>
                    <div className="flex items-center gap-2 px-1 mb-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                      <h2 className="text-[13px] font-semibold uppercase tracking-wider text-stone-600">
                        {g.bucket}
                      </h2>
                      <span className="text-[13px] text-stone-400">
                        {g.items.length}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {g.items.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center bg-white ring-1 ring-stone-200 rounded-2xl shadow-sm pr-1"
                        >
                          <button
                            onClick={() => toggleComplete(t)}
                            aria-label={`Mark "${t.task_text}" done`}
                            className="shrink-0 w-14 min-h-[56px] flex items-center justify-center"
                          >
                            <span className="w-[26px] h-[26px] rounded-full border-2 border-stone-300 transition-colors" />
                          </button>
                          <button
                            onClick={() => openEdit(t)}
                            className="flex-1 py-4 pr-2 text-left"
                          >
                            <span className="block text-[16px] leading-snug text-ink">
                              {t.task_text}
                            </span>
                            {t.due_at && (
                              <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-stone-500">
                                <svg
                                  width="11"
                                  height="11"
                                  viewBox="0 0 12 12"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                >
                                  <circle cx="6" cy="6" r="5" />
                                  <path d="M6 3.5V6l1.8 1.2" strokeLinecap="round" />
                                </svg>
                                {formatDue(t.due_at)}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => deleteTask(t)}
                            aria-label={`Delete "${t.task_text}"`}
                            className="shrink-0 w-11 min-h-[56px] flex items-center justify-center text-stone-300 active:text-stone-500"
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            >
                              <path d="M3 3l10 10M13 3L3 13" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}

            {!loading && done.length > 0 && (
              <section className="pb-2">
                <button
                  onClick={() => setShowDone((v) => !v)}
                  className="flex items-center gap-2 px-1 mb-2 min-h-[44px]"
                >
                  <h2 className="text-[13px] font-semibold uppercase tracking-wider text-stone-400">
                    Done · {done.length}
                  </h2>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className={`text-stone-400 transition-transform ${showDone ? "rotate-180" : ""}`}
                  >
                    <path d="M2 4l4 4 4-4" />
                  </svg>
                </button>
                {showDone && (
                  <div className="flex flex-col gap-2">
                    {done.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center bg-stone-100/70 ring-1 ring-stone-200/70 rounded-2xl pr-1"
                      >
                        <button
                          onClick={() => toggleComplete(t)}
                          aria-label={`Mark "${t.task_text}" not done`}
                          className="shrink-0 w-14 min-h-[52px] flex items-center justify-center"
                        >
                          <span className="w-[26px] h-[26px] rounded-full bg-stone-400 flex items-center justify-center">
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 14 14"
                              fill="none"
                              stroke="white"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M2 7.5l3.2 3.2L12 4" />
                            </svg>
                          </span>
                        </button>
                        <span className="flex-1 py-3.5 pr-2 text-[15px] text-stone-400 line-through">
                          {t.task_text}
                        </span>
                        <button
                          onClick={() => deleteTask(t)}
                          aria-label={`Delete "${t.task_text}"`}
                          className="shrink-0 w-11 min-h-[52px] flex items-center justify-center text-stone-300"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          >
                            <path d="M3 3l10 10M13 3L3 13" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {editing && (
        <div className="fixed inset-0 z-40 flex items-end">
          <button
            aria-label="Close"
            onClick={() => setEditing(null)}
            className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]"
          />
          <div
            className="relative w-full bg-white rounded-t-3xl shadow-2xl px-5 pt-5 animate-toast-in"
            style={{ paddingBottom: "calc(var(--safe-bottom) + 20px)" }}
          >
            <div className="mx-auto w-10 h-1 rounded-full bg-stone-200 mb-4" />
            <p className="text-[13px] font-semibold uppercase tracking-wider text-stone-500 mb-2">
              Edit task
            </p>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={2}
              className="w-full rounded-2xl ring-1 ring-stone-200 p-4 text-[16px] leading-snug focus:outline-none focus:ring-2 focus:ring-stone-400 resize-none"
            />
            {editing.due_at && !editDueCleared && (
              <button
                onClick={() => setEditDueCleared(true)}
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-stone-100 ring-1 ring-stone-200 px-3 py-2 text-[13px] font-medium text-stone-600"
              >
                {formatDue(editing.due_at)}
                <span aria-hidden className="text-stone-400">✕</span>
              </button>
            )}
            {editDueCleared && (
              <p className="mt-2 text-[13px] text-stone-400">
                Date will be removed when you save.
              </p>
            )}
            <p className="text-[13px] font-semibold uppercase tracking-wider text-stone-500 mt-4 mb-2">
              Bucket
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_BUCKETS.map((b) => {
                const s = BUCKET_STYLE[b];
                const active = editBucket === b;
                return (
                  <button
                    key={b}
                    onClick={() => setEditBucket(b)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 min-h-[40px] text-[14px] font-medium ring-1 transition-colors ${
                      active
                        ? "bg-ink text-white ring-ink"
                        : `${s.chip}`
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${active ? "bg-white" : s.dot}`} />
                    {b}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 rounded-2xl ring-1 ring-stone-200 text-stone-600 text-[16px] font-semibold py-3.5 min-h-[52px]"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving || !editText.trim()}
                className="flex-[2] rounded-2xl bg-ink text-white text-[16px] font-semibold py-3.5 min-h-[52px] disabled:opacity-30"
              >
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingUndo && (
        <div
          className="fixed left-5 right-5 z-30 animate-toast-in"
          style={{ bottom: "calc(var(--safe-bottom) + 84px)" }}
        >
          <div className="flex items-center justify-between bg-ink text-white rounded-2xl px-4 py-3 shadow-lg">
            <span className="text-[14px] truncate pr-3">Task deleted</span>
            <button
              onClick={undoDelete}
              className="text-[14px] font-semibold text-amber-300 min-h-[32px] px-2"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur border-t border-stone-200 flex"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      >
        <TabButton
          active={tab === "capture"}
          label="Capture"
          onClick={() => setTab("capture")}
          icon={
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          }
        />
        <TabButton
          active={tab === "tasks"}
          label="Tasks"
          onClick={() => setTab("tasks")}
          badge={open.length > 0 ? open.length : undefined}
          icon={
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6.5l1.7 1.7L9 4.9M4 13l1.7 1.7L9 11.4M4 19.5l1.7 1.7L9 17.9" />
              <path d="M12.5 7h7M12.5 13.5h7M12.5 20h7" />
            </svg>
          }
        />
      </nav>
    </div>
  );
}

function TabButton({
  active,
  label,
  icon,
  onClick,
  badge,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-2 min-h-[58px] ${
        active ? "text-ink" : "text-stone-400"
      }`}
    >
      <span className="relative">
        {icon}
        {badge !== undefined && (
          <span className="absolute -top-1.5 -right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[11px] font-semibold flex items-center justify-center">
            {badge > 99 ? "99" : badge}
          </span>
        )}
      </span>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  );
}
