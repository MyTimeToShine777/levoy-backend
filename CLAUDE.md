# Working rules for this workspace

Repos: `levoy-backend` (this one: `backend-next/` API, `android/` app), `levoy-frontend` (submodule at `levoy-frontend/`, own repo),
and `levoy.api` (separate clone at `..\levoy.api`, the company's copy of the backend).

## Git
- Work **directly on `dev`** in every repo and push to `dev`. Never create other branches unless asked. If a repo has no `dev`, create it from `backup`.
- **No Claude attribution** in commits or PRs: no `Co-Authored-By: Claude`, no "Generated with Claude".
- Frontend work happens inside the `levoy-frontend` submodule (commit + push there). **Do not** make "point the submodule at ..." commits in `levoy-backend`; leave the submodule showing as modified unless asked to bump it.
- Do not rewrite or force-push shared history without asking first.
- Do not use `git stash` in `levoy-backend` (it un-stages the submodule swap).

## Machine
- **C: is almost full.** Run `npm install/ci`, Gradle builds, emulators and test runs on **D:** (copy the project to `D:\dev\work\<name>`, set `npm_config_cache=D:\dev\npm-cache`). Never leave `node_modules` or build output in the repos under `C:\Users\asus\Documents\GitHub\`.
- Gradle, the Android SDK and the AVD already live on D: (`D:\dev\.gradle`, `D:\dev\android-sdk`, `D:\dev\android-avd`).

## Backend notes
- Changes in `backend-next/` that go live must also reach `levoy.api` (same code, different repo).
- One-off data fixes are SQL scripts in `backend-next/scripts/` that roll back by default; never run them against a live database without showing the counts first.
