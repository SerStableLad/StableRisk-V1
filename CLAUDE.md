# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
```bash
npm run dev          # Start development server
npm run build        # Build production bundle
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript type checking
npm run analyze      # Analyze bundle size
```

### Development Practices
Always follow a Test-Driven Development (TDD) approach.
Avoid hardcoding values — if necessary, flag them for review.
Always implement the most efficient and minimal code changes.

### Scope & Change Management
Only make changes that are explicitly requested or clearly connected to the task.
Focus only on code relevant to the task — don’t modify unrelated parts.
Avoid major pattern or architecture changes once a feature works well, unless explicitly instructed.
Always consider how your changes may affect other methods or code areas.

### Code Quality & Cleanliness
Prefer simple, clean solutions over complex ones.
Avoid code duplication by checking for existing similar functionality.
Always try to iterate on existing code or patterns rather than creating new ones.
Refactor files over 200–300 lines of code into smaller, focused modules.
Keep the codebase clean and well-organized.
Avoid saving one-off scripts as permanent files.

### Bug Fixes & New Patterns
Don’t introduce new patterns or tech without exhausting existing options.