import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, QrCode, Image as ImageIcon, AlertCircle, Keyboard } from "lucide-react";
import jsQR from "jsqr";
import { PageFrame } from "@/components/PageFrame";
import { parsePayUrl } from "@/lib/pay-link";

export const Route = createFileRoute("/scan")({
  head: () => ({ meta: [{ title: "Scan · Autopayke" }, { name: "description", content: "Scan any Autopayke QR code." }] }),
  component: Scan,
});

function Scan() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  function handleDecoded(raw: string) {
    const payload = parsePayUrl(raw);
    if (!payload) {
      setScanError("That's not an Autopayke QR code");
      setTimeout(() => setScanError(null), 2000);
      return;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    navigate({ to: "/send", search: { to: payload.phone, amount: payload.amount ? String(payload.amount) : undefined } });
  }

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch {
        if (!cancelled) setError("Camera access denied — allow camera permission, or use a phone number instead.");
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(imageData.data, imageData.width, imageData.height);
          if (result?.data) {
            handleDecoded(result.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGalleryFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);
      if (result?.data) handleDecoded(result.data);
      else {
        setScanError("Couldn't find a QR code in that image");
        setTimeout(() => setScanError(null), 2000);
      }
    };
    img.src = URL.createObjectURL(file);
  }

  return (
    <PageFrame sidebar maxWidth="narrow">
      <div className="relative flex min-h-full flex-col bg-ink text-paper font-manrope">
        <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-5">
          <Link to="/dashboard" className="h-9 w-9 rounded-full bg-paper/15 backdrop-blur flex items-center justify-center text-paper">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-bold">Scan Autopayke QR</h1>
          <Link to="/receive" className="h-9 w-9 rounded-full bg-paper/15 backdrop-blur flex items-center justify-center text-paper">
            <QrCode className="h-4 w-4" />
          </Link>
        </header>

        <div className="relative flex-1 flex items-center justify-center px-8 overflow-hidden" style={{ background: "radial-gradient(at center, var(--color-ink-hover) 0%, var(--color-ink) 100%)" }}>
          {!error && (
            <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover opacity-80" />
          )}
          <canvas ref={canvasRef} className="hidden" />

          <div className="relative aspect-square w-full max-w-70">
            <div className="absolute inset-0 rounded-3xl border-2 border-paper/20" />
            {[
              "top-0 left-0 border-t-4 border-l-4 rounded-tl-3xl",
              "top-0 right-0 border-t-4 border-r-4 rounded-tr-3xl",
              "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl",
              "bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl",
            ].map((c, i) => (
              <div key={i} className={`absolute h-12 w-12 border-amber ${c}`} />
            ))}
            {!error && (
              <div className="absolute inset-x-4 h-0.5 animate-[scan_2.5s_ease-in-out_infinite]" style={{ background: "linear-gradient(90deg, transparent, var(--color-amber), transparent)" }} />
            )}
          </div>

          {scanError && (
            <div className="absolute top-6 left-5 right-5 flex items-center gap-2 rounded-2xl bg-rust/90 px-4 py-2.5 text-xs text-paper">
              <AlertCircle className="h-4 w-4 shrink-0" />{scanError}
            </div>
          )}

          {error ? (
            <div className="absolute bottom-8 left-5 right-5 text-center">
              <p className="text-xs text-paper/70">{error}</p>
            </div>
          ) : (
            <p className="absolute bottom-8 left-0 right-0 text-center text-xs text-paper/60">Point at an Autopayke QR</p>
          )}
        </div>

        <div className="bg-linen text-charcoal rounded-t-3xl p-5 pb-8 space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-ink/10 bg-paper p-3.5 text-sm font-semibold hover:bg-ink/5 transition"
            >
              <ImageIcon className="h-4 w-4" /> From gallery
            </button>
            <Link
              to="/send"
              className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-ink/10 bg-paper p-3.5 text-sm font-semibold hover:bg-ink/5 transition"
            >
              <Keyboard className="h-4 w-4" /> Enter number
            </Link>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleGalleryFile} />
        </div>
      </div>
      <style>{`@keyframes scan { 0%,100% { top: 8%; } 50% { top: 92%; } }`}</style>
    </PageFrame>
  );
}
