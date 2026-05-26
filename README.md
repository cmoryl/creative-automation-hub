# Creative Automation Platform v3

This is the v3 platform refactor foundation.

## What Changed
The project is moving from a developer-operated Electron utility to a universal-user creative automation platform.

## Core Architecture
- Electron desktop app
- React + TypeScript renderer
- engine abstraction
- project-centric UX
- output center
- setup wizard
- Claude-ready skill package
- Canva handoff layer
- Illustrator/InDesign/Hybrid engine scaffolds

## Install
```bash
cd CreativeAutomationPlatform
npm install
npm run dev
```

## Package DMG
```bash
npm run dist
```

## Current State
Foundation scaffold. Not yet a fully production-tested DMG.

## Next Priorities
1. Port working v2 Illustrator safe runner.
2. Build real template registry.
3. Expand Output Center.
4. Build first-run setup wizard.
5. Package Claude Skill v1.
