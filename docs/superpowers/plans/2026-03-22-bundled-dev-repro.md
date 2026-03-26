# Bundled Dev Repro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone workspace package that reproduces the `bundledDev` symbol mismatch bug and can be attached directly to an upstream issue.

**Architecture:** Create a minimal Vite+ app package under `packages/` with `experimental.bundledDev: true`, a tiny browser entry, and a README with deterministic reproduction steps. Use a real dependency chain from the LiveStore stack so the emitted dev chunk still pulls in `@opentelemetry/semantic-conventions`.

**Tech Stack:** Vite+, TypeScript, browser entrypoint, LiveStore packages

---

### Task 1: Scaffold The Repro Package

**Files:**

- Create: `packages/bundled-dev-symbol-repro/package.json`
- Create: `packages/bundled-dev-symbol-repro/tsconfig.json`
- Create: `packages/bundled-dev-symbol-repro/index.html`
- Create: `packages/bundled-dev-symbol-repro/vite.config.ts`

- [ ] **Step 1: Create the package manifest with the smallest dependency set**
- [ ] **Step 2: Add a local TypeScript config for the repro package**
- [ ] **Step 3: Add a minimal HTML shell**
- [ ] **Step 4: Add a Vite config with `experimental.bundledDev: true`**

### Task 2: Add The Minimal Runtime Repro

**Files:**

- Create: `packages/bundled-dev-symbol-repro/src/main.ts`
- Create: `packages/bundled-dev-symbol-repro/src/trigger.ts`

- [ ] **Step 1: Add the smallest import chain that still exercises the broken bundling path**
- [ ] **Step 2: Render enough text to confirm the page booted if bundling succeeds**
- [ ] **Step 3: Keep the runtime code free of unrelated UI/framework setup**

### Task 3: Document And Verify The Repro

**Files:**

- Create: `packages/bundled-dev-symbol-repro/README.md`

- [ ] **Step 1: Document install, dev, and browser reproduction steps**
- [ ] **Step 2: Run the repro package and confirm the runtime failure**
- [ ] **Step 3: Inspect the emitted dev asset and confirm the mismatched symbol names**
