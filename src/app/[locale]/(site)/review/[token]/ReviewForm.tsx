"use client";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { reviewByTokenAction } from "@/server/actions/account";

export function ReviewForm({ token }: { token: string }) {
  const t = useTranslations("review");
  const tc = useTranslations("common");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="text-4xl">⭐</div>
        <p className="text-lg font-semibold">{t("thanks")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} onClick={() => setRating(i)} aria-label={`${i}`}>
            <Star size={40} className={i <= rating ? "fill-brand stroke-brand" : "stroke-line"} />
          </button>
        ))}
      </div>
      <textarea
        className="input min-h-28 py-2"
        placeholder={t("placeholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {err && <p className="text-sm text-bad">{err}</p>}
      <button
        className="btn-primary w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await reviewByTokenAction(token, rating, text);
            if (r.ok) {
              setDone(true);
            } else {
              setErr(tc("error"));
            }
          })
        }
      >
        {t("send")}
      </button>
    </div>
  );
}
