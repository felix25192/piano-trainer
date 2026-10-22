import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves project sites from https://<user>.github.io/<repo>/, so
// the built app has to know it does not live at the root. The dev server does,
// which is why this depends on the command.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/piano-trainer/" : "/",
  build: {
    rollupOptions: {
      /*
       * Two pages, not one. `mic-test.html` used to sit in `public/` and be
       * copied through untouched, which meant it could not import anything
       * from `src/` — so it carried its own rough copy of a pitch detector.
       * A device test that measures something other than what ships is worth
       * very little, so it is a build entry now and uses `core/pitchDetect.ts`
       * itself. Its published address is unchanged.
       *
       * `model-test.html` times a chord model on the device. It is published
       * because the iPad can reach nothing else; the app never loads it, and
       * TensorFlow.js ends up in that page's own chunks, not in the app's.
       */
      input: {
        main: "index.html",
        micTest: "mic-test.html",
        modelTest: "model-test.html",
      },
    },
  },
}));
