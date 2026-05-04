# Dumly Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-04-dumly-memory-design.md`

**Goal:** Ship Dumly 2.0.0 — memory-aware reply/quote assistant with floating card UI, IndexedDB-backed accepted/negative memory, retrieval scoring, edit detection, and a memory review page.

**Architecture:** Buildless MV3 extension. Vanilla JS IIFE modules under `lib/` attached to `window.Dumly.*`. IndexedDB for memory records, `chrome.storage.local` for profile, `chrome.storage.sync` for API key and toggles. Dev-only `vitest` + `fake-indexeddb` for pure-logic tests.

**Phases (execute in order):**

1. [phase-1-scaffolding.md](phase-1-scaffolding.md) — modules, IndexedDB schema, migration, pure-logic libs
2. [phase-2-card-ui.md](phase-2-card-ui.md) — floating card + generation flow (profile-only prompt, no memory retrieval yet)
3. [phase-3-retrieval.md](phase-3-retrieval.md) — memory retrieval + prompt injection + repetition hint
4. [phase-4-popup-memory-ui.md](phase-4-popup-memory-ui.md) — popup tabs + full-page memory review
5. [phase-5-cleanup-polish.md](phase-5-cleanup-polish.md) — cleanup runner, clear-memory, 2.0.0 ship

## Shared conventions

**Module pattern.** Every `lib/*.js` is an IIFE attaching to `window.Dumly`:

```js
(function () {
  window.Dumly = window.Dumly || {};
  window.Dumly.<modname> = { /* exports */ };
})();
```

**Test files.** Vitest, colocated: `lib/foo.test.js` sits next to `lib/foo.js`. Use `fake-indexeddb/auto` to patch globals before importing `db.js`.

**Importing lib in tests.** Lib files are IIFEs that set `window.Dumly.*`. In tests, set `globalThis.window = globalThis; await import('./foo.js'); const { fn } = window.Dumly.modname;`.

**Commit cadence.** One commit per completed step group (see each task's Commit step). Use conventional commits: `feat:`, `test:`, `refactor:`, `chore:`, `docs:`. Include spec section numbers in bodies where relevant.

**Running tests.** `npm test` from repo root. Phase 1 Task 1 sets this up.

**Manual QA gating.** Each phase ends with a manual QA checklist. Do not mark the phase "done" until checklist passes.
