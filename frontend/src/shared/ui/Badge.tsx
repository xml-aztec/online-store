// "sale" carries a number (-20%), so it's mono per the site's rule that digits
// always render in JetBrains Mono; "new"/"hit" are words, so Manrope like any
// other UI label.
const VARIANT_CLASSES = {
  sale: "bg-accent-sale text-white font-mono",
  new: "bg-brand/10 text-brand font-display",
  hit: "bg-ink text-white font-display",
} as const;

interface BadgeProps {
  variant: keyof typeof VARIANT_CLASSES;
  children: React.ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className={`rounded-lg px-2 py-1 text-xs font-bold leading-none whitespace-nowrap ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
