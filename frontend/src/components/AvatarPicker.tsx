import { useRef } from "react";
import { X, Camera } from "lucide-react";
import { ANIMALS, type AnimalKey } from "@/stores/profileStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AvatarPickerProps {
  currentKey: AnimalKey | null;
  currentDataUrl: string | null;
  onSelectAnimal: (key: AnimalKey) => void;
  onSelectPhoto: (dataUrl: string) => void;
  onClose: () => void;
}

export function AvatarPicker({
  currentKey,
  currentDataUrl,
  onSelectAnimal,
  onSelectPhoto,
  onClose,
}: AvatarPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      onSelectPhoto(dataUrl);
      onClose();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-paper rounded-t-3xl shadow-[0_-8px_40px_rgba(27,42,74,0.15)] max-h-[75vh] overflow-y-auto font-manrope">
        <div className="px-5 pt-4 pb-8">
          {/* Handle + header */}
          <div className="flex items-center justify-between mb-5">
            <div className="w-8 h-1 rounded-full bg-ink/10 absolute left-1/2 -translate-x-1/2 top-3" />
            <h2 className="font-display font-bold text-[17px] text-ink mt-2">Choose avatar</h2>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-ink/5 flex items-center justify-center mt-2 focus-visible:outline-none"
            >
              <X size={16} strokeWidth={2} className="text-slate" />
            </button>
          </div>

          {/* Animals grid */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {ANIMALS.map((animal) => {
              const selected = currentKey === animal.key && !currentDataUrl;
              return (
                <button
                  key={animal.key}
                  type="button"
                  onClick={() => { onSelectAnimal(animal.key); onClose(); }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all focus-visible:outline-none",
                    selected
                      ? "ring-2 ring-amber ring-offset-1 bg-amber/8"
                      : "bg-ink/3 active:bg-ink/8"
                  )}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-[26px]"
                    style={{ background: `linear-gradient(135deg, ${animal.from}, ${animal.to})` }}
                  >
                    {animal.emoji}
                  </div>
                  <span className="text-[10px] font-medium text-slate capitalize">{animal.key}</span>
                </button>
              );
            })}
          </div>

          {/* Upload custom photo */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-ink/15 text-[14px] font-semibold text-slate active:bg-ink/3 focus-visible:outline-none transition-colors"
          >
            <Camera size={18} strokeWidth={1.5} />
            Upload your own photo
          </button>
        </div>
      </div>
    </>
  );
}
