// Public reference guard. Fixture previews remain offline and available.
if (!process.argv.includes('--fixture')) throw new Error("Reference copy: adapt addresses, channel IDs, catalogue and database mappings, then remove this guard before deployment.");
// Owner-run. Default is a read-only preview; --apply creates/extends the Disney pair.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  DAY, MAIN_SHOWS, SHORTS, makeCatalog, newSchedule, extendSchedule,
  apiLineup, describeSchedule, localLabel, check,
} from './disney-schedule.mjs';

const bases = { da: 'http://192.0.2.10:8104', en: 'http://192.0.2.10:8105' };
const cnIds = { da: '00000000-0000-4000-8000-000000000001', en: '00000000-0000-4000-8000-000000000002' };
const root = process.env.TUNARR_DISNEY_ROOT ?? '/config/tunarr/disney';
const statePath = path.join(root, 'state.json');
const pendingPath = path.join(root, 'pending.json');
const wrapper = '/config/tunarr/ffmpeg-disney.sh';
const languages = ['da', 'en'];
const options = process.argv.slice(2);
const apply = options.includes('--apply') || options.includes('--maintain');
const maintain = options.includes('--maintain');
const fixtureIndex = options.indexOf('--fixture');
const fixture = fixtureIndex >= 0 ? options[fixtureIndex + 1] ?? os.tmpdir() : null;
const atIndex = options.indexOf('--at');
const now = atIndex >= 0 ? Date.parse(options[atIndex + 1]) : Date.now();
check(Number.isFinite(now), 'Invalid --at timestamp');
check(!apply || (!fixture && atIndex < 0), 'Fixture/time overrides cannot be applied');

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function atomicJson(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(data));
  await fs.rename(temporary, file);
}
async function request(lang, route, body, method, allow404 = false) {
  const r = await fetch(`${bases[lang]}/api${route}`, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  if (allow404 && r.status === 404) return null;
  check(r.ok, `${lang}: HTTP ${r.status} ${route.split('?')[0]}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}
function logo(lang) { return `${bases[lang]}/images/uploads/disney-channel-${lang}-v3.png`; }
function protectedMetadata(channel) {
  return Object.fromEntries(['id', 'name', 'number', 'icon', 'startTime', 'duration', 'programCount', 'transcodeConfigId']
    .map(k => [k, channel[k]]));
}
async function catalogFor(state) {
  const rows = {};
  const frozen = state ? new Set([...state.sjovOrder, ...state.normalOrder.flatMap(g => g.ids)]) : null;
  for (const lang of languages) {
    if (fixture) rows[lang] = JSON.parse(await fs.readFile(path.join(fixture, `disney-library-${lang}.json`), 'utf8'));
    else {
      const sources = await request(lang, '/media-sources');
      const source = sources.find(s => s.type === 'jellyfin' && s.libraries.some(l => l.name === 'Kids Shows' && l.enabled));
      check(source, `${lang}: Kids Shows library not enabled`);
      const lib = source.libraries.find(l => l.name === 'Kids Shows');
      const status = await request(lang, `/media-sources/${source.id}/${lib.id}/status`);
      check(status.state === 'not_scanning', `${lang}: library scan is running; retry after it finishes`);
      rows[lang] = await request(lang, `/media-libraries/${lib.id}/programs`);
    }
    if (frozen) rows[lang] = rows[lang].filter(r => frozen.has(r.program?.externalId));
  }
  return makeCatalog(rows.da, rows.en);
}
async function verifyPair(state, catalog) {
  for (const lang of languages) {
    check(state.channels[lang]?.id, `${lang}: channel creation incomplete`);
    const channel = await request(lang, `/channels/${state.channels[lang].id}`);
    const saved = await request(lang, `/channels/${channel.id}/programming`);
    const expected = apiLineup(state, catalog, lang);
    check(channel.name === `Disney Channel ${lang.toUpperCase()}` && channel.number === state.number,
      `${lang}: Disney channel identity changed`);
    check(channel.startTime === state.startTime && Math.abs(channel.duration - (state.endTime - state.startTime)) < 1,
      `${lang}: saved channel timing differs`);
    check(saved.lineup.length === expected.length, `${lang}: saved entry count differs`);
    for (let i = 0; i < expected.length; i++) {
      const a = saved.lineup[i], b = expected[i], entry = state.entries[i];
      check(a.type === b.type && Math.abs(a.duration - b.duration) < 1, `${lang}: timing entry differs at ${i}`);
      if (a.type === 'content') check(saved.programs[a.id]?.program.externalId === entry.externalId,
        `${lang}: episode differs at ${i}`);
    }
    check(channel.programCount === expected.filter(e => e.type === 'content').length, `${lang}: content count differs`);
    const settings = await request(lang, '/ffmpeg-settings');
    check(settings.ffmpegExecutablePath === wrapper, `${lang}: Darkwing audio selector is not enabled`);
  }
}
async function rollback(pending) {
  let failed = false;
  for (const lang of [...languages].reverse()) {
    try {
      const old = pending.old[lang];
      if (old) {
        await request(lang, `/channels/${old.channel.id}/programming`, { type: 'manual', append: false, lineup: old.programming.lineup });
        await request(lang, `/channels/${old.channel.id}`, old.channel, 'PUT');
      } else {
        const current = await request(lang, '/channels');
        const created = current.filter(c => c.name === `Disney Channel ${lang.toUpperCase()}` &&
          c.number === pending.state.number && !pending.beforeIds[lang].includes(c.id));
        check(created.length <= 1, `${lang}: ambiguous new channel; manual recovery required`);
        for (const channel of created) await request(lang, `/channels/${channel.id}`, undefined, 'DELETE');
      }
      if (pending.ffmpeg[lang]) await request(lang, '/ffmpeg-settings', pending.ffmpeg[lang], 'PUT');
      console.error(`${lang}: previous state restored`);
    } catch (error) { failed = true; console.error(`${lang}: RESTORE FAILED: ${error.message}`); }
  }
  check(!failed, `Recovery incomplete. Keep journal and backup: ${pending.backup}`);
  await fs.rm(pendingPath);
}
async function recover(pending, catalog) {
  try {
    await verifyPair(pending.state, catalog);
    await atomicJson(statePath, pending.state);
    await fs.rm(pendingPath);
    console.log('Recovered a fully saved Disney update after interruption.');
    return pending.state;
  } catch {
    await rollback(pending);
    console.log('Interrupted update restored; continuing from the previous committed schedule.');
    return readJson(statePath);
  }
}
function printPlan(state, catalog, previous) {
  for (const group of catalog.normal) console.log(`${group.name}: ${group.items.length} files`);
  console.log(`Disney Sjov: ${catalog.sjov.length} dated episodes, Friday appointments only`);
  console.log(`\n${MAIN_SHOWS.length} main series + ${catalog.shorts.length} Gravity Falls Shorts + ${catalog.sjov.length} Disney Sjov files`);
  console.log(`${catalog.items.size} files in the approved pools; ${state.entries.length} scheduled entries including padding`);
  console.log(`Schedule: ${localLabel(state.startTime)} through ${localLabel(state.endTime)} (${state.timeZone})`);
  console.log(`Matched DA/EN timing; ${state.sjovCursor} Friday appointments; ${previous ? state.entries.length - previous.entries.length : state.entries.length} new entries`);
  for (const appointment of describeSchedule(state, catalog).slice(previous?.sjovCursor ?? 0, (previous?.sjovCursor ?? 0) + 4)) {
    console.log(`Disney Sjov: ${appointment.localTime} -> original ${appointment.sourceDate} (${appointment.minutes} min)`);
  }
  console.log('Shorts fill gaps before Friday 19:00; any final remainder uses the Disney logo break.');
}
async function main() {
  let state = fixture ? null : await readJson(statePath);
  let pending = fixture ? null : await readJson(pendingPath);
  check(apply || !pending, 'An interrupted update needs owner-run --apply recovery before preview');
  check(!maintain || state || pending, 'Disney schedule has not been created; maintenance cannot create channels');
  if (maintain && state && !pending && state.endTime - now >= 70 * DAY) {
    console.log(`${new Date().toISOString()}: schedule healthy through ${localLabel(state.endTime)}; no changes needed.`);
    return;
  }
  let catalog = await catalogFor(pending?.state ?? state);
  if (pending) {
    state = await recover(pending, catalog);
    pending = null;
    catalog = await catalogFor(state);
  }
  const original = state;
  const start = Math.ceil(now / 60000) * 60000;
  state = extendSchedule(state ?? newSchedule(catalog, start), catalog, now + 84 * DAY);
  printPlan(state, catalog, original);
  if (!apply) { console.log('PREVIEW ONLY. No channel or application settings changed.'); return; }
  if (original && state.entries.length === original.entries.length) {
    await verifyPair(state, catalog);
    console.log('Existing Disney schedule verified; nothing changed.'); return;
  }

  await fs.mkdir(root, { recursive: true });
  const backup = `/config/tunarr/backups/disney-${Date.now()}`;
  await fs.mkdir(backup, { recursive: false });
  if (original) await atomicJson(path.join(backup, 'state.json'), original);
  const old = {}, ffmpeg = {}, beforeIds = {}, templates = {}, protectedCN = {};
  const current = {};
  for (const lang of languages) {
    current[lang] = await request(lang, '/channels');
    beforeIds[lang] = current[lang].map(c => c.id);
    templates[lang] = await request(lang, `/channels/${cnIds[lang]}`);
    protectedCN[lang] = protectedMetadata(templates[lang]);
    const profile = await request(lang, `/transcode_configs/${templates[lang].transcodeConfigId}`);
    check(profile.hardwareAccelerationMode === 'vaapi' && profile.vaapiDevice === '/dev/dri/renderD128',
      `${lang}: tested Intel VAAPI profile is not active`);
    const image = await fetch(logo(lang), { signal: AbortSignal.timeout(15000) });
    check(image.ok && image.headers.get('content-type')?.startsWith('image/'), `${lang}: Disney v3 logo not installed`);
    await image.arrayBuffer();
    const settings = await request(lang, '/ffmpeg-settings');
    if (original) {
      check(settings.ffmpegExecutablePath === wrapper, `${lang}: audio override path changed; inspect before extending`);
      old[lang] = { channel: await request(lang, `/channels/${state.channels[lang].id}`),
        programming: await request(lang, `/channels/${state.channels[lang].id}/programming`) };
      ffmpeg[lang] = null;
    } else {
      check(!current[lang].some(c => /^Disney Channel (DA|EN)$/i.test(c.name)), `${lang}: Disney already exists without schedule state`);
      check(['/usr/bin/ffmpeg', wrapper].includes(settings.ffmpegExecutablePath), `${lang}: unexpected custom FFmpeg path`);
      ffmpeg[lang] = settings; old[lang] = null;
    }
  }
  if (original) await verifyPair(original, catalog);
  else {
    let number = 2;
    while (languages.some(lang => current[lang].some(c => c.number === number))) number++;
    state.number = number;
    state.channels = { da: null, en: null };
  }
  pending = { version: 1, backup, old, ffmpeg, beforeIds, state };
  await atomicJson(path.join(backup, 'transaction.json'), pending);
  await atomicJson(pendingPath, pending);
  console.log('Rollback snapshot:', backup);
  try {
    for (const lang of ['en', 'da']) {
      if (!original) {
        await request(lang, '/ffmpeg-settings', { ...ffmpeg[lang], ffmpegExecutablePath: wrapper }, 'PUT');
        const template = templates[lang];
        const channel = {
          ...template, id: randomUUID(), name: `Disney Channel ${lang.toUpperCase()}`, number: state.number,
          startTime: state.startTime, duration: state.endTime - state.startTime, onDemand: { enabled: false },
          icon: { ...template.icon, path: logo(lang), useDefaultIconFallback: false },
          offline: { mode: 'pic', picture: logo(lang) }, guideFlexTitle: 'Disney Channel',
          fillerCollections: [], fallback: undefined, watermark: undefined, sessions: undefined,
          subtitlesEnabled: false,
        };
        const created = await request(lang, '/channels', { type: 'new', channel });
        state.channels[lang] = { id: created.id };
        pending.state = state;
        await atomicJson(pendingPath, pending);
      }
      await request(lang, `/channels/${state.channels[lang].id}/programming`, {
        type: 'manual', append: Boolean(original), lineup: apiLineup(state, catalog, lang, original?.entries.length ?? 0),
      });
    }
    await verifyPair(state, catalog);
    for (const lang of languages) check(JSON.stringify(protectedMetadata(await request(lang, `/channels/${cnIds[lang]}`))) ===
      JSON.stringify(protectedCN[lang]), `${lang}: protected CN metadata changed`);
    await atomicJson(statePath, state);
    await fs.rm(pendingPath);
  } catch (error) {
    console.error('Disney update failed:', error.message);
    await rollback(pending);
    throw error;
  }
  for (const lang of languages) {
    try { await request(lang, '/tasks/UpdateXmlTvTask/run', { channelId: state.channels[lang].id }); }
    catch (error) { console.error(`Guide refresh needs retry: ${error.message}`); }
  }
  console.log(`Disney DA/EN saved and verified: ${state.entries.length} matching positions, including all padding.`);
  console.log('Channel IDs:', JSON.stringify(state.channels));
  console.log('Schedule state:', statePath);
  console.log('Dispatcharr import and Jellyfin playback checks are next.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
