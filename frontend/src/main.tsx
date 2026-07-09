import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";

// A lazy route chunk can 404 if this tab has been open across a deploy —
// the old hashed filename it's asking for no longer exists on the server.
// Vite fires this event when that happens; reload once to pick up the
// current build rather than leaving the user on a broken navigation.
window.addEventListener("vite:preloadError", () => {
  const key = "autopayke_preload_reloaded";
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  window.location.reload();
});

const router = getRouter();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
