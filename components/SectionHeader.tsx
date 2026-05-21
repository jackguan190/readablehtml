import { cn } from "@/lib/utils";

interface Props {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: "left" | "center";
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "left",
}: Props) {
  return (
    <div
      className={cn(
        "max-w-3xl",
        align === "center" && "text-center mx-auto",
      )}
    >
      {eyebrow && <div className="eyebrow text-accent">{eyebrow}</div>}
      <h2 className="mt-2 font-serif text-[28px] sm:text-4xl lg:text-[42px] tracking-tightish text-ink leading-[1.08]">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 sm:mt-4 text-[15px] sm:text-[16.5px] text-ink-muted leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}
