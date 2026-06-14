import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const PORT = 4322;
const READY_TIMEOUT_MS = 60_000;

let server: ChildProcess | undefined;

export async function setup(): Promise<void> {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("SUPABASE_ANON_KEY must be set in .env.test.local");
  }

  const require = createRequire(import.meta.url);
  const astroRoot = path.dirname(require.resolve("astro/package.json"));
  const astroCli = path.join(astroRoot, "bin", "astro.mjs");
  const proc = spawn(process.execPath, [astroCli, "dev", "--port", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, SUPABASE_KEY: anonKey },
  });
  server = proc;

  const stdout = proc.stdout;
  if (!stdout) {
    throw new Error("Astro dev server has no stdout stream");
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Astro dev server did not emit 'ready' within ${READY_TIMEOUT_MS / 1000}s`));
    }, READY_TIMEOUT_MS);

    stdout.on("data", (chunk) => {
      if (String(chunk).includes("ready")) {
        clearTimeout(timer);
        resolve();
      }
    });

    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Astro dev server exited (code ${code}) before emitting 'ready'`));
    });
  });

  process.env.TEST_BASE_URL = `http://localhost:${PORT}`;
}

export async function teardown(): Promise<void> {
  server?.kill();
  server = undefined;
}
