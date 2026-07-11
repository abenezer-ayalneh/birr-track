# ADR 0005: Redis-backed Admin Panel Sessions

**Status**: Accepted  
**Date**: 2026-07-11

## Context

The Admin Panel is authenticated through Telegram Mini App `initData`, which is signed by Telegram and intentionally freshness-limited by the backend. The previous backend JWT lasted one hour and the Mini App tried to refresh by re-exchanging the same `initData`; once that Telegram proof aged past the freshness window, a still-open Admin Panel could no longer renew safely.

## Decision

Create a Redis-backed **Admin Panel Session** after the initial Telegram `initData` validation.

- Access JWTs are short-lived and include the Admin Panel Session id.
- The Mini App stores both access and refresh credentials in memory only.
- Refresh calls use an opaque refresh token tied to the Redis session, not old Telegram `initData`.
- Sessions have a 30-minute idle timeout and a 12-hour absolute lifetime.
- Backend guards reject otherwise valid JWTs when the backing Admin Panel Session no longer exists.

## Alternatives Considered

- **Long-lived JWT only**: Simpler, but a leaked token would remain valid without server-side revocation.
- **Relax `initData` freshness**: Minimal code, but weakens replay protection for Telegram's identity proof.
- **Persistent browser storage**: Survives reloads, but stores bearer material longer than needed inside the Telegram WebView.

## Consequences

- Redis must be available for Admin Panel authentication, matching existing queue and rate-limit infrastructure.
- Open, visible Admin Panel sessions can last through a long work shift.
- Backgrounded or abandoned Admin Panels naturally expire after the idle window.
- Reloads may require a fresh Telegram `initData` exchange because refresh material is memory-only.
