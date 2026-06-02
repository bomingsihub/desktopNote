const { spawn } = require("node:child_process");
const path = require("node:path");

const cwd = path.join(__dirname, "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const vite = spawn(npm, ["run", "dev", "--", "--host", "127.0.0.1"], {
  cwd,
  shell: false,
  stdio: "inherit",
});

setTimeout(() => {
  const electron = spawn(npm, ["run", "electron"], {
    cwd,
    shell: false,
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: "http://127.0.0.1:1420",
    },
  });

  electron.on("exit", (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
}, 1200);
