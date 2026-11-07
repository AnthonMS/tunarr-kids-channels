import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  DAY, MAIN_SHOWS, SHORTS, SJOV, makeCatalog, newSchedule, extendSchedule,
  validateSchedule, firstFriday, nextFriday, describeSchedule, apiLineup,
} from './disney-schedule.mjs';

const root = process.argv[2] ?? os.tmpdir();
const catalog = makeCatalog(
  JSON.parse(await fs.readFile(path.join(root, 'disney-library-da.json'))),
  JSON.parse(await fs.readFile(path.join(root, 'disney-library-en.json'))),
);
assert.equal(catalog.normal.length, 18);
assert.equal(catalog.sjov.length, 60);
assert.equal(catalog.items.size, 1116);

// Weekly appointments retain 19:00 local time across both DST changes.
for (const [input, expected, after] of [
  ['2027-03-26T00:00:00Z', '2027-03-26T18:00:00.000Z', '2027-04-02T17:00:00.000Z'],
  ['2027-10-29T00:00:00Z', '2027-10-29T17:00:00.000Z', '2027-11-05T18:00:00.000Z'],
]) {
  const a = firstFriday(Date.parse(input));
  assert.equal(new Date(a).toISOString(), expected);
  assert.equal(new Date(nextFriday(a)).toISOString(), after);
  const schedule = extendSchedule(newSchedule(catalog, Date.parse(input)), catalog, Date.parse(input) + 21 * DAY);
  assert.equal(describeSchedule(schedule, catalog).length, 3);
}

const start = Date.parse('2026-11-07T14:30:00Z');
const initial = newSchedule(catalog, start);
const twelveWeeks = extendSchedule(initial, catalog, start + 84 * DAY);
assert.equal(initial.entries.length, 0, 'Planning must not mutate a committed state');
assert.equal(describeSchedule(twelveWeeks, catalog)[0].utc, '2026-11-13T18:00:00.000Z');
assert.equal(describeSchedule(twelveWeeks, catalog)[0].sourceDate, '2024-05-03');
assert.equal(twelveWeeks.sjovCursor, 12);

// Extending keeps every existing programme and resumes every show's episode cursor.
const extended = extendSchedule(twelveWeeks, catalog, start + 112 * DAY);
assert.deepEqual(extended.entries.slice(0, twelveWeeks.entries.length), twelveWeeks.entries);
const oneShot = extendSchedule(initial, catalog, start + 112 * DAY);
assert.deepEqual(extended, oneShot);
for (const name of [...MAIN_SHOWS, SHORTS]) {
  const group = catalog.normal.find(g => g.name === name);
  const aired = extended.entries.filter(e => catalog.items.get(e.externalId)?.show === name);
  aired.forEach((entry, index) => assert.equal(entry.externalId, group.items[index % group.items.length].externalId));
}
const used = new Set(twelveWeeks.entries.map(e => e.externalId));
for (const group of catalog.normal) for (const item of group.items) assert(used.has(item.externalId));

// Paired lineups include all content and the exact same padding durations.
const da = apiLineup(twelveWeeks, catalog, 'da');
const en = apiLineup(twelveWeeks, catalog, 'en');
assert.equal(da.length, en.length);
da.forEach((entry, i) => {
  assert.equal(entry.type, en[i].type);
  assert.equal(entry.duration, en[i].duration);
  if (entry.type === 'content') {
    assert.equal([...catalog.maps.da.values()].find(p => p.id === entry.id).program.externalId,
      [...catalog.maps.en.values()].find(p => p.id === en[i].id).program.externalId);
  }
});
assert(da.some(p => p.type === 'flex'));

// The archive wraps only after all 60 weekly episodes have aired.
const longRun = extendSchedule(initial, catalog, start + 65 * 7 * DAY);
const longFridays = describeSchedule(longRun, catalog);
assert.equal(longFridays.length, 65);
assert.equal(longFridays[59].sourceDate, catalog.sjov[59].airDate);
assert.equal(longFridays[60].sourceDate, catalog.sjov[0].airDate);

const damaged = structuredClone(twelveWeeks);
damaged.entries.find(e => e.kind === 'friday').start += 1000;
assert.throws(() => validateSchedule(damaged, catalog));
const wrongPool = structuredClone(twelveWeeks);
wrongPool.entries[0].externalId = catalog.sjov[0].externalId;
assert.throws(() => validateSchedule(wrongPool, catalog));

console.log('PASS: inventory, ordering, all main episodes, exact weekly appointments, both DST changes,');
console.log('paired padding, append continuity, no state mutation and invalid-plan rejection.');
console.log(`${catalog.items.size} files; ${twelveWeeks.entries.length} entries; ${twelveWeeks.sjovCursor} Fridays in the initial horizon.`);
console.log(JSON.stringify(describeSchedule(twelveWeeks, catalog).slice(0, 3), null, 2));
