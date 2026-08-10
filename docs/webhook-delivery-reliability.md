# Webhook Delivery Reliability

Webhook delivery currently provides a bounded, best-effort retry policy in the API
process. Each delivery has a stable delivery ID for all attempts, an HMAC signature, a
five-second outbound timeout per attempt, and at most three attempts. Network errors,
timeouts, HTTP 408/425/429, and 5xx responses are retried. Permanent 4xx responses fail
immediately. Exhausted deliveries are logged by subscription ID, event, attempt count,
and status; secret values and endpoint URLs are not logged.

This is not durable delivery. The timer response is returned before the webhook finishes,
and a serverless process may stop before retries complete. A production-grade follow-up
should add a tenant-scoped delivery ledger and queue with payload/signature versioning,
attempt timestamps, next-attempt scheduling, terminal/dead-letter state, retention, admin
redrive controls, and metrics. That change requires an intentional Prisma migration and
worker/runtime design, so it is not included in this migration-free tranche.
