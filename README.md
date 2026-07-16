# PM Command Centre

A standalone product-management operating tool using generic sample data. It contains no employer-specific recruitment, compensation, interview, employee, or confidential information.

## Run locally

From this directory:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Updating the installed app

The service worker uses network-first navigation, so the latest page is loaded whenever a connection is available. If an older installed version remains open, close every app window and open it again once; the new service worker activates automatically.

## Data handling

- The current application stores checklist and decision changes in the browser's local storage.
- Do not enter employer-confidential, regulated, personal, client, production, security, or non-public information.
- Use only synthetic/sample data unless the application is moved to an employer-approved environment with appropriate authentication, encryption, retention, monitoring, and access controls.

## Publishing

Keep the source repository private. A public deployment should contain sample data only.
