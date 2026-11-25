import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

// Exercise the real client without a DOM package, Google account or network.
// Node 22.13+ provides the transform needed for its TypeScript parameter property.
const source = fs.readFileSync(new URL('../lib/google-drive-client.ts', import.meta.url), 'utf8');
const code = stripTypeScriptTypes(source, {mode: 'transform'});
const client = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const PDF = 'application/pdf';
const FOLDER = 'application/vnd.google-apps.folder';
const TOKEN = 'fictional-memory-only-drive-token';
const config = {
  configured: true,
  clientId: 'fictional-client.apps.googleusercontent.com',
  apiKey: 'fictional-restricted-picker-key',
  projectNumber: '222222222222',
  loginHint: '108000000000000000001',
  accountId: 'fictional-teacher',
  groupId: 'fictional-group',
  maxBytes: 10485760,
  maxFiles: 20,
};
const worksheet = (id, extra = {}) => ({id, name: id + '.pdf', mimeType: PDF, ...extra});
let checks = 0;
function check(label, assertion) {
  assertion();
  checks++;
  console.log('PASS ' + label);
}
async function rejects(label, promise, expected) {
  await assert.rejects(promise, error => expected === 'AbortError'
    ? error.name === 'AbortError'
    : error instanceof client.GoogleDriveClientError && error.code === expected);
  checks++;
  console.log('PASS ' + label);
}

function googleFixture() {
  const keys = ['window', 'location', 'document', 'fetch', 'localStorage', 'sessionStorage', 'setTimeout', 'clearTimeout'];
  const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const originalNow = Date.now;
  let now = 1800000000000, nextTimer = 0, oauthConfig, networkRequests = 0;
  const timers = new Map(), requests = [], pickers = [], initializations = [];
  const feature = {MULTISELECT_ENABLED: 'multi-select', NAV_HIDDEN: 'hide-navigation'};
  class DocsView {
    constructor(id) { this.id = id; }
    setMimeTypes(value) { this.mimeTypes = value; return this; }
    setParent(value) { this.parent = value; return this; }
    setIncludeFolders(value) { this.includeFolders = value; return this; }
    setSelectFolderEnabled(value) { this.selectFolderEnabled = value; return this; }
    setMode(value) { this.mode = value; return this; }
    setQuery(value) { this.query = value; return this; }
  }
  class PickerBuilder {
    constructor() { this.views = []; this.features = []; }
    addView(view) { this.views.push(view); return this; }
    enableFeature(value) { this.features.push(value); return this; }
    setDeveloperKey(value) { this.key = value; return this; }
    setAppId(value) { this.project = value; return this; }
    setOAuthToken(value) { this.token = value; return this; }
    setOrigin(value) { this.origin = value; return this; }
    setCallback(value) { this.callback = value; return this; }
    setMaxItems(value) { this.maxItems = value; return this; }
    setSelectableMimeTypes(value) { this.selectableMimeTypes = value; return this; }
    build() {
      const picker = {
        builder: this,
        visibility: [],
        disposalCount: 0,
        setVisible(value) { this.visibility.push(value); },
        dispose() { this.disposalCount++; },
      };
      pickers.push(picker);
      return picker;
    }
  }
  const google = {
    accounts: {oauth2: {
      initTokenClient(value) {
        oauthConfig = value;
        initializations.push(value);
        return {requestAccessToken: options => requests.push(options)};
      },
      hasGrantedAllScopes: () => fixture.scopeGranted,
    }},
    picker: {
      DocsView, PickerBuilder,
      ViewId: {DOCS: 'documents'},
      DocsViewMode: {LIST: 'list'},
      Feature: feature,
      Action: {PICKED: 'picked', CANCEL: 'cancel'},
    },
  };
  const forbiddenStorage = new Proxy({}, {get() { throw Error('Drive session must not access browser storage'); }});
  const globals = {
    window: {google, gapi: {load() { throw Error('Picker SDK is already loaded'); }}},
    location: {origin: 'https://www.tickminder.test'},
    document: {scripts: [], createElement() { throw Error('SDK should be reused'); }},
    fetch: async () => { networkRequests++; throw Error('No network allowed in the Picker fixture'); },
    localStorage: forbiddenStorage,
    sessionStorage: forbiddenStorage,
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, {callback, at: now + delay}); return id; },
    clearTimeout: id => timers.delete(id),
  };
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, {value, writable: true, configurable: true});
  Date.now = () => now;
  const fixture = {
    scopeGranted: true,
    requests, pickers, initializations, feature,
    get oauthConfig() { return oauthConfig; },
    get networkRequests() { return networkRequests; },
    authorize(response = {}) {
      oauthConfig.callback({access_token: TOKEN, expires_in: 300, scope: client.GOOGLE_DRIVE_FILE_SCOPE, ...response});
    },
    oauthError(type) { oauthConfig.error_callback({type}); },
    emit(data, picker = pickers.at(-1)) { assert(picker, 'an actual Picker must have opened'); picker.builder.callback(data); },
    pick(docs) { this.emit({action: 'picked', docs}); },
    advance(milliseconds) {
      now += milliseconds;
      for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    },
    restore() {
      Date.now = originalNow;
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
  return fixture;
}

async function withSession(run, overrides = {}) {
  const fixture = googleFixture();
  let session;
  try {
    session = await client.prepareGoogleDrive({...config, ...overrides});
    await run(session, fixture);
    check('Picker session performs no Google or Tickminder fetch', () => assert.equal(fixture.networkRequests, 0));
  } finally {
    session?.dispose();
    fixture.restore();
  }
}

await withSession(async (session, f) => {
  check('preparing a session does not request OAuth or open a Picker', () => {
    assert.equal(f.requests.length, 0);
    assert.equal(f.pickers.length, 0);
    assert.equal(session.hasToken(), false);
  });
  const choosing = session.choose();
  check('bound Google identity is preferred with the existing narrow consent scope', () => {
    assert.equal(f.oauthConfig.login_hint, config.loginHint);
    assert.equal(f.oauthConfig.scope, 'https://www.googleapis.com/auth/drive.file');
    assert.equal(f.oauthConfig.include_granted_scopes, false);
    assert.equal(f.oauthConfig.prompt, '');
    assert.deepEqual(f.requests, [{prompt: ''}]);
  });
  f.authorize();
  check('the standard document browser starts at My Drive with folder navigation and PDF-only multiselect', () => {
    const picker = f.pickers.at(-1), builder = picker.builder;
    assert.equal(builder.views.length, 1);
    const view = builder.views[0];
    assert.equal(view.id, 'documents');
    assert.equal(view.parent, 'root');
    assert.equal(view.includeFolders, true);
    assert.equal(view.selectFolderEnabled, false);
    assert.equal(view.mimeTypes, PDF);
    assert.equal(view.mode, 'list');
    assert.equal(view.query, undefined, 'a fixed query must not replace native search');
    assert(builder.features.includes(f.feature.MULTISELECT_ENABLED));
    assert(!builder.features.includes(f.feature.NAV_HIDDEN), 'keep the native browser navigation available');
    assert.equal(builder.selectableMimeTypes, PDF);
    assert.equal(builder.maxItems, 20);
    assert.equal(builder.project, config.projectNumber);
    assert.equal(builder.key, config.apiKey);
    assert.equal(builder.token, TOKEN);
    assert.equal(builder.origin, 'https://www.tickminder.test');
    assert.deepEqual(picker.visibility, [true]);
  });
  f.pick([
    worksheet('lesson-a', {name: '../Lesson A.PDF', resourceKey: 'valid-resource-key'}),
    worksheet('lesson-b'),
    worksheet('lesson-a', {name: 'Duplicate.pdf'}),
  ]);
  const selected = await choosing;
  check('multiple PDF selections are normalized and duplicate file IDs cannot create extra queue entries', () => {
    assert.deepEqual(selected.map(file => file.id), ['lesson-a', 'lesson-b']);
    assert.equal(selected[0].resourceKey, 'valid-resource-key');
    assert(!selected[0].name.includes('/'));
    assert(selected[0].name.endsWith('.pdf'));
    assert.equal(f.pickers[0].disposalCount, 1);
    assert.deepEqual(f.pickers[0].visibility, [true, false]);
    assert.equal(session.hasToken(), true);
  });
  const next = session.choose();
  check('reopening a valid session starts again at root without requesting a second account authorization', () => {
    assert.equal(f.requests.length, 1);
    assert.equal(f.pickers.length, 2);
    assert.equal(f.pickers[1].builder.views[0].parent, 'root');
  });
  f.emit({action: 'cancel'});
  check('cancelling the native Picker returns no files and closes it', () => {
    assert.equal(f.pickers[1].disposalCount, 1);
  });
  assert.deepEqual(await next, []);
});

for (const invalid of [
  {label: 'folders cannot be imported even if a forged SDK callback selects one', docs: [{id: 'lesson-folder', name: 'All lessons', mimeType: FOLDER}], code: 'not_pdf'},
  {label: 'a mixed folder and PDF callback cannot partially enqueue an entire folder', docs: [worksheet('lesson-a'), {id: 'folder-a', mimeType: FOLDER}], code: 'not_pdf'},
  {label: 'Google-native documents remain outside PDF import', docs: [{id: 'document-a', mimeType: 'application/vnd.google-apps.document'}], code: 'not_pdf'},
  {label: 'a forged selection above twenty files is rejected before any download', docs: Array.from({length: 21}, (_, i) => worksheet('lesson-' + i)), code: 'too_many_files'},
  {label: 'a malformed Picker payload is rejected', docs: null, code: 'invalid_selection'},
  {label: 'path-like file IDs cannot enter the import queue', docs: [worksheet('../outside')], code: 'not_pdf'},
]) {
  await withSession(async (session, f) => {
    const choosing = session.choose();
    f.authorize();
    const rejected = rejects(invalid.label, choosing, invalid.code);
    f.pick(invalid.docs);
    await rejected;
    check('invalid selections close their Picker', () => assert.equal(f.pickers[0].disposalCount, 1));
  });
}

for (const hint of [null, undefined, 'contains whitespace', 'x'.repeat(321)]) {
  await withSession(async (session, f) => {
    check('unbound or invalid Google hints are omitted without inventing an account email', () => {
      assert(!Object.hasOwn(f.oauthConfig, 'login_hint'));
      assert.equal(f.oauthConfig.prompt, '');
    });
  }, {loginHint: hint});
}

for (const [type, code] of [['popup_closed', 'popup_closed'], ['popup_failed_to_open', 'popup_blocked'], ['unexpected', 'authorization_failed']]) {
  await withSession(async (session, f) => {
    const choosing = session.choose();
    const rejected = rejects('OAuth ' + type + ' fails visibly without opening a file browser', choosing, code);
    f.oauthError(type);
    await rejected;
    check('failed authorization leaves no token or Picker', () => {
      assert.equal(session.hasToken(), false);
      assert.equal(f.pickers.length, 0);
    });
  });
}

await withSession(async (session, f) => {
  f.scopeGranted = false;
  const choosing = session.choose();
  const rejected = rejects('a response without the requested Drive scope is not accepted', choosing, 'authorization_failed');
  f.authorize();
  await rejected;
  assert.equal(session.hasToken(), false);
  assert.equal(f.pickers.length, 0);
});

await withSession(async (session, f) => {
  const first = session.choose();
  await rejects('a second concurrent chooser cannot replace a pending authorization', session.choose(), 'authorization_failed');
  const rejected = rejects('clearing a pending authorization cancels the chooser', first, 'AbortError');
  session.clearToken();
  await rejected;
  f.authorize();
  check('late authorization after cancellation does not reopen a stale Picker', () => {
    assert.equal(session.hasToken(), false);
    assert.equal(f.pickers.length, 0);
  });
  const next = session.choose();
  f.authorize();
  const cleared = rejects('clearing the token cancels an open Picker', next, 'AbortError');
  session.clearToken();
  await cleared;
  check('token clear disposes the old browser and drops reusable authorization', () => {
    assert.equal(f.requests.length, 2);
    assert.equal(f.pickers[0].disposalCount, 1);
    assert.equal(session.hasToken(), false);
  });
  await rejects('a cleared token cannot download a queued file', session.download(worksheet('lesson-a'), config.maxBytes, new AbortController().signal), 'authorization_expired');
});

await withSession(async (session, f) => {
  const choosing = session.choose();
  f.authorize();
  const rejected = rejects('the token expiry safety window closes a pending Picker', choosing, 'AbortError');
  f.advance(285001);
  await rejected;
  check('expired authorization cannot be reused', () => assert.equal(session.hasToken(), false));
  await rejects('expired authorization cannot reach the download path', session.download(worksheet('lesson-a'), config.maxBytes, new AbortController().signal), 'authorization_expired');
  const renewed = session.choose();
  check('another explicit choice reconnects after expiry', () => assert.equal(f.requests.length, 2));
  f.authorize();
  f.pick([worksheet('lesson-renewed')]);
  assert.deepEqual((await renewed).map(file => file.id), ['lesson-renewed']);
});

await withSession(async (session, f) => {
  const choosing = session.choose();
  const rejected = rejects('disposing the class/account context cancels its pending chooser', choosing, 'AbortError');
  session.dispose();
  await rejected;
  f.authorize();
  check('a late response after context disposal cannot revive the token or Picker', () => {
    assert.equal(session.hasToken(), false);
    assert.equal(f.pickers.length, 0);
  });
  await rejects('a disposed context cannot choose files again', session.choose(), 'AbortError');
});

const unconfigured = googleFixture();
try {
  await rejects('unconfigured Drive fails before OAuth initialization', client.prepareGoogleDrive({...config, configured: false}), 'not_configured');
  const controller = new AbortController();
  controller.abort();
  await rejects('a pre-aborted prepare never starts an account session', client.prepareGoogleDrive(config, controller.signal), 'AbortError');
  assert.equal(unconfigured.initializations.length, 0);
} finally {
  unconfigured.restore();
}

console.log(JSON.stringify({suite: 'google-drive-picker', checks, googleMocked: true, networkRequests: 0, productionWrites: false}));
