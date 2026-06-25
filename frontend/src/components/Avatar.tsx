import { memo } from "react";
import { ANIMALS } from "@/stores/profileStore";
import { cn } from "@/lib/utils";

interface AvatarProps {
  avatarKey: string | null;
  avatarDataUrl: string | null;
  fallbackLetter?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_MAP = {
  sm:  { outer: "w-8 h-8 rounded-xl",    emoji: "text-[16px]", text: "text-[14px]" },
  md:  { outer: "w-11 h-11 rounded-2xl", emoji: "text-[22px]", text: "text-[16px]" },
  lg:  { outer: "w-16 h-16 rounded-3xl", emoji: "text-[32px]", text: "text-[22px]" },
  xl:  { outer: "w-22 h-22 rounded-[24px]", emoji: "text-[44px]", text: "text-[30px]" },
};

export const Avatar = memo(function Avatar({
  avatarKey,
  avatarDataUrl,
  fallbackLetter = "?",
  size = "md",
  className,
}: AvatarProps) {
  const s = SIZE_MAP[size];

  if (avatarDataUrl) {
    return (
      <div className={cn(s.outer, "overflow-hidden shrink-0", className)}>
        <img src={avatarDataUrl} alt="Profile" className="w-full h-full object-cover" />
      </div>
    );
  }

  const animal = avatarKey ? ANIMALS.find((a) => a.key === avatarKey) : null;

  if (animal) {
    return (
      <div
        className={cn(s.outer, "flex items-center justify-center shrink-0", className)}
        style={{ background: `linear-gradient(135deg, ${animal.from}, ${animal.to})` }}
      >
        <span className={s.emoji} role="img" aria-label={animal.key}>
          {animal.emoji}
        </span>
      </div>
    );
  }

  // Fallback: orange gradient with initials
  return (
    <div
      className={cn(
        s.outer,
        "flex items-center justify-center shrink-0 bg-orange-gradient",
        className
      )}
    >
      <span className={cn(s.text, "font-display font-extrabold text-white")}>
        {fallbackLetter.toUpperCase()}
      </span>
    </div>
  );
});
