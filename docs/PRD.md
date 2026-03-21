# Voca Atelier PRD

## 1. Product Summary

Voca Atelier is a premium vocabulary study app built from the user's textbook DB and aimed at Apps in Toss deployment.
The experience should feel calm, polished, and mobile-first, with an Apple-like visual tone layered onto a practical memorization flow.

The app must turn three source datasets into one study product:

- `DB_comma_space_fixed.xlsx`: core/basic vocabulary
- `DB-advanced.csv`: advanced vocabulary
- `DB_어원편.xlsx`: etymology vocabulary

## 2. Goal

Create a vocabulary learning app that lets a learner:

- switch between `Basic`, `Advanced`, and `Etymology`
- study one card at a time
- run quick multiple-choice quizzes
- browse and search the whole library
- save progress locally during MVP

## 3. Platform Direction

Target platform is Apps in Toss.

Current product direction is:

- local MVP: static web bundle for fast iteration and repeatable verification
- release track: Apps in Toss WebView integration based on official Apps in Toss developer docs

Reference constraints used for this PRD:

- Apps in Toss supports WebView-based apps and provides an official web framework for existing web services
- non-game Apps in Toss mini apps are expected to align with Toss design system review expectations
- TDS Mobile guidance currently centers on React usage and recommends React 18 for package compatibility

References:

- [Apps in Toss landing page](https://toss.im/apps-in-toss)
- [Apps in Toss Developer Center: WebView 시작하기](https://developers-apps-in-toss.toss.im/tutorials/webview)
- [Apps in Toss Developer Center: Storage](https://developers-apps-in-toss.toss.im/sdk/web/framework/storage)
- [Apps in Toss Developer Center: TDS Mobile WebView 디자인 튜토리얼](https://developers-apps-in-toss.toss.im/tutorials/design_tutorials/webview.html)

## 4. Product Principles

This project follows the user's requested vibe-coding rules:

- PRD first, code second
- keep context in docs and generated data files
- do one coherent feature chunk at a time
- validate after every chunk
- refactor after major progress points
- keep a visible changelog

## 5. Users

Primary user:

- Korean learner studying from the user's printed vocabulary books

Secondary user:

- the same creator managing and shipping the study product inside Apps in Toss

## 6. Data Inputs

### Basic

- source: `DB_comma_space_fixed.xlsx`
- structure: `단어`, `의미`, `파생어1~6`, `파생어 뜻1~6`
- observed size: `3,000` entries plus header
- planned grouping: `30` study days x `100` words

### Advanced

- source: `DB-advanced.csv`
- structure: `단어`, `의미`, `파생어1~6`, `파생어 뜻1~6`
- observed size: `1,500` entries plus header
- planned grouping: `30` study sets x `50` words

### Etymology

- source: `DB_어원편.xlsx`
- main sheet: `vocab`
- structure: `chapter`, `toc`, `word`, `meaning`
- observed size: `1,741` entries plus header
- planned grouping: `chapter` based browsing and study

## 7. MVP Scope

### Included

- bundled JSON snapshot generated from the three source files
- collection switcher: `Basic`, `Advanced`, `Etymology`
- group filter: day/set/chapter
- focus card mode
- quiz mode
- searchable library mode
- local favorites
- local mastered state
- build-time verification and static export

### Excluded for now

- login
- sync across devices
- subscription/payment
- spaced repetition scheduling engine
- cloud DB
- official Apps in Toss SDK wiring

## 8. UX Shape

### Home view

- premium hero section with product tone
- source and progress summary
- collection switcher
- mobile shell preview

### Focus mode

- one term at a time
- front/back card
- save and mastered actions
- previous/next controls

### Quiz mode

- one prompt at a time
- four-way multiple choice when possible
- immediate feedback

### Library mode

- keyword search
- collection-aware results
- one-tap jump back into focus mode

## 9. Data Model

Normalized study record:

- `id`
- `collectionId`
- `term`
- `meaning`
- `derivatives[]`
- `groupId`
- `groupLabel`
- `groupIndex`
- optional `chapter`
- optional `root`
- `source`
- `order`
- `searchText`

## 10. Fixed Technical Stack

For the current MVP loop, the stack is frozen as:

- `Next.js` static export for rapid local preview
- `React`
- `Tailwind CSS`
- generated local JSON snapshots under `src/data`
- Windows-friendly DB sync script for the creator's source files

Release-track stack decision already reserved:

- Apps in Toss WebView integration via the official web framework
- TDS alignment before submission review

## 11. Acceptance Criteria

The MVP is acceptable when:

- all three DB sources are reflected in the app
- the app can filter and search within each collection
- cards and quiz work for every collection
- static export succeeds
- local preview returns the expected UI without blank screens
- the verification loop passes: sync DB -> lint -> build -> preview check

## 12. Delivery Phases

### Phase 1

- write PRD
- inspect DB structure
- generate normalized JSON

### Phase 2

- connect UI to normalized DB
- fix broken text and copy
- keep mobile-first premium layout

### Phase 3

- Apps in Toss bridge work
- TDS alignment
- submission prep and QA
