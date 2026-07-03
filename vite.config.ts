import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/kickoff-lock-agent/",
  build: {
    rollupOptions: {
      output: {
        hashCharacters: "hex",
      },
    },
  },
});
