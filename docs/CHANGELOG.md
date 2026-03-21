# Changelog

## 2026-03-16

- added a formal PRD for the Apps in Toss vocabulary app direction
- audited the three textbook DB sources and confirmed their practical schemas
- decided the normalized collection model: `Basic`, `Advanced`, `Etymology`
- started the build pipeline for bundling source DB files into app-ready JSON
- added a Windows-friendly DB sync script and generated the first bundled dataset snapshot
- rewired the study UI to use bundled DB data instead of the old PDF sample flow
- passed `sync:db`, `lint`, `build`, and static HTTP preview verification
