// PM2 process manager config for the Iqtibosim backend on the live GCP VM.
// Paths assume the repo lives at ~/apps/api-server (see setup-vps.sh).
module.exports = {
  apps: [
    {
      name: "yerlikoglon-api",
      cwd: "/home/mirabbostolqinjonov/apps/api-server/server",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
      out_file: "/home/mirabbostolqinjonov/.pm2/logs/yerlikoglon-api-out.log",
      error_file: "/home/mirabbostolqinjonov/.pm2/logs/yerlikoglon-api-error.log",
      time: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};