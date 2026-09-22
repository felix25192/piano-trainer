import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves project sites from https://<user>.github.io/<repo>/, so
// the built app has to know it does not live at the root. The dev server does,
// which is why this depends on the command.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/piano-trainer/" : "/",
}));
