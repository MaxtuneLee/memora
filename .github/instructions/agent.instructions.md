---
applyTo: '**'
---

## Problem Statement
Learning materials are scattered across notes, videos, and recordings. 
Current tools cannot efficiently process multi-modal learning content. 
Long recordings are hard to navigate, and transcription helps with English lectures.

## Core Features
- Multi-modal support: documents, audio, images, video
- AI processing: cloud BYOK + local models
- Native Markdown note editing
- Frontend/backend separation with Docker deployment
- Privacy-first: local-first data storage and processing

## Key Functions
- Knowledge base management (create/edit/delete)
- File management and document editing
- Real-time speech transcription
- AI chat linked to specific knowledge bases
- Global search with filters (file type, date, source)

## Expected Results
Unified AI-powered knowledge base for fast content retrieval, 
automatic lecture transcription, natural language Q&A, 
and privacy-focused local deployment. Open source and customizable.

## Technical Stack
- Frontend: React, Tailwind CSS, Vite

## Dev environment tips
- Use `pnpm <command> --filter <project_name>` to run commands in specific packages.
- Run `pnpm install --filter <project_name>` to add the package to your workspace so Vite, ESLint, and TypeScript can see it.
- Check the name field inside each package's package.json to confirm the right name—skip the top-level one.