import { spawnSync } from "node:child_process";

const checks = ["typecheck", "lint", "test", "eval:local", "build"] as const;

/** Runs the reproducible local release gates sequentially through Bun's package runner. */
function runChecks(): void {
  for (const check of checks) {
    console.log(`\nRunning ${check}...`);
    const result = spawnSync("bun", ["run", check], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }
}

runChecks();
