// Public reference guard. Fixture previews remain offline and available.
if (!process.argv.includes('--fixture')) throw new Error("Reference copy: adapt addresses, channel IDs, catalogue and database mappings, then remove this guard before deployment.");
// Run inside Tunarr-DK: node /config/tunarr/rebuild-cn.mjs [--apply]
// Default: read-only preview. Only the existing CN pair is ever updated.
import fs from 'node:fs/promises';
import path from 'node:path';

const bases = {da:'http://192.0.2.10:8104', en:'http://192.0.2.10:8105'};
const ids = {da:'00000000-0000-4000-8000-000000000001', en:'00000000-0000-4000-8000-000000000002'};
const allowed = new Set([
  'Courage the Cowardly Dog', "Dexter's Laboratory", 'Ed, Edd n Eddy', 'Johnny Bravo',
  'Cow and Chicken', "Foster's Home for Imaginary Friends", 'The Grim Adventures of Billy and Mandy',
  'Adventure Time', 'Regular Show', 'The Amazing World of Gumball', 'Teen Titans Go!',
  'The Powerpuff Girls', 'Be Cool, Scooby-Doo!', "What's New, Scooby-Doo?", 'Scooby-Doo and Guess Who?',
  'Totally Spies!', 'Star Wars: The Clone Wars', 'Avatar: The Last Airbender', 'Ben 10',
  'Ben 10: Alien Force', 'Pokemon',
].map(normalize));

function normalize(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function check(condition, message) { if (!condition) throw Error(message); }
async function request(lang, url, body, method) {
  const response = await fetch(bases[lang] + '/api' + url, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? {} : {'Content-Type':'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  check(response.ok, `${lang}: HTTP ${response.status} ${url.split('?')[0]}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
function selected(rows) {
  return rows.filter(r => r.type === 'content' && r.program?.type === 'episode' &&
    r.program.state === 'ok' && allowed.has(normalize(r.program.show?.title ?? '')) &&
    Number.isFinite(r.duration) && r.duration > 0);
}
function mapping(rows) {
  const result = new Map();
  for (const row of rows) {
    check(row.program.externalId, `Missing external ID: ${row.id}`);
    check(!result.has(row.program.externalId), `Duplicate Jellyfin item: ${row.program.externalId}`);
    result.set(row.program.externalId,row);
  }
  return result;
}
function randomizer(seed) {
  return () => {seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = seed;
    t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;};
}
function shuffle(a,rnd) {const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function makePlan(da,en) {
  const maps={da:mapping(selected(da)),en:mapping(selected(en))};
  check(maps.da.size === maps.en.size, 'DA/EN selected counts differ; no changes made');
  for (const [ext,row] of maps.da) {
    const other=maps.en.get(ext);
    check(other, `Missing EN counterpart: ${row.program.show.title} ${row.program.title}`);
    check(Math.abs(row.duration-other.duration)<1,`Duration differs between instances: ${ext}`);
  }
  const groups = new Map();
  for (const r of maps.da.values()) {
    const s=r.program.show;
    check(s?.externalId, 'Program lacks a show identifier');
    if(!groups.has(s.externalId))groups.set(s.externalId,{name:`${s.title} (${s.year})`, rows:[]});
    groups.get(s.externalId).rows.push(r);
  }
  check(groups.size === 23, `Expected 23 CN series, found ${groups.size}; inspect before applying`);
  for (const g of groups.values())g.rows.sort((a,b)=>
    (a.program.season.index-b.program.season.index)||
    (a.program.episodeNumber-b.program.episodeNumber)||a.program.title.localeCompare(b.program.title));
  const sets=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
  const rounds=Math.max(...sets.map(g=>g.rows.length));
  const rnd=randomizer(20261107);const sequence=[];
  for(let i=0;i<rounds;i++)for(const g of shuffle(sets,rnd))sequence.push(g.rows[i%g.rows.length].program.externalId);
  const body={};
  for(const lang of ['da','en'])body[lang]={type:'manual',append:false,lineup:sequence.map(ext=>{
    const r=maps[lang].get(ext);return {type:'content',id:r.id,duration:maps.da.get(ext).duration};
  })};
  return {body,sets,unique:maps.da.size,entries:sequence.length,duration:body.da.lineup.reduce((n,p)=>n+p.duration,0)};
}
function sameSchedule(a,b) {
  check(a.lineup.length===b.lineup.length,'Saved lineup lengths differ');
  for(let i=0;i<a.lineup.length;i++){
    const x=a.lineup[i],y=b.lineup[i];
    check(x.type==='content' && y.type==='content','Unexpected timing entry in CN lineup');
    check(a.programs[x.id]?.program.externalId===b.programs[y.id]?.program.externalId,`Episode mismatch at ${i}`);
    check(Math.abs(x.duration-y.duration)<1,`Timing mismatch at ${i}`);
  }
}

async function main() {
  const fixture=process.argv.indexOf('--fixture');let data={},channels={};
  for(const lang of ['da','en']) {
    if(fixture>=0){data[lang]=JSON.parse(await fs.readFile(path.join(process.argv[fixture+1],`tunarr-library-${lang}.json`),'utf8'));continue;}
    const sources=await request(lang,'/media-sources');
    const source=sources.find(s=>s.type==='jellyfin'&&s.libraries.some(l=>l.name==='Kids Shows'&&l.enabled));
    check(source,`${lang}: Kids Shows source missing`);
    const lib=source.libraries.find(l=>l.name==='Kids Shows');
    const scan=await request(lang,`/media-sources/${source.id}/${lib.id}/status`);
    check(scan.state==='not_scanning',`${lang}: library is still scanning`);
    channels[lang]=await request(lang,`/channels/${ids[lang]}`);
    data[lang]=await request(lang,`/media-libraries/${lib.id}/programs`);
  }
  const plan=makePlan(data.da,data.en);
  for(const g of plan.sets)console.log(`${g.name}: ${g.rows.length} available episodes`);
  console.log(`\n${plan.sets.length} shows | ${plan.unique} unique episodes | ${plan.entries} scheduled entries`);
  console.log(`Balanced rotation: ${(plan.duration/86400000).toFixed(1)} days; English-only episodes retained.`);
  check(fixture<0 || !process.argv.includes('--apply'),'Cannot apply fixtures');
  if(!process.argv.includes('--apply')){console.log('PREVIEW ONLY. No settings or channels changed.');return;}
  const folder=`/config/tunarr/backups/cn-api-${Date.now()}`;
  await fs.mkdir(folder,{recursive:false});const old={};
  for(const lang of ['da','en']){
    old[lang]=await request(lang,`/channels/${ids[lang]}/programming`);
    await fs.writeFile(`${folder}/${lang}.json`,JSON.stringify({channel:channels[lang],programming:old[lang]}));
  }
  console.log('Rollback snapshot:',folder);
  const startTime=Math.floor(Date.now()/60000)*60000;let touched=[];
  try {
    for(const lang of ['en','da']) {
      touched.push(lang);
      const result=await request(lang,`/channels/${ids[lang]}/programming`,plan.body[lang]);
      check(result.lineup.length===plan.entries,`${lang}: saved entry count differs`);
      const updated=await request(lang,`/channels/${ids[lang]}`);
      await request(lang,`/channels/${ids[lang]}`,{...updated,name:`Cartoon Network ${lang.toUpperCase()}`,duration:plan.duration,startTime,onDemand:{enabled:false}},'PUT');
    }
    const a=await request('da',`/channels/${ids.da}/programming`);
    const b=await request('en',`/channels/${ids.en}/programming`);
    sameSchedule(a,b);
    const ca=await request('da',`/channels/${ids.da}`),cb=await request('en',`/channels/${ids.en}`);
    check(ca.startTime===cb.startTime && Math.abs(ca.duration-cb.duration)<1 && Math.abs(ca.duration-plan.duration)<1,'Saved channel timing differs');
    console.log(`CN DA/EN saved and verified: ${plan.entries} matching positions, identical duration and startTime.`);
    console.log(`Start: ${new Date(startTime).toISOString()}. Logos and Dispatcharr are the next step.`);
  } catch(error) {
    console.error('Apply failed; restoring touched CN channels.');
    for(const lang of touched.reverse())try {
      await request(lang,`/channels/${ids[lang]}/programming`,{type:'manual',append:false,lineup:old[lang].lineup});
      await request(lang,`/channels/${ids[lang]}`,channels[lang],'PUT');
      console.error(`${lang}: restored`);
    }catch{console.error(`${lang}: RESTORE FAILED. Use snapshot ${folder}/${lang}.json`);}
    throw error;
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
