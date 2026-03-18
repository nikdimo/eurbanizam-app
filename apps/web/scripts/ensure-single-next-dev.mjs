/**
 * Stops any existing `next dev` for this apps/web folder only (by matching
 * the absolute path in the process command line), removes stale .next/dev/lock,
 * then runs next dev. Pass-through: npm run dev -- -p 3002
 */
import { spawnSync, spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appsWeb = path.resolve(__dirname, "..");
const lockPath = path.join(appsWeb, ".next", "dev", "lock");

const isWin = process.platform === "win32";

function killOurNextDev() {
  if (isWin) {
    const appsWebPs = appsWeb.replace(/'/g, "''");
    const script = `
$appsWeb = '${appsWebPs}'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -and $_.CommandLine.Contains($appsWeb) -and ($_.CommandLine -match 'next')
} | ForEach-Object {
  Write-Host ("Stopping eurbanizam web dev PID " + $_.ProcessId)
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 600
`.trim();
    spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { stdio: "inherit", cwd: appsWeb },
    );
  } else {
    try {
      const out = spawnSync("pgrep", ["-af", "node"], {
        encoding: "utf8",
      }).stdout;
      for (const line of (out || "").split("\n")) {
        if (
          line.includes(appsWeb) &&
          /next|next-dev|next\.js/i.test(line) &&
          /\bdev\b/.test(line)
        ) {
          const pid = parseInt(line.trim().split(/\s+/)[0], 10);
          if (pid > 0) {
            console.log(`Stopping eurbanizam web dev PID ${pid}`);
            try {
              process.kill(pid, "SIGTERM");
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (existsSync(lockPath)) {
    try {
      unlinkSync(lockPath);
      console.log("Removed stale .next/dev/lock");
    } catch {
      console.warn(
        "Could not remove .next/dev/lock — if dev still fails, close the other terminal running next dev for this app.",
      );
    }
  }
}

killOurNextDev();

const extraArgs = process.argv.slice(2);
const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "dev", ...extraArgs],
  {
    cwd: appsWeb,
    stdio: "inherit",
    shell: isWin,
  },
);

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
