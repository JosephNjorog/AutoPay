# Heartbeat Monitoring Runbook

## Purpose

`autopayke-heartbeat-monitor` checks whether every expected worker and scanner is
alive. It runs every two minutes and fails when the protected operations endpoint
returns stale, missing, or error components.

## Activate On Render

1. Sync the repository Blueprint so Render creates
   `autopayke-heartbeat-monitor` from `render.yaml`.
2. Confirm `tumabackendservice` has valid `API_BASE_URL` and
   `OPERATIONS_API_TOKEN` values. The cron service inherits both through
   Blueprint references.
3. In Render, open **Workspace > Integrations > Notifications** and select email,
   Slack, or both. Set the notification level to **Only failure notifications**
   or **All notifications**.
4. Open the cron service and use **Trigger Run**.
5. Confirm the run succeeds and logs a line beginning with
   `[HeartbeatMonitor] Healthy`.

Do not point the web service's `healthCheckPath` at the worker heartbeat endpoint.
The web health check must remain `/health` so a worker incident does not restart
the API.

## Run Manually

```bash
API_BASE_URL=https://tumabackendservice.onrender.com \
OPERATIONS_API_TOKEN=your_operations_token \
bun run --cwd backend monitor:heartbeats
```

A healthy check exits `0`. Any unhealthy or invalid response exits `1`.

## Failure Meanings

| Monitor output | Likely causes | First checks |
| --- | --- | --- |
| `HTTP 503` with component names | Worker stopped, scanner error, heartbeat too old | Open `autopayke-workers` logs and inspect the named component |
| `HTTP 401` | Operations token missing or drifted | Compare the web service token and Blueprint reference |
| `timed out` or request failed | API unavailable, routing failure, Render incident | Check API service events, `/health`, and Render status |
| `malformed health report` | API contract regression or proxy response | Inspect API deployment and raw endpoint response |

After recovery, manually trigger the cron once and confirm a successful run. The
next scheduled run should also succeed.

## Security

- Never place `OPERATIONS_API_TOKEN` in the monitor URL.
- Do not paste the token into incident tickets or logs.
- Rotate the token if it is exposed, then update the web service; the cron
  service receives the referenced value on its next deployment/config refresh.
