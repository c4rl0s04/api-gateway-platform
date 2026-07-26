---
title: How to Document the Project
type: guide
doc_status: current
implementation_status: not-applicable
last_verified: 2026-07-27
tags:
  - type/guide
  - area/project
sources:
  - docs/_templates
  - scripts/docs
  - docs/.obsidian/templates.json
aliases: []
---

# How to Document the Project

> [!summary] At a glance
> Create notes from the matching Obsidian template, cite repository sources, separate current behavior from plans, and validate the vault before review.

## Goal

Keep project knowledge navigable and traceable to code as the implementation
changes.

## Prerequisites

Open `docs/` as the Obsidian vault or edit its Markdown files directly.

## Steps

1. Choose the template matching the note's purpose.
2. Replace every placeholder and select valid metadata values.
3. Add at least one `type/*` tag and one `area/*` tag.
4. Add stable repository paths to `sources` for implementation claims.
5. Write a concise `At a glance` paragraph.
6. Label planned behavior explicitly and keep it separate from current behavior.
7. Add focused related links rather than linking every nearby page.
8. Regenerate and validate:

```bash
npm run docs:index
npm run docs:check
```

## Verification

- The note appears in [[Documentation Index]].
- Wikilinks resolve in Obsidian.
- Mermaid diagrams render in Obsidian and GitHub.
- `npm run docs:check` exits successfully.

## Troubleshooting or Rollback

If a rename creates an unresolved link, add the previous title to `aliases` and
update callers to the canonical name. Do not edit the generated index manually.

## Definition of Done

Every code change must either update affected documentation or state `No
documentation impact` in the pull request.

## Related Notes

- [[Project Map]]
- [[Current Status]]
