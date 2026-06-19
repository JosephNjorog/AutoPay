# ADR 0007: Use A Render Cron Job For Heartbeat Alerting

Status: Accepted

Date: 2026-06-19

## Context

The API already exposes worker and scanner status through the protected endpoint:

`GET /api/ops/health/heartbeats?staleOnly=true&failOnStale=true`

It returns `503` when an expected worker or scanner is missing, stale, or in an
error state. That signal still needs a scheduled caller and a notification path.

Render's native HTTP health check is not a good fit for this signal:

- the heartbeat endpoint requires `X-Operations-Token`
- Blueprint health checks configure a path, not a custom authentication header
- a failed native health check removes or restarts the API instance, even when
  the unhealthy component is the separate background-worker service

Restarting a healthy API does not repair a stale worker and can make an incident
larger.

## Decision

Keep the API web-service health check on `/health` and add a separate Render cron
service named `autopayke-heartbeat-monitor`.

The cron service:

- runs every two minutes
- reuses the web service's `API_BASE_URL` and `OPERATIONS_API_TOKEN` through
  Render Blueprint service references
- calls the protected heartbeat endpoint with `staleOnly=true` and
  `failOnStale=true`
- applies a 30-second request timeout
- validates the response body instead of trusting HTTP `200` alone
- exits non-zero for stale components, authentication errors, malformed
  responses, timeouts, and network failures

Render records a non-zero cron execution as failed. Email or Slack failure
notifications must be enabled in the Render workspace or on the cron service.

## Consequences

Positive:

- Worker failure pages operators without coupling worker health to API restarts.
- The operations token remains required and is not placed in the URL or logs.
- The monitor also detects API unavailability and operations-token drift.
- Each run is visible in Render cron history and can be triggered manually.

Tradeoffs:

- Alerting can occur up to two minutes after a component crosses its stale
  threshold.
- Render cron jobs have a minimum monthly charge and usage-based runtime cost.
- Failure notifications are a Render dashboard setting and cannot be enforced
  by `render.yaml`.
- Repeated failed runs can create repeated notifications until the incident is
  resolved.
- The monitor and workload share a cloud provider. A third-party monitor gives
  better protection from a Render-wide incident.
- A database outage can surface as an API or stale-heartbeat failure; the alert
  identifies impact, not necessarily root cause.

## Alternatives Considered

- Point Render's web health check at the heartbeat endpoint: rejected because it
  cannot provide the operations header and would restart the wrong service.
- Make the heartbeat endpoint public: rejected because operational metadata and
  failure status should remain protected.
- Configure only a third-party monitor: viable later, but it adds another vendor
  and secret configuration outside the repository.

## Operational Activation

The monitor code and Blueprint service are implemented. Production activation
still requires syncing the Blueprint, enabling Render failure notifications, and
triggering one manual run. See
[the heartbeat monitoring runbook](../heartbeat-monitoring-runbook.md).
