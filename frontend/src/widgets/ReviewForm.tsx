"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { useAuthStore } from "@/entities/auth/store";
import {
  useDeleteReviewMutation,
  useMyReviewQuery,
  useSubmitReviewMutation,
  useUpdateReviewMutation,
} from "@/entities/reviews/queries";

function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-1" onMouseLeave={() => setHovered(0)}>
      {Array.from({ length: 5 }, (_, index) => {
        const rating = index + 1;
        const filled = rating <= (hovered || value);
        return (
          <button
            key={rating}
            type="button"
            aria-label={`Оценка ${rating} из 5`}
            onMouseEnter={() => setHovered(rating)}
            onClick={() => onChange(rating)}
            className="p-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Star
              className={`h-6 w-6 ${filled ? "fill-ink text-ink" : "text-ink/20"}`}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}

export function ReviewForm({ slug }: { slug: string }) {
  const status = useAuthStore((state) => state.status);
  const { data, isLoading } = useMyReviewQuery(slug);
  const submitReview = useSubmitReviewMutation(slug);
  const updateReview = useUpdateReviewMutation(slug);
  const deleteReview = useDeleteReviewMutation(slug);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  if (status !== "authenticated" || isLoading || !data) return null;

  if (data.review && !isEditing) {
    return (
      <div className="rounded-xl border border-ink/10 bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                className={`h-4 w-4 ${
                  index < data.review!.rating ? "fill-ink text-ink" : "text-ink/15"
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
          <span className="text-xs font-medium text-ink-muted">
            {data.review.status === "pending" && "На модерации"}
            {data.review.status === "approved" && "Опубликован"}
            {data.review.status === "rejected" && "Отклонён"}
          </span>
        </div>
        {data.review.comment && <p className="mt-2 text-sm text-ink">{data.review.comment}</p>}
        <div className="mt-3 flex gap-3 text-sm">
          <button
            type="button"
            onClick={() => {
              setRating(data.review!.rating);
              setComment(data.review!.comment ?? "");
              setIsEditing(true);
            }}
            className="font-medium text-brand hover:text-brand/80"
          >
            Изменить
          </button>
          <button
            type="button"
            onClick={() => deleteReview.mutate()}
            disabled={deleteReview.isPending}
            className="text-ink-muted hover:text-accent-sale-700"
          >
            Удалить
          </button>
        </div>
      </div>
    );
  }

  if (!data.eligible) return null;

  const mutation = data.review ? updateReview : submitReview;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (rating === 0) return;
        mutation.mutate(
          { rating, comment: comment.trim() || null },
          { onSuccess: () => setIsEditing(false) }
        );
      }}
      className="flex flex-col gap-3 rounded-xl border border-ink/10 p-4"
    >
      <p className="font-display text-sm font-semibold text-ink">
        {data.review ? "Изменить отзыв" : "Оставить отзыв"}
      </p>
      <StarPicker value={rating} onChange={setRating} />
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Что понравилось или не понравилось?"
        rows={3}
        className="rounded-lg border border-ink/15 bg-bg px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={rating === 0 || mutation.isPending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {mutation.isPending ? "Отправляем…" : "Отправить"}
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
          >
            Отмена
          </button>
        )}
      </div>
      {mutation.isError && (
        <p className="text-sm text-accent-sale-700">{mutation.error.message}</p>
      )}
    </form>
  );
}
