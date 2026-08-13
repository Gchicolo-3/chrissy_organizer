"use client";

import { useState, useEffect, useRef } from "react";
import { ALL_BUCKETS, Bucket } from "@/lib/buckets";

type Task = {
  id: string;
  bucket: Bucket;
  task_text: string;
  raw_transcript: string;
  completed: boolean;
  created_at: string;
};

const BUCKET_COLORS: Record<string, string> = {
  Cheer: "bg-pink-100 text-pink-800 border-pink-300",
  MFFA: "bg-purple-100 text-purple-800 border-purple-300",
  "Real Estate": "bg-blue-100 text-blue-800 border-blue-300",
  "Kids/Family": "bg-amber-100 text-amber-800 border-amber-300",
  "Blind Works Job": "bg-teal-100 text-teal-800 border-teal-300",
  "HUNS Job": "bg-indigo-100 text-indigo-800 border-indigo-300",
  Unsorted: "bg-gray-100 text-gray-700 border-gray-300",
};

export default function Home() {
  const [tab, setTab] = useState<"capture" | "tasks">("capture");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Task | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function loadTasks() {
    setLoading(true);
    const res = await fetch("/api/tasks");
    const data = await res.json();
    setTasks(data.tasks || []);
    setLoading(false);
  }

  useEffect(() => {
    if (tab === "tasks") loadTasks();
  }, [tab]);

  async function handleSort() {
    if (!text.trim() || saving) return;
    setSaving(true);
    setLastSaved(null);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const data = await res.json();
      if (data.task) {
        setLastSaved(data.task);
        setText("");
        textareaRef.current?.focus();
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleComplete(task: Task) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, completed: !t.completed } : t
      )
    );
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  const grouped = ALL_BUCKETS.map((bucket) => ({
    bucket,
    items: tasks.filter((t) => t.bucket === bucket && !t.completed),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-4 py-3 sticky top-0 z-10">
        <h1 className="text-lg font-semibold">Brain Dump</h1>
      </header>

      <main className="flex-1 px-4 py-4 pb-24">
        {tab === "capture" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-500">
              Tap the box, hit the mic on your keyboard, talk. Then hit Sort
              it.
            </p>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Talk here..."
              rows={6}
              autoFocus
              className="w-full rounded-2xl border-2 border-gray-200 p-4 text-lg focus:border-blue-400 focus:outline-none resize-none"
            />
            <button
              onClick={handleSort}
              disabled={saving || !text.trim()}
              className="w-full rounded-2xl bg-blue-600 text-white text-lg font-semibold py-4 disabled:opacity-40 active:scale-95 transition"
            >
              {saving ? "Sorting..." : "Sort it"}
            </button>

            {lastSaved && (
              <div
                className={`rounded-xl border p-3 text-sm ${
                  BUCKET_COLORS[lastSaved.bucket] || BUCKET_COLORS.Unsorted
                }`}
              >
                Added to <strong>{lastSaved.bucket}</strong>:{" "}
                {lastSaved.task_text}
              </div>
            )}
          </div>
        )}

        {tab === "tasks" && (
          <div className="flex flex-col gap-4">
            {loading && <p className="text-sm text-gray-400">Loading...</p>}
            {!loading && grouped.length === 0 && (
              <p className="text-sm text-gray-400">
                Nothing yet. Go dump something.
              </p>
            )}
            {grouped.map((g) => (
              <div key={g.bucket}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  {g.bucket}
                </h2>
                <div className="flex flex-col gap-2">
                  {g.items.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 bg-white border rounded-xl px-3 py-3"
                    >
                      <button
                        onClick={() => toggleComplete(t)}
                        aria-label="complete"
                        className="w-6 h-6 rounded-full border-2 border-gray-300 flex-shrink-0"
                      />
                      <span className="flex-1 text-sm">{t.task_text}</span>
                      <button
                        onClick={() => deleteTask(t.id)}
                        aria-label="delete"
                        className="text-gray-300 text-sm"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t flex">
        <button
          onClick={() => setTab("capture")}
          className={`flex-1 py-3 text-sm font-medium ${
            tab === "capture" ? "text-blue-600" : "text-gray-400"
          }`}
        >
          Capture
        </button>
        <button
          onClick={() => setTab("tasks")}
          className={`flex-1 py-3 text-sm font-medium ${
            tab === "tasks" ? "text-blue-600" : "text-gray-400"
          }`}
        >
          Tasks
        </button>
      </nav>
    </div>
  );
}
