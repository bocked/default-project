"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import type { Quiz, QuizAttemptResponse, QuizDetailResponse, QuizQuestion, QuizResultPerQuestion } from "@/lib/types";

const OPTION_LETTERS = "ABCDEFGH".split("");

export default function TestsPage() {
  return (
    <Suspense
      fallback={<p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</p>}
    >
      <TestsContent />
    </Suspense>
  );
}

function TestsContent() {
  const params = useSearchParams();
  const id = params.get("id");
  // Keying the detail by id remounts it per quiz, so its state starts fresh.
  return id ? <QuizDetail key={id} quizId={id} /> : <QuizCatalog />;
}

function QuizCatalog() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<{ quizzes: Quiz[]; total: number }>("/api/quizzes?limit=30")
      .then((d) => {
        if (cancelled) return;
        setQuizzes(d.quizzes);
      })
      .catch(() => {
        if (!cancelled) setError("Testlar yuklab bo'lmadi");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Testlar</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Bilimingizni sinab ko&apos;ring va natijalaringizni saqlang.
          </p>
        </div>
        {user && (
          <Link
            href="/tests/create"
            className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
          >
            Yangi test yaratish
          </Link>
        )}
      </div>

      {error ? (
        <p className="rounded-2xl bg-rose-50 p-6 text-center text-sm text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
      ) : quizzes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm text-slate-500 dark:text-slate-400">Hozircha tasdiqlangan testlar yo&apos;q.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {quizzes.map((quiz) => (
            <Link
              key={quiz.id}
              href={`/tests?id=${encodeURIComponent(quiz.id)}`}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-blue-600 dark:shadow-none"
            >
              <h2 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-400">
                {quiz.title}
              </h2>
              {quiz.description && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{quiz.description}</p>
              )}
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
                <span>
                  {quiz.questionCount} ta savol · {quiz.attemptCount} ta urinish
                </span>
                <span className="flex items-center gap-1.5">
                  <Avatar url={quiz.author.avatarUrl} name={quiz.author.nickname} size={18} />
                  <span className="max-w-[100px] truncate">{quiz.author.nickname ?? "Noma'lum"}</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function QuizDetail({ quizId }: { quizId: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<QuizDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [result, setResult] = useState<QuizAttemptResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<QuizDetailResponse>(`/api/quizzes/${encodeURIComponent(quizId)}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setAnswers(d.quiz.questions ? new Array<number | null>(d.quiz.questions.length).fill(null) : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Test yuklab bo'lmadi");
      });
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  if (error) {
    return (
      <div className="space-y-4">
        <p className="rounded-2xl bg-rose-50 p-6 text-center text-sm text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </p>
        <p className="text-center">
          <Link href="/tests" className="text-blue-600 hover:underline dark:text-blue-400">
            ← Barcha testlar
          </Link>
        </p>
      </div>
    );
  }
  if (!data) {
    return <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</p>;
  }

  const { quiz, myResult } = data;
  const reviewAnswers = result ? result.perQuestion : myResult?.answers ?? null;

  async function submit(): Promise<void> {
    if (!user) {
      setPostError("Natijani saqlash uchun tizimga kiring.");
      return;
    }
    if (answers.some((a) => a === null)) {
      setPostError("Barcha savollarga javob berish kerak.");
      return;
    }
    setSubmitting(true);
    setPostError(null);
    try {
      const res = await api<QuizAttemptResponse>(`/api/quizzes/${encodeURIComponent(quizId)}/attempt`, {
        method: "POST",
        body: { answers: answers as number[] },
      });
      setResult(res);
    } catch (err) {
      setPostError(err instanceof ApiError ? err.message : "Natija saqlanmadi. Qayta urinib ko'ring.");
    } finally {
      setSubmitting(false);
    }
  }

  function setAnswer(qIndex: number, optionIndex: number): void {
    setAnswers((prev) => prev.map((v, i) => (i === qIndex ? optionIndex : v)));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{quiz.title}</h1>
          {quiz.description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{quiz.description}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Avatar url={quiz.author.avatarUrl} name={quiz.author.nickname} size={18} />
            <span>{quiz.author.nickname ?? "Noma'lum autor"}</span>
            <span>·</span>
            <span>{quiz.questionCount} ta savol</span>
            <span>·</span>
            <span>{quiz.attemptCount} ta urinish</span>
          </p>
        </div>
        <Link href="/tests" className="rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
          ← Barcha testlar
        </Link>
      </div>

      {!user && !reviewAnswers && (
        <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-300">
          Ushbu testni sinab ko&apos;rish va natijani saqlash uchun{" "}
          <Link href="/login" className="font-semibold underline">tizimga kiring</Link>.
        </p>
      )}

      {reviewAnswers ? (
        <ResultReview quiz={quiz} perQuestion={reviewAnswers} score={result?.score ?? myResult?.score ?? 0} total={result?.total ?? myResult?.total ?? quiz.questionCount} />
      ) : (
        <>
          <div className="space-y-4">
            {quiz.questions?.map((q, qi) => (
              <QuestionForm
                key={q.id}
                question={q}
                qi={qi}
                selected={answers[qi] ?? null}
                onSelect={(oi) => setAnswer(qi, oi)}
              />
            ))}
          </div>

          {/* The author / admins see the answer key revealed by the server. */}
          {quiz.questions && quiz.questions.some((q) => q.correctIndex !== null) && (
            <AnswerKey questions={quiz.questions} />
          )}

          {postError && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">{postError}</p>}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 dark:hover:bg-blue-500"
            >
              {submitting ? "Tekshirilmoqda..." : "Natijani tekshirish"}
            </button>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {answers.filter((a) => a !== null).length}/{quiz.questionCount} javob berildi
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function QuestionForm({
  question,
  qi,
  selected,
  onSelect,
}: {
  question: QuizQuestion;
  qi: number;
  selected: number | null;
  onSelect: (optionIndex: number) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
      <legend className="text-sm font-semibold text-slate-900 dark:text-white">
        {qi + 1}. {question.question}
      </legend>
      <div className="mt-3 space-y-2">
        {question.options.map((option, oi) => {
          const active = selected === oi;
          return (
            <label
              key={oi}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                active
                  ? "border-blue-500 bg-blue-50 text-slate-900 dark:border-blue-500 dark:bg-blue-950/40 dark:text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <input
                type="radio"
                name={`q-${question.id}`}
                checked={active}
                onChange={() => onSelect(oi)}
                className="mt-0.5 h-4 w-4 accent-blue-600"
              />
              <span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{OPTION_LETTERS[oi] ?? oi + 1}.</span>{" "}
                {option}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ResultReview({
  quiz,
  perQuestion,
  score,
  total,
}: {
  quiz: Quiz;
  perQuestion: QuizResultPerQuestion[];
  score: number;
  total: number;
}) {
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  return (
    <div className="space-y-5">
      <div
        className={`rounded-2xl border p-6 text-center ${
          percent >= 60
            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/30"
            : "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
        }`}
      >
        <p className="text-4xl font-bold text-slate-900 dark:text-white">{percent}%</p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {score} / {total} to&apos;g&apos;ri javob
        </p>
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          {percent >= 60 ? "Yaxshi natija! 🎉" : "Qayta urinib ko'ring — o'rganish davom etadi."}
        </p>
      </div>

      <div className="space-y-4">
        {quiz.questions?.map((q, qi) => {
          const grading = perQuestion[qi];
          if (!grading) return null;
          return (
            <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {qi + 1}. {q.question}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    grading.correct
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                  }`}
                >
                  {grading.correct ? "To'g'ri" : "Noto'g'ri"}
                </span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {q.options.map((option, oi) => {
                  const isCorrect = grading.correctIndex === oi;
                  const isYourPick = grading.yourAnswer === oi;
                  const cls = isCorrect
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : isYourPick
                      ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
                      : "border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400";
                  return (
                    <li key={oi} className={`rounded-xl border px-3 py-2 text-sm ${cls}`}>
                      <span className="font-semibold">{OPTION_LETTERS[oi] ?? oi + 1}.</span> {option}
                      {isCorrect && <span className="ml-2 text-xs font-semibold">✓ To&apos;g&apos;ri javob</span>}
                      {isYourPick && !isCorrect && <span className="ml-2 text-xs font-semibold">✗ Sizning javobingiz</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="text-center">
        <Link href="/tests" className="text-blue-600 hover:underline dark:text-blue-400">
          ← Boshqa testlar
        </Link>
      </p>
    </div>
  );
}

function AnswerKey({ questions }: { questions: QuizQuestion[] }) {
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-950/30">
      <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-300">To&apos;g&apos;ri javoblar</h3>
      <ul className="mt-2 space-y-1 text-sm text-amber-800 dark:text-amber-300">
        {questions.map((q, qi) => {
          const idx = q.correctIndex;
          return (
            <li key={q.id}>
              {qi + 1}. {q.question.trim().slice(0, 60)} — <strong>{idx !== null ? OPTION_LETTERS[idx] ?? idx + 1 : "?"}</strong>
            </li>
          );
        })}
      </ul>
    </div>
  );
}