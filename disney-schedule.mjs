// Pure calendar and rotation logic shared by the Disney preview and owner-run maintainer.
export const ZONE = 'Europe/Copenhagen';
export const DAY = 86400000;
export const MAIN_SHOWS = [
  'DuckTales', "Disney's Adventures of the Gummi Bears", "Chip 'n' Dale Rescue Rangers",
  'TaleSpin', 'Darkwing Duck', 'Goof Troop', 'Quack Pack', 'The Little Mermaid',
  'Hercules', '101 Dalmatians: The Series', 'Kim Possible', 'American Dragon: Jake Long',
  'Lilo & Stitch: The Series', "The Emperor's New School", 'Phineas and Ferb',
  'Gravity Falls', 'The Legend of Tarzan',
];
export const SHORTS = 'Gravity Falls Shorts';
export const SJOV = 'Disney Sjov';
const allowed = new Set([...MAIN_SHOWS, SHORTS, SJOV]);
export function check(ok, message) { if (!ok) throw new Error(message); }

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});
export function localParts(ms) {
  return Object.fromEntries(formatter.formatToParts(new Date(ms))
    .filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}
export function localLabel(ms) { return formatter.format(new Date(ms)); }
export function localDate(ms) {
  const p = localParts(ms);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
function calendarShift(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}
export function fridayAt19(date) {
  const [y, m, d] = date.split('-').map(Number);
  const wanted = Date.UTC(y, m - 1, d, 19);
  let value = wanted;
  for (let i = 0; i < 4; i++) {
    const p = localParts(value);
    const delta = wanted - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    value += delta;
    if (!delta) break;
  }
  const p = localParts(value);
  check(localDate(value) === date && p.hour === 19 && p.minute === 0 && p.second === 0,
    `Cannot resolve 19:00 in ${ZONE}: ${date}`);
  return value;
}
export function firstFriday(start) {
  const date = localDate(start);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  let candidate = calendarShift(date, (5 - weekday + 7) % 7);
  if (fridayAt19(candidate) < start) candidate = calendarShift(candidate, 7);
  return fridayAt19(candidate);
}
export function nextFriday(previous) { return fridayAt19(calendarShift(localDate(previous), 7)); }

function airDate(title) {
  const match = title.match(/\b(20\d{2})[. -](\d{2})[. -](\d{2})\b/);
  check(match, `Disney Sjov title lacks a broadcast date: ${title}`);
  const date = match.slice(1).join('-');
  check(new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date, `Invalid air date: ${date}`);
  return date;
}
function order(a, b) {
  return (a.program.season.index - b.program.season.index) ||
    (a.program.episodeNumber - b.program.episodeNumber) ||
    a.program.title.localeCompare(b.program.title) || a.program.externalId.localeCompare(b.program.externalId);
}
export function makeCatalog(daRows, enRows) {
  const maps = {};
  for (const [lang, rows] of Object.entries({ da: daRows, en: enRows })) {
    const map = new Map();
    for (const row of rows) {
      const p = row.program;
      if (row.type !== 'content' || p?.type !== 'episode' || p.state !== 'ok' || !allowed.has(p.show?.title)) continue;
      check(p.externalId && p.show.externalId, `Missing source identity: ${p.title}`);
      check(!map.has(p.externalId), `Duplicate source item: ${p.externalId}`);
      check(Number.isFinite(row.duration) && row.duration > 0, `Missing duration: ${p.show.title} / ${p.title}`);
      map.set(p.externalId, { ...row, duration: Math.round(row.duration) });
    }
    maps[lang] = map;
  }
  check(maps.da.size === maps.en.size, 'Disney DA/EN library counts differ');
  const groups = new Map();
  const items = new Map();
  for (const [ext, row] of maps.da) {
    const other = maps.en.get(ext);
    check(other && other.duration === row.duration && other.program.show.title === row.program.show.title,
      `Missing or different EN counterpart: ${row.program.show.title} / ${row.program.title}`);
    const name = row.program.show.title;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
    items.set(ext, {
      externalId: ext, duration: row.duration, show: name, title: row.program.title,
      season: row.program.season.index, episode: row.program.episodeNumber,
      ids: { da: row.id, en: other.id },
    });
  }
  for (const name of allowed) check(groups.has(name), `Expected Disney show missing: ${name}`);
  const normal = [...MAIN_SHOWS, SHORTS].sort().map(name => {
    const rows = groups.get(name).sort(order);
    check(new Set(rows.map(r => r.program.show.externalId)).size === 1, `Multiple series matched: ${name}`);
    return { name, items: rows.map(r => items.get(r.program.externalId)) };
  });
  const sjov = groups.get(SJOV).map(r => ({ ...items.get(r.program.externalId), airDate: airDate(r.program.title) }))
    .sort((a, b) => a.airDate.localeCompare(b.airDate));
  check(new Set(sjov.map(p => p.airDate)).size === sjov.length, 'Duplicate Disney Sjov broadcast dates');
  const shorts = normal.find(g => g.name === SHORTS).items;
  return { maps, items, normal, shorts, sjov };
}
function permutation(count, round) {
  let seed = (20261107 + round) | 0;
  const random = () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, seed | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const result = Array.from({ length: count }, (_, i) => i);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function newSchedule(catalog, startTime) {
  check(Number.isSafeInteger(startTime), 'Schedule start must be an integer timestamp');
  return {
    version: 1, timeZone: ZONE, startTime, endTime: startTime, entries: [],
    firstAppointment: firstFriday(startTime), nextAppointment: firstFriday(startTime),
    sjovCursor: 0, round: 0, roundPosition: 0,
    pointers: Object.fromEntries(catalog.normal.map(g => [g.name, 0])),
    sjovOrder: catalog.sjov.map(p => p.externalId),
    normalOrder: catalog.normal.map(g => ({ name: g.name, ids: g.items.map(p => p.externalId) })),
  };
}
export function extendSchedule(original, catalog, until) {
  const state = structuredClone(original);
  check(state.version === 1 && state.timeZone === ZONE, 'Unknown Disney schedule version/timezone');
  check(JSON.stringify(state.sjovOrder) === JSON.stringify(catalog.sjov.map(p => p.externalId)),
    'Disney Sjov inventory changed; review queue before continuing');
  check(JSON.stringify(state.normalOrder) === JSON.stringify(catalog.normal.map(g => ({ name: g.name, ids: g.items.map(p => p.externalId) }))),
    'Disney inventory/order changed; review before continuing');
  const add = (kind, item, duration = item?.duration) => {
    check(Number.isSafeInteger(duration) && duration > 0, 'Invalid scheduled duration');
    state.entries.push({ kind, start: state.endTime, duration, ...(item ? { externalId: item.externalId } : {}) });
    state.endTime += duration;
  };
  while (state.endTime < until) {
    check(state.endTime <= state.nextAppointment, 'Appointment was crossed by an ordinary programme');
    if (state.endTime === state.nextAppointment) {
      add('friday', catalog.sjov[state.sjovCursor % catalog.sjov.length]);
      state.sjovCursor++;
      state.nextAppointment = nextFriday(state.nextAppointment);
      continue;
    }
    const queue = permutation(catalog.normal.length, state.round);
    const group = catalog.normal[queue[state.roundPosition]];
    const item = group.items[state.pointers[group.name] % group.items.length];
    const remaining = state.nextAppointment - state.endTime;
    if (item.duration <= remaining) {
      add('normal', item);
      state.pointers[group.name]++;
      if (++state.roundPosition === catalog.normal.length) { state.round++; state.roundPosition = 0; }
    } else {
      const short = catalog.shorts[state.pointers[SHORTS] % catalog.shorts.length];
      if (short.duration <= remaining) {
        add('short-fill', short);
        state.pointers[SHORTS]++;
      } else add('flex', undefined, remaining);
    }
  }
  validateSchedule(state, catalog);
  return state;
}
export function validateSchedule(state, catalog) {
  let cursor = state.startTime;
  let friday = firstFriday(state.startTime);
  let sjovNumber = 0;
  for (const entry of state.entries) {
    check(entry.start === cursor && Number.isSafeInteger(entry.duration) && entry.duration > 0,
      'Schedule has a gap, overlap or invalid duration');
    const item = entry.externalId ? catalog.items.get(entry.externalId) : null;
    if (entry.kind === 'friday') {
      check(item?.show === SJOV && cursor === friday, 'Disney Sjov outside its Friday 19:00 appointment');
      check(entry.externalId === catalog.sjov[sjovNumber % catalog.sjov.length].externalId,
        'Disney Sjov queue skipped or repeated an episode');
      check(entry.duration === item.duration, 'Disney Sjov was cut short');
      friday = nextFriday(friday); sjovNumber++;
    } else {
      check(cursor + entry.duration <= friday, 'Ordinary programme crosses Friday 19:00');
      if (entry.kind === 'flex') check(!item, 'Flex must not contain a programme');
      else check(item && item.show !== SJOV && entry.duration === item.duration, 'Invalid ordinary programme');
    }
    cursor += entry.duration;
  }
  check(cursor === state.endTime && sjovNumber === state.sjovCursor && friday === state.nextAppointment,
    'Schedule totals/cursor are inconsistent');
  return true;
}
export function apiLineup(state, catalog, lang, offset = 0) {
  return state.entries.slice(offset).map(entry => entry.kind === 'flex'
    ? { type: 'flex', duration: entry.duration }
    : { type: 'content', id: catalog.items.get(entry.externalId).ids[lang], duration: entry.duration });
}
export function describeSchedule(state, catalog) {
  return state.entries.filter(e => e.kind === 'friday').map(e => ({
    localTime: localLabel(e.start), utc: new Date(e.start).toISOString(),
    sourceDate: catalog.sjov.find(p => p.externalId === e.externalId).airDate,
    minutes: (e.duration / 60000).toFixed(2),
  }));
}
