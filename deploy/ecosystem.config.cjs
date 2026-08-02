// PM2 process manager config for the canvas backend.
// Paths assume the repo lives at /opt/canvas (see setup-vps.sh).
module.exports = {
  apps: [
    {
      name: "canvas-server",
      cwd: "/opt/canvas/server",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
      out_file: "/var/log/canvas-server-out.log",
      error_file: "/var/log/canvas-server-error.log",
      time: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
