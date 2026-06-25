import { create } from "zustand";
import { persist } from "zustand/middleware";

export const ANIMALS = [
  { key: "koala",     emoji: "🐨", from: "#8B9FC1", to: "#5A6FA3" },
  { key: "fox",       emoji: "🦊", from: "#F97316", to: "#EA580C" },
  { key: "panda",     emoji: "🐼", from: "#374151", to: "#111827" },
  { key: "lion",      emoji: "🦁", from: "#FBBF24", to: "#D97706" },
  { key: "bear",      emoji: "🐻", from: "#92400E", to: "#78350F" },
  { key: "otter",     emoji: "🦦", from: "#0D9488", to: "#0F766E" },
  { key: "butterfly", emoji: "🦋", from: "#A855F7", to: "#7C3AED" },
  { key: "dolphin",   emoji: "🐬", from: "#38BDF8", to: "#0284C7" },
  { key: "frog",      emoji: "🐸", from: "#4ADE80", to: "#16A34A" },
  { key: "parrot",    emoji: "🦜", from: "#F87171", to: "#DC2626" },
  { key: "penguin",   emoji: "🐧", from: "#475569", to: "#1E293B" },
  { key: "tiger",     emoji: "🐯", from: "#FB923C", to: "#C2410C" },
  { key: "elephant",  emoji: "🐘", from: "#94A3B8", to: "#475569" },
  { key: "whale",     emoji: "🐳", from: "#60A5FA", to: "#1D4ED8" },
  { key: "monkey",    emoji: "🐵", from: "#D97706", to: "#92400E" },
  { key: "owl",       emoji: "🦉", from: "#A16207", to: "#713F12" },
] as const;

export type AnimalKey = (typeof ANIMALS)[number]["key"];

type ProfileState = {
  avatarKey: AnimalKey | null;
  avatarDataUrl: string | null;
  displayName: string | null;

  setAvatarAnimal: (key: AnimalKey) => void;
  setAvatarPhoto: (dataUrl: string) => void;
  setDisplayName: (name: string) => void;
  clearAvatar: () => void;
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      avatarKey: null,
      avatarDataUrl: null,
      displayName: null,

      setAvatarAnimal: (avatarKey) => set({ avatarKey, avatarDataUrl: null }),
      setAvatarPhoto: (avatarDataUrl) => set({ avatarDataUrl, avatarKey: null }),
      setDisplayName: (displayName) => set({ displayName }),
      clearAvatar: () => set({ avatarKey: null, avatarDataUrl: null }),
    }),
    {
      name: "autopayke_profile",
    }
  )
);
