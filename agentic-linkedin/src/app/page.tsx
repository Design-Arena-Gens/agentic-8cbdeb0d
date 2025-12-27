"use client";

import { useEffect, useMemo, useState } from "react";

type PostLength = "short" | "medium" | "long";

type DraftStatus = "scheduled" | "generated" | "posted";

type LinkedInTopic = {
  id: string;
  topic: string;
  audience: string;
  tone: string;
  callToAction: string;
  hookStyle: string;
  hashtags: string[];
  brandVoice: string;
  keyPoints: string[];
  length: PostLength;
  scheduledFor: string;
  draft?: string;
  status: DraftStatus;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "linkedin-post-navigator::topics";

const defaultHookStyles = [
  "Story-driven insight",
  "Lead with data point",
  "Question that stirs curiosity",
  "Bold opinion",
  "Lessons learned format",
];

const defaultTones = [
  "Smart and optimistic",
  "Data-backed and authoritative",
  "Conversational mentor",
  "Bold and contrarian",
  "Humble storyteller",
];

const defaultAudience = [
  "Product managers",
  "Startup founders",
  "Tech sales leaders",
  "Design community",
  "AI enthusiasts",
];

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));

const todayISO = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString().slice(0, 10);
};

const generateId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

type FormState = {
  topic: string;
  audience: string;
  tone: string;
  callToAction: string;
  hookStyle: string;
  hashtags: string;
  keyPoints: string;
  brandVoice: string;
  length: PostLength;
  scheduledFor: string;
};

const initialFormState = (): FormState => ({
  topic: "",
  audience: "",
  tone: defaultTones[0] ?? "",
  callToAction: "",
  hookStyle: defaultHookStyles[0] ?? "",
  hashtags: "",
  keyPoints: "",
  brandVoice: "",
  length: "medium",
  scheduledFor: todayISO(),
});

export default function Home() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [topics, setTopics] = useState<LinkedInTopic[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as LinkedInTopic[];
      if (!Array.isArray(parsed)) return;
      setTopics(
        parsed.map((topic) => ({
          ...topic,
          status: topic.status ?? "scheduled",
        })),
      );
    } catch (error) {
      console.error("Failed to load saved topics", error);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(topics));
  }, [hydrated, topics]);

  const resetMessage = () => setMessage(null);

  const upsertTopic = (next: LinkedInTopic[]) => {
    setTopics(
      next.sort((a, b) => {
        if (a.scheduledFor === b.scheduledFor) {
          return a.createdAt - b.createdAt;
        }
        return a.scheduledFor.localeCompare(b.scheduledFor);
      }),
    );
  };

  const handleCreateTopic = () => {
    if (!form.topic.trim()) {
      setMessage({ kind: "error", text: "Topic title is required." });
      return;
    }

    const now = Date.now();
    const newTopic: LinkedInTopic = {
      id: generateId(),
      topic: form.topic.trim(),
      audience: form.audience.trim() || defaultAudience[0] || "LinkedIn network",
      tone: form.tone.trim() || defaultTones[0],
      callToAction: form.callToAction.trim(),
      hookStyle: form.hookStyle.trim() || defaultHookStyles[0],
      hashtags: form.hashtags
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean),
      brandVoice: form.brandVoice.trim(),
      keyPoints: form.keyPoints
        .split("\n")
        .map((point) => point.trim())
        .filter(Boolean),
      length: form.length,
      scheduledFor: form.scheduledFor || todayISO(),
      draft: undefined,
      status: "scheduled",
      createdAt: now,
      updatedAt: now,
    };

    upsertTopic([...topics, newTopic]);
    setForm(initialFormState());
    setSelectedTopicId(newTopic.id);
    setMessage({ kind: "success", text: "Topic added to the publishing queue." });
  };

  const mutateTopic = (id: string, mutate: (current: LinkedInTopic) => LinkedInTopic) => {
    upsertTopic(
      topics.map((topic) => (topic.id === id ? mutate({ ...topic }) : topic)),
    );
  };

  const handleGenerate = async (id: string) => {
    resetMessage();
    setGeneratingId(id);
    const topic = topics.find((item) => item.id === id);
    if (!topic) {
      setGeneratingId(null);
      setMessage({ kind: "error", text: "Topic not found." });
      return;
    }

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.topic,
          audience: topic.audience,
          tone: topic.tone,
          callToAction: topic.callToAction,
          hookStyle: topic.hookStyle,
          hashtags: topic.hashtags,
          brandVoice: topic.brandVoice,
          keyPoints: topic.keyPoints,
          length: topic.length,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Generation failed");
      }

      const payload = (await response.json()) as { draft: string };

      mutateTopic(id, (current) => ({
        ...current,
        draft: payload.draft,
        status: "generated",
        updatedAt: Date.now(),
      }));

      setSelectedTopicId(id);
      setMessage({ kind: "success", text: "Draft generated successfully." });
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to reach the AI generator.",
      });
    } finally {
      setGeneratingId(null);
    }
  };

  const handleDelete = (id: string) => {
    resetMessage();
    upsertTopic(topics.filter((item) => item.id !== id));
    if (selectedTopicId === id) {
      setSelectedTopicId(null);
    }
  };

  const handleStatusFlip = (id: string, status: DraftStatus) => {
    mutateTopic(id, (current) => ({
      ...current,
      status,
      updatedAt: Date.now(),
    }));
    setMessage({
      kind: "success",
      text: status === "posted" ? "Marked as posted." : "Status updated.",
    });
  };

  const handleCopy = async (draft?: string) => {
    if (!draft) {
      setMessage({ kind: "error", text: "Generate a draft before copying." });
      return;
    }
    try {
      await navigator.clipboard.writeText(draft);
      setMessage({ kind: "success", text: "Draft copied to clipboard." });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Clipboard copy failed.",
      });
    }
  };

  const selectedTopic = topics.find((topic) => topic.id === selectedTopicId);
  const upcoming = useMemo(
    () =>
      topics.filter((topic) => topic.status !== "posted" && topic.draft).length,
    [topics],
  );

  const todayQueue = useMemo(
    () =>
      topics.filter(
        (topic) =>
          topic.scheduledFor === todayISO() && topic.status !== "posted",
      ),
    [topics],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 pb-24 pt-14 sm:px-8">
      <section className="grid gap-6 rounded-3xl border border-slate-800 bg-slate-900/40 p-8 shadow-2xl shadow-slate-950/70 backdrop-blur">
        <div className="flex flex-col gap-3">
          <p className="text-sm uppercase tracking-[0.4em] text-sky-400">
            LinkedIn Post Navigator
          </p>
          <h1 className="text-4xl font-semibold text-slate-50 sm:text-5xl">
            Daily AI wingman for your LinkedIn presence.
          </h1>
          <p className="max-w-2xl text-base text-slate-300">
            Capture tomorrow&apos;s ideas, assign a vibe, and generate scroll-stopping posts on demand.
            Your queue, prompts, and drafts stay on this device—no SaaS lock-in required.
          </p>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-slate-300">
          <div className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/40 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            Today&apos;s queue:{" "}
            <strong className="font-semibold text-slate-50">
              {todayQueue.length}
            </strong>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/40 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Drafts ready:{" "}
            <strong className="font-semibold text-slate-50">{upcoming}</strong>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/40 px-4 py-2">
            <span className="h-2 w-2 rounded-full bg-fuchsia-400" />
            API status:{" "}
            <strong className="font-semibold text-slate-50">
              {process.env.NEXT_PUBLIC_API_STATUS ?? "Configured via .env"}
            </strong>
          </div>
        </div>
      </section>

      <section className="grid gap-6 rounded-3xl border border-slate-800 bg-slate-900/30 p-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-50">
              Plan tomorrow&apos;s talking points
            </h2>
            <p className="text-sm text-slate-400">
              Add a prompt, pick the vibe, and queue it for the day you want it to go live.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForm(initialFormState())}
            className="rounded-full border border-slate-700 px-4 py-2 text-xs uppercase tracking-widest text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            Reset form
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:gap-10">
          <div className="grid gap-5">
            <div className="grid gap-3">
              <label className="text-sm font-medium text-slate-200">
                Core topic or idea
              </label>
              <textarea
                className="min-h-[110px] rounded-2xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                placeholder="e.g. Lessons from shipping an AI feature without waiting for perfect data..."
                value={form.topic}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, topic: event.target.value }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-200">
                  Target audience
                </label>
                <input
                  className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                  placeholder="e.g. SaaS product managers"
                  value={form.audience}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      audience: event.target.value,
                    }))
                  }
                  list="audience-suggestions"
                />
                <datalist id="audience-suggestions">
                  {defaultAudience.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                  ))}
                </datalist>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-200">Tone</label>
                <input
                  className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                  placeholder="e.g. Conversational mentor"
                  value={form.tone}
                  list="tone-suggestions"
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, tone: event.target.value }))
                  }
                />
                <datalist id="tone-suggestions">
                  {defaultTones.map((tone) => (
                    <option key={tone} value={tone} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-200">
                  Hook style
                </label>
                <input
                  className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                  placeholder="e.g. Question that stirs curiosity"
                  value={form.hookStyle}
                  list="hook-style-suggestions"
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      hookStyle: event.target.value,
                    }))
                  }
                />
                <datalist id="hook-style-suggestions">
                  {defaultHookStyles.map((style) => (
                    <option key={style} value={style} />
                  ))}
                </datalist>
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-200">
                  Schedule for
                </label>
                <input
                  type="date"
                  className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                  value={form.scheduledFor}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      scheduledFor: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-200">
                  Key points (one per line)
                </label>
                <textarea
                  className="min-h-[90px] rounded-2xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Pain point, insight, example, result..."
                  value={form.keyPoints}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      keyPoints: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-200">
                  Call to action
                </label>
                <textarea
                  className="min-h-[90px] rounded-2xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                  placeholder="Invite comments, link to resource, nudge towards DM..."
                  value={form.callToAction}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      callToAction: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-200">
                  Brand voice cues
                </label>
                <textarea
                  className="min-h-[90px] rounded-2xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                  placeholder="e.g. First-person founder voice, add a playful line in Urdu..."
                  value={form.brandVoice}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      brandVoice: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-200">
                  Hashtags (comma separated)
                </label>
                <input
                  className="rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                  placeholder="#Product #Leadership..."
                  value={form.hashtags}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      hashtags: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-slate-200">
                  Length
                </label>
                <div className="flex rounded-full border border-slate-700 bg-slate-900/60 p-1 text-xs">
                  {(["short", "medium", "long"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({ ...prev, length: option }))
                      }
                      className={`rounded-full px-4 py-1 capitalize transition ${
                        form.length === option
                          ? "bg-sky-500 text-slate-900"
                          : "text-slate-300 hover:text-slate-100"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateTopic}
                className="mt-2 flex items-center justify-center rounded-2xl bg-sky-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 active:bg-sky-300 sm:mt-0"
              >
                Queue this topic
              </button>
            </div>

            {message && (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm transition ${
                  message.kind === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-200"
                }`}
              >
                {message.text}
              </div>
            )}
          </div>

          <aside className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-950/40 p-5 text-sm text-slate-300">
            <h3 className="text-base font-semibold text-slate-100">
              Daily rhythm
            </h3>
            <ul className="grid gap-3">
              <li className="rounded-2xl border border-white/5 bg-white/5 p-4">
                <p className="font-semibold text-slate-100">08:00 · Prime</p>
                <p className="text-xs text-slate-300">
                  Scan your queue, tweak prompts, lock the tone.
                </p>
              </li>
              <li className="rounded-2xl border border-white/5 bg-white/10 p-4">
                <p className="font-semibold text-slate-100">09:00 · Generate</p>
                <p className="text-xs text-slate-300">
                  Kick PostPilot to draft for the day&apos;s priority topic.
                </p>
              </li>
              <li className="rounded-2xl border border-white/5 bg-white/5 p-4">
                <p className="font-semibold text-slate-100">10:00 · Ship</p>
                <p className="text-xs text-slate-300">
                  Add human polish, copy, paste, and hit publish.
                </p>
              </li>
            </ul>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-xs text-slate-400">
              <p className="font-semibold uppercase tracking-widest text-slate-200">
                Power tips
              </p>
              <ul className="mt-2 space-y-2">
                <li>Use Urdu phrases in brand voice for signature flair.</li>
                <li>Drop 1 stat or punchline in key points to boost hooks.</li>
                <li>Rotate hook styles every day for higher engagement.</li>
              </ul>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-900/20 p-8">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-50">
              Publishing queue
            </h2>
            <p className="text-sm text-slate-400">
              Generate drafts, copy, and mark them as posted when they go live.
            </p>
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {topics.length} topics in rotation
          </p>
        </header>

        {topics.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-700/60 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
            Queue is empty. Start by capturing tomorrow&apos;s talking point and let the agent handle the draft.
          </div>
        ) : (
          <div className="grid gap-5">
            {topics.map((topic) => {
              const isSelected = selectedTopicId === topic.id;
              const hasDraft = Boolean(topic.draft);
              const statusColor =
                topic.status === "posted"
                  ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/30"
                  : topic.status === "generated"
                  ? "bg-sky-500/20 text-sky-100 border-sky-500/40"
                  : "bg-slate-800/60 text-slate-200 border-slate-700";

              return (
                <article
                  key={topic.id}
                  className={`grid gap-4 rounded-3xl border bg-slate-950/40 p-6 transition ${
                    isSelected ? "ring-2 ring-sky-500/60" : "hover:border-slate-600"
                  }`}
                >
                  <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-slate-400">
                        <span>{formatDate(topic.scheduledFor)}</span>
                        <span>·</span>
                        <span className="flex items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 ${statusColor}`}>
                            {topic.status}
                          </span>
                        </span>
                      </div>
                      <h3 className="text-xl font-semibold text-slate-50">
                        {topic.topic}
                      </h3>
                      <p className="text-sm text-slate-400">
                        Audience: <span className="text-slate-200">{topic.audience}</span> · Tone:{" "}
                        <span className="text-slate-200">{topic.tone}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                      {topic.hashtags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-slate-700 px-3 py-1 text-slate-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </header>

                  <dl className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-300 sm:grid-cols-2 sm:gap-4">
                    <div>
                      <dt className="font-semibold text-slate-200">Hook style</dt>
                      <dd>{topic.hookStyle}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-200">Length</dt>
                      <dd className="capitalize">{topic.length}</dd>
                    </div>
                    {topic.brandVoice && (
                      <div className="sm:col-span-2">
                        <dt className="font-semibold text-slate-200">Brand voice cues</dt>
                        <dd>{topic.brandVoice}</dd>
                      </div>
                    )}
                    {topic.keyPoints.length > 0 && (
                      <div className="sm:col-span-2">
                        <dt className="font-semibold text-slate-200">Key points to weave in</dt>
                        <dd>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            {topic.keyPoints.map((point, index) => (
                              <li key={index} className="text-slate-300">
                                {point}
                              </li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    )}
                    {topic.callToAction && (
                      <div className="sm:col-span-2">
                        <dt className="font-semibold text-slate-200">
                          Call to action
                        </dt>
                        <dd>{topic.callToAction}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleGenerate(topic.id)}
                      disabled={generatingId === topic.id}
                      className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-wait disabled:opacity-40"
                    >
                      {generatingId === topic.id ? "Generating…" : hasDraft ? "Regenerate draft" : "Generate draft"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(topic.draft)}
                      className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:text-slate-50"
                    >
                      Copy to clipboard
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleStatusFlip(
                          topic.id,
                          topic.status === "posted" ? "generated" : "posted",
                        )
                      }
                      className="rounded-full border border-emerald-500/60 px-4 py-2 text-sm text-emerald-200 transition hover:border-emerald-400 hover:text-emerald-100"
                    >
                      {topic.status === "posted" ? "Mark as pending" : "Mark as posted"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(topic.id)}
                      className="rounded-full border border-rose-500/60 px-4 py-2 text-sm text-rose-200 transition hover:border-rose-400 hover:text-rose-100"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTopicId((current) =>
                          current === topic.id ? null : topic.id,
                        )
                      }
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        isSelected
                          ? "border-sky-500 text-sky-200"
                          : "border-slate-700 text-slate-200 hover:border-slate-500 hover:text-slate-50"
                      }`}
                    >
                      {isSelected ? "Hide draft" : "Open draft"}
                    </button>
                  </div>

                  {isSelected && (
                    <section className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
                      <header className="flex items-center justify-between">
                        <h4 className="text-lg font-semibold text-slate-100">
                          AI draft
                        </h4>
                        <p className="text-xs text-slate-500">
                          Last updated{" "}
                          {new Intl.DateTimeFormat(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(topic.updatedAt))}
                        </p>
                      </header>
                      {topic.draft ? (
                        <article className="prose prose-invert max-w-none text-sm leading-6 text-slate-200">
                          {topic.draft
                            .split("\n")
                            .filter((paragraph) => paragraph.trim().length > 0)
                            .map((paragraph, index) => (
                              <p key={index}>{paragraph}</p>
                            ))}
                        </article>
                      ) : (
                        <p className="text-sm text-slate-400">
                          No draft yet. Click &ldquo;Generate draft&rdquo; to produce one instantly.
                        </p>
                      )}
                    </section>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
