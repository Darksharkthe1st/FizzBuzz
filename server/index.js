import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadDotEnv } from "./utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const clientDir = join(rootDir, "client");
const distClientDir = join(rootDir, "dist", "client");

await loadDotEnv(join(rootDir, ".env"));

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 5175);
const isProduction = process.env.NODE_ENV === "production";

async function listenWithFallback(targetPort, attemptsLeft = 10) {
  const app = await createApp({ clientDir, distClientDir, isProduction });

  const server = app.listen(targetPort, host, () => {
    console.log(`FizzBuzz listening at http://${host}:${targetPort}`);
  });

  server.once("error", async (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 1) {
      console.log(`Port ${targetPort} is busy; trying ${targetPort + 1}.`);
      await listenWithFallback(targetPort + 1, attemptsLeft - 1);
      return;
    }

    console.error(`Could not start FizzBuzz on ${host}:${targetPort}.`);
    console.error(error.message);
    process.exitCode = 1;
  });
}

await listenWithFallback(port);
