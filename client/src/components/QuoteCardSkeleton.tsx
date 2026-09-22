/** Skeleton placeholder that mirrors a QuoteCard's layout while the feed or
 *  search results are loading. Shimmering blocks replace the real content. */
export function QuoteCardSkeleton() {
  return (
    <figure className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none sm:p-5">
      <div className="space-y-3">
        <div className="animate-shimmer h-4 w-full rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="animate-shimmer h-4 w-3/4 rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="animate-shimmer h-4 w-1/2 rounded-full bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="animate-shimmer h-3 w-28 rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="animate-shimmer h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
      </div>
      <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <div className="animate-shimmer h-8 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="animate-shimmer h-8 w-10 rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="animate-shimmer h-8 w-20 rounded-full bg-slate-200 dark:bg-slate-800" />
      </div>
    </figure>
  );
}

/** Compact skeleton used by the filters panel while categories/tags load. */
export function FilterChipsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="animate-shimmer h-8 w-20 rounded-full bg-slate-200 dark:bg-slate-800" />
      ))}
    </div>
  );
}