import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('service worker precaches a complete first-launch shell', async () => {
  const worker = await read('service-worker.js');
  for (const asset of ['./index.html', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png']) {
    assert.match(worker, new RegExp(asset.replace(/[./-]/g, '\\$&')));
  }
  assert.match(worker, /caches\.match\('\.\/index\.html'\)/);
  assert.match(worker, /if \(!response\.ok\) throw new Error/);
});

test('manifest provides installable regular and maskable icons', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.icons.length, 2);
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  assert.ok(manifest.icons.every(icon => icon.type === 'image/png' && icon.purpose.includes('maskable')));
});

test('standalone build contains the complete browser regression contract', async () => {
  const app = await read('app/pm-command-centre.html');
  const expected = [
    'Scoring and mandatory ordering', 'Strict import validation', 'Storage round-trip',
    'Backlog and risk collection persistence', 'Transactional template completion',
    'Template publication rollback', 'Stable template identifiers',
    'Corrupted storage recovery', 'Active-only executive reporting',
    'Report override persistence', 'Accessible controls and destructive confirmation'
  ];
  for (const name of expected) assert.ok(app.includes(`test('${name}'`), `Missing behavioural check: ${name}`);
  assert.match(app, /Circular dependency detected/);
  assert.match(app, /13\/13 checks passed|results\.length/);
});

test('user data rendering remains escaped and template IDs remain semantic', async () => {
  const app = await read('app/pm-command-centre.html');
  assert.match(app, /const esc = s =>/);
  assert.doesNotMatch(app, /pmcc-template-draft-\$\{/);
  assert.match(app, /templateId:t\.id/);
  assert.match(app, /Completed templates are immutable/);
  assert.match(app, /Import failed and previous data was restored/);
});

test('generated standalone excludes the obsolete visualization observer runtime', async () => {
  const standalone = await read('index.html');
  assert.doesNotMatch(standalone, /MutationObserver/);
  assert.doesNotMatch(standalone, /@floating-ui/);
  assert.doesNotMatch(standalone, /codex-visualization-lucide/);
});

test('cross-device sync encrypts payloads and keeps D1 access server-side', async () => {
  const app = await read('app/pm-command-centre.html');
  const worker = await read('worker.js');
  const migration = await read('migrations/0001_sync_workspaces.sql');
  assert.match(app, /scheduleAutoSync/);
  assert.match(app, /expectedRevision/);
  assert.doesNotMatch(app, /database_id/);
  assert.match(worker, /AES-GCM/);
  assert.match(worker, /github\.com\/login\/oauth\/authorize/);
  assert.match(worker, /GITHUB_ALLOWED_LOGIN/);
  assert.match(worker, /pmcc_session/);
  assert.match(worker, /SYNC_SECRET/);
  assert.match(worker, /env\.DB\.prepare/);
  assert.match(worker, /token_hash/);
  assert.match(worker, /Remote data changed/);
  assert.match(worker, /window\.location\.replace/);
  assert.match(worker, /service-worker\.js/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS sync_workspaces/);
});

test('Safari authentication avoids service-worker redirect responses', async () => {
  const worker = await read('worker.js');
  const serviceWorker = await read('service-worker.js');
  assert.match(worker, /githubLoginPage/);
  assert.match(worker, /navigationPage\('\/', 'Sign-in complete'/);
  assert.match(serviceWorker, /pm-command-centre-v25/);
});

test('initiative lifecycle and delivery health stay compatible', async () => {
  const app = await read('app/pm-command-centre.html');
  assert.match(app, /healthForLifecycle=\{Draft:'Planned',Active:'On track',Blocked:'Blocked',Completed:'Done'\}/);
  assert.match(app, /lifecycleForHealth=\{Planned:'Draft','On track':'Active','At risk':'Active',Blocked:'Blocked',Done:'Completed'\}/);
  assert.match(app, /if\(!record\)\{delivery\.value=healthForLifecycle/);
  assert.match(app, /querySelector\('#f-override'\)\.value='None'/);
  assert.match(app, /querySelector\('#f-progress'\)\.value='0'/);
});

test('initiative form explains priority scoring', async () => {
  const app = await read('app/pm-command-centre.html');
  assert.match(app, /How to score 1–5/);
  assert.match(app, /Higher effort lowers the adjusted priority score/);
  assert.match(app, /Score against evidence, not optimism/);
  assert.match(app, /popovertarget="pm-scoring-guide"/);
});

test('polished shell uses the generic PM Command Centre identity', async () => {
  const app = await read('app/pm-command-centre.html');
  assert.match(app, /<h1>PM Command Centre<\/h1>/);
  assert.match(app, /Portfolio operating system/);
  assert.match(app, /class="app-header card"/);
  assert.match(app, /class="command-bar card"/);
  assert.doesNotMatch(app, /Voice &amp; Archive PM Command Centre/);
});

test('Guide Centre provides offline workflows and portfolio-aware coaching', async () => {
  const app = await read('app/pm-command-centre.html');
  assert.match(app, /id="pm-guide"/);
  assert.match(app, /function guideRecommendations/);
  assert.match(app, /function coachResponse/);
  assert.match(app, /What should I focus on this week/);
  assert.match(app, /Answers use transparent rules—no external AI or usage charges/);
  assert.match(app, /data-guide-action="new-initiative"/);
  assert.match(app, /id="pm-help-search"/);
  assert.match(app, /Methods &amp; metrics reference/);
  assert.match(app, /Weighted value = \(Risk reduction × 2\)/);
  assert.match(app, /function filterHelpReference/);
  assert.match(app, /Opportunity Assessment \+ Lean Business Case/);
  assert.doesNotMatch(app, /\/api\/(?:ai|chat|coach)/);
});
