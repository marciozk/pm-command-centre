# PM Command Centre

A standalone product-management operating tool using generic sample data. It contains no employer-specific recruitment, compensation, interview, employee, or confidential information.

## Run locally

From this directory:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html`.

`index.html` is the finished standalone/PWA entry point. The file
`app/pm-command-centre.html` is the maintainable source used by the build; it
has fallback styling for direct inspection, but normal use should always start
from `index.html`.

## Updating the installed app

The service worker uses network-first navigation, so the latest page is loaded whenever a connection is available. If an older installed version remains open, close every app window and open it again once; the new service worker activates automatically.

## Data handling

- The application persists the complete versioned data store in browser local storage: initiatives/backlog and roadmap dates, dependencies and priority overrides; metrics; risks and controls; stakeholders; vendors; decisions; product brief; template drafts and completed templates; lifecycle/archive states; and executive commentary overrides.
- Create, edit, archive, restore, delete, template publication and imported-data changes are saved immediately and survive reloads. Display-only state—selected tab, selected roadmap year, open dialog and the **Show archived** toggle—is intentionally session-only.
- If local storage is blocked, the app uses session recovery through the current browser window. Export before closing that window because session recovery is not durable storage.
- Use **Export** to create a JSON backup. Imports are strictly validated before replacing current data.
- Completed and archived initiatives are excluded from active portfolio metrics and executive reporting.
- Do not enter employer-confidential, regulated, personal, client, production, security, or non-public information.
- Use only synthetic/sample data unless the application is moved to an employer-approved environment with appropriate authentication, encryption, retention, monitoring, and access controls.

## Capabilities

- Unique IDs and edit, archive, restore and delete operations
- JSON import/export with schema, score, date, override and dependency validation
- Multi-year roadmap with dates, durations and cycle-safe dependencies
- Adjusted WSJF prioritisation using risk reduction, customer value, urgency, strategic alignment, confidence, available capacity, dependency readiness and effort, with mandatory regulatory, cyber, end-of-support and dependency overrides
- Persisted executive commentary and active-only reporting
- Persistent completed templates with transactional publication into destination workflows

## Verification

The application automatically runs its scoring, validation, unique-ID, backlog/risk persistence, stable template-ID, corrupted-storage recovery, lifecycle-aware metrics, report-override persistence, accessibility, mandatory-template validation, transactional publication/rollback and reporting checks at startup. Select **Run checks** to repeat the suite; a healthy build reports `13/13 checks passed`.

The repository also includes a repeatable Node test suite for the offline application shell, manifest, generated-build contract and behavioural regression coverage:

```bash
npm test
```

Run the standalone rebuild and repository tests together with:

```bash
npm run check
```

The suite uses Node's built-in test runner and does not require third-party packages.

## Rebuilding the standalone file

The maintainable application source is `app/pm-command-centre.html`. After changing it, rebuild the PWA shell with:

```bash
python3 scripts/build-standalone.py
```

## Publishing

Keep the source repository private. A public deployment should contain sample data only.
