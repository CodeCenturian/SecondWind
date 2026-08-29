# SECONDWIND Development Journal

This journal logs real events encountered during the development of SECONDWIND, including failed tests, schema/tooling issues, invalid assumptions, race conditions, or provider deviations.

---

### Entry 1: Tool Call Artifact Path Constraint
- **Timestamp**: 2026-08-29T21:41:07+05:30
- **What Broke**: `write_to_file` call failed with `invalid_args: e:\SecondWind\package.json is not a valid artifact path; artifacts must be in brain/<conversation-id>/`.
- **How Detected**: Antigravity IDE tool validation error during initial `package.json` creation.
- **Fix**: Removed `ArtifactMetadata` property when writing project files to the workspace `e:\SecondWind\`, reserving `ArtifactMetadata` exclusively for markdown artifacts in the brain directory.

---

### Entry 2: Verification of Official Gemini Model Identifiers
- **Timestamp**: 2026-08-29T21:35:00+05:30
- **What Broke / Assumption Tested**: Verified official Gemini model IDs against live documentation at `https://ai.google.dev/gemini-api/docs/models` rather than relying on stale or assumed identifiers.
- **How Detected**: Checked Google AI developer documentation and browser rendering to inspect active model cards.
- **Fix**: Confirmed `gemini-3.7-flash` as the verified primary model for reasoning and agentic workflows, and recorded it in `docs/razorpay-verification-checklist.md` and `src/lib/constants.ts`.

---

### Entry 3: Strict TypeScript Flags (noUnusedParameters & noPropertyAccessFromIndexSignature)
- **Timestamp**: 2026-08-29T21:53:14+05:30
- **What Broke**: `npx tsc --noEmit` failed with TS6133 (unused parameter `c`) and TS4111 (property accessed from index signature without bracket notation `conflict.details?.expectedVersion`).
- **How Detected**: TypeScript compiler check running in strict mode with `"noUnusedParameters": true` and `"noPropertyAccessFromIndexSignature": true`.
- **Fix**: Removed unused parameters in test arrow functions and updated `conflict.details?.["expectedVersion"]` to use index signature bracket notation.

---

### Entry 4: Prisma InputJsonValue Compatibility & CaseStatus Enum Extension
- **Timestamp**: 2026-08-29T22:12:00+05:30
- **What Broke**: Prisma typecheck raised TS2322 when passing raw `Record<string, unknown>` to JSON columns (`payload: sanitized as Record<string, unknown>`). Also required `DETECTED` and `CLOSED` statuses in `CaseStatus` enum for deterministic payment failure ingestion.
- **How Detected**: TypeScript strict compiler and Prisma Client validation.
- **Fix**: Added `DETECTED` and `CLOSED` to `CaseStatus` in `prisma/schema.prisma`, regenerated Prisma client, and explicitly serialized JSON payloads via `JSON.parse(JSON.stringify(sanitized)) as Prisma.InputJsonValue`.

