# Offline Timer Sync Protocol (Foundation Only)

Offline timer writes are not supported today. The web app caches its shell for read-only
access, but start, pause, resume, and stop still require the server. The feature flag
`VITE_OFFLINE_TIMER_QUEUE_ENABLED` defaults to `false`, and the queue foundation refuses
to persist mutations even if the flag is enabled.

A production implementation must add all of these contracts before the queue can be
connected to the API client:

1. A client-generated idempotency key accepted and durably recorded by every timer write.
2. A monotonic server revision returned with timer state and required on queued writes.
3. Strict per-user ordering, with one in-flight mutation and replay after authentication.
4. Explicit conflict responses that include authoritative timer state and never silently
   overwrite a timer changed by another device.
5. Encrypted local persistence with bounded retention, logout cleanup, and tenant/user
   partitioning.
6. User-visible states for queued, replaying, conflicted, rejected, and completed writes.
7. Backend and browser tests for duplicate delivery, expired credentials, clock skew,
   multi-device changes, partial replay, and logout/account switching.

Until those requirements are implemented and reviewed, production timer behavior remains
online-only and server-authoritative.
