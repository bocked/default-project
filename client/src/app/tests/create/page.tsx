"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import type { Quiz } from "@/lib/types";

const OPTION_LETTERS = "ABCDEFGH".split("");
const MAX_QUESTIONS = 30;
const MAX_OPTIONS = 8;

interface DraftQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

function emptyQuestion(): DraftQuestion {
  return { question: "", options: ["", ""], correctIndex: 0 };
}

export default function CreateQuizPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Quiz | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</p>;
  }

  if (created) {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-6 text-center dark:border-emerald-700 dark:bg-emerald-950/30">
          <h1 className="text-lg font-semibold text-emerald-900 dark:text-emerald-300">Test yaratildi ✓</h1>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
            {created.status === "APPROVED"
              ? "Test tasdiqlangan va hammaga ochiq."
              : "Test moderatsiyaga yuborildi. Admin tasdiqlagach hammaga ochiladi."}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {created.status === "APPROVED" ? (
            <Link
              href={`/tests?id=${encodeURIComponent(created.id)}`}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
            >
              Testni ochish
            </Link>
          ) : (
            <Link
              href="/tests"
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
            >
              Barcha testlar
            </Link>
          )}
          <Link
            href="/profile"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Profilga qaytish
          </Link>
        </div>
      </div>
    );
  }

  function setQuestion(i: number, patch: Partial<DraftQuestion>): void {
    setQuestions((prev) => prev.map((q, qi) => (qi === i ? { ...q, ...patch } : q)));
  }

  function addQuestion(): void {
    setQuestions((prev) => (prev.length >= MAX_QUESTIONS ? prev : [...prev, emptyQuestion()]));
  }

  function removeQuestion(i: number): void {
    setQuestions((prev) => (prev.length === 1 ? prev : prev.filter((_, qi) => qi !== i)));
  }

  function removeOption(qi: number, oi: number): void {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qi) return q;
        if (q.options.length <= 2) return q;
        const options = q.options.filter((_, j) => j !== oi);
        return { ...q, options, correctIndex: q.correctIndex >= options.length ? 0 : q.correctIndex };
      })
    );
  }

  function addOption(qi: number): void {
    setQuestions((prev) =>
      prev.map((q, i) => (i === qi && q.options.length < MAX_OPTIONS ? { ...q, options: [...q.options, ""] } : q))
    );
  }

  function validate(): string | null {
    if (title.trim().length < 3) return "Test nomi kamida 3 ta belgidan iborat bo'lishi kerak.";
    if (questions.length === 0) return "Kamida bitta savol qo'shing.";
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) return `${i + 1}-savol matnini kiriting.`;
      if (q.options.length < 2) return `${i + 1}-savolda kamida 2 ta variant bo'lishi kerak.`;
      if (q.options.some((o) => !o.trim())) return `${i + 1}-savolda bo'sh variant bor.`;
      if (q.correctIndex >= q.options.length) return `${i + 1}-savolda to'g'ri javob belgilanmagan.`;
    }
    return null;
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { quiz } = await api<{ quiz: Quiz }>("/api/quizzes", {
        method: "POST",
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          questions: questions.map((q) => ({
            question: q.question.trim(),
            options: q.options.map((o) => o.trim()),
            correctIndex: q.correctIndex,
          })),
        },
      });
      setCreated(quiz);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Test saqlanmadi. Qayta urinib ko'ring.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Yangi test yaratish</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Savol va javob variantlarini kiriting. To&apos;g&apos;ri javob bering, qolganini tizim hal qiladi.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Test nomi *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            required
            placeholder="Masalan: O'zbekiston poytaxtlari"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
          />
          <label className="mb-1 mt-4 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Tavsif (ixtiyoriy)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Test haqida qisqacha ma'lumot"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Savollar ({questions.length}/{MAX_QUESTIONS})
            </h2>
            <button
              type="button"
              onClick={addQuestion}
              disabled={questions.length >= MAX_QUESTIONS}
              className="rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              + Savol qo&apos;shish
            </button>
          </div>

          {questions.map((q, qi) => (
            <div
              key={qi}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none"
            >
              <div className="flex items-start justify-between gap-2">
                <label className="block flex-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {qi + 1}-savol *
                </label>
                <button
                  type="button"
                  onClick={() => removeQuestion(qi)}
                  disabled={questions.length === 1}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                  O&apos;chirish
                </button>
              </div>
              <input
                value={q.question}
                onChange={(e) => setQuestion(qi, { question: e.target.value })}
                maxLength={500}
                placeholder="Savol matnini kiriting"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
              />

              <p className="mb-1 mt-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                To&apos;g&apos;ri javobni belgilang *
              </p>
              <div className="space-y-2">
                {q.options.map((option, oi) => {
                  const isCorrect = q.correctIndex === oi;
                  return (
                    <div key={oi} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${qi}`}
                        checked={isCorrect}
                        onChange={() => setQuestion(qi, { correctIndex: oi })}
                        className="h-4 w-4 shrink-0 accent-blue-600"
                        aria-label={`${qi + 1}-savolning ${OPTION_LETTERS[oi] ?? oi + 1} variantini to'g'ri deb belgilash`}
                      />
                      <span className="w-6 shrink-0 text-center text-sm font-semibold text-slate-400">
                        {OPTION_LETTERS[oi] ?? oi + 1}
                      </span>
                      <input
                        value={option}
                        onChange={(e) => setQuestion(qi, { options: q.options.map((o, j) => (j === oi ? e.target.value : o)) })}
                        maxLength={200}
                        placeholder={`Variant ${oi + 1}`}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(qi, oi)}
                        disabled={q.options.length <= 2}
                        aria-label="Variantni o'chirish"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm text-rose-500 transition hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-950/40"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
              {q.options.length < MAX_OPTIONS && (
                <button
                  type="button"
                  onClick={() => addOption(qi)}
                  className="mt-2 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                >
                  + Variant qo&apos;shish ({q.options.length}/{MAX_OPTIONS})
                </button>
              )}
            </div>
          ))}
        </div>

        {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 dark:hover:bg-blue-500"
          >
            {saving ? "Saqlanmoqda..." : "Testni yuborish"}
          </button>
          <Link href="/tests" className="text-sm text-slate-500 hover:underline dark:text-slate-400">
            Bekor qilish
          </Link>
        </div>
      </form>
    </div>
  );
}