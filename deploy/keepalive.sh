#!/usr/bin/env bash
# Long-running warm-up/ping loop, kept alive by PM2 as the "keepalive" app.
# It hits the local health endpoint periodically so the Node process (and its
# event-loop timers) stay warm behind the reverse proxy. Mirrors the live VM.
while true; do
  node -e "fetch('http://127.0.0.1:4000/health').then(r => r.text()).catch(() => {})" >/dev/null 2>&1 || true
  sleep 300
done