import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import net from "node:net";

const DEFAULT_PROXY_TARGETS = ["http://127.0.0.1:8001", "http://127.0.0.1:8000"];

function isPortOpen(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(150);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

async function resolveProxyTarget(explicitTarget?: string): Promise<string> {
  if (explicitTarget) return explicitTarget;
  for (const target of DEFAULT_PROXY_TARGETS) {
    try {
      const url = new URL(target);
      const port = Number(url.port);
      if (Number.isFinite(port)) {
        const available = await isPortOpen(port, url.hostname);
        if (available) return target;
      }
    } catch {
      // ignore invalid target entries
    }
  }
  return DEFAULT_PROXY_TARGETS[0];
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = await resolveProxyTarget(env.VITE_DEV_PROXY_TARGET);

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
        "/static": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom", "react-router-dom"],
            ui: ["framer-motion", "lucide-react", "gsap", "react-dropzone"],
          },
        },
      },
    },
  };
});
