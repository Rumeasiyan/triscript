const { spawnSync } = require("node:child_process");

process.env.NEXT_TELEMETRY_DISABLED = "1";
if (process.argv[2] === "dev") {
  process.env.TRISCRIPT_NEXT_DIST_DIR = ".next-dev";
}

const nextBinary = require.resolve("next/dist/bin/next");
const result = spawnSync(process.execPath, [nextBinary, ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
