/** Golden VIP badge shown next to premium (VIP) authors on quote cards and
 *  public profiles. Compact by default; `size="sm"` fits inline text rows. */
export function VipBadge({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const sizing =
    size === "sm" ? "h-4 gap-0.5 rounded-full px-1.5 text-[9px]" : "h-5 gap-1 rounded-full px-2 text-[10px]";
  return (
    <span
      title="VIP muallif"
      className={`inline-flex items-center font-bold uppercase tracking-wide text-amber-950 shadow-sm ${sizing} ${className}`}
      style={{
        background: "linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%)",
      }}
    >
      <svg className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 16 3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5Zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1Z" />
      </svg>
      VIP
    </span>
  );
}