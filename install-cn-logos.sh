#!/bin/sh
# Public reference guard. Remove these two commands after adaptation.
printf '%s\n' 'Reference copy: adapt addresses, channel IDs, catalogue and database mappings, then remove this guard before deployment.' >&2
exit 1
# Owner-run: stage this script and the two selected PNGs in /mnt/user/downloads.
# Usage: sh /mnt/user/downloads/install-cn-logos.sh white
set -eu
variant=${1:-white}
case "$variant" in white|black) ;; *) echo 'Choose white or black'; exit 1;; esac
stage=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
for lang in da en; do
  test -r "$stage/cartoon-network-$lang-v2-$variant.png" || {
    echo "Missing logo: cartoon-network-$lang-v2-$variant.png"; exit 1;
  }
done
for lang in da en; do
  instance=$lang
  [ "$lang" != da ] || instance=dk
  target="/mnt/user/appdata/tunarr-$instance/config/images/uploads"
  test -d "$target"
  install -m 0644 "$stage/cartoon-network-$lang-v2-$variant.png" "$target/"
done
docker exec -i Tunarr-DK node - "$variant" <<'NODE'
const fs = require('node:fs/promises');
(async()=>{
  const variant=process.argv[2];
  if(!['black','white'].includes(variant))throw Error('Invalid variant');
  const configs=[
    ['da',8104,'00000000-0000-4000-8000-000000000001'],
    ['en',8105,'00000000-0000-4000-8000-000000000002']
  ];
  const originals=[];
  for(const [lang,port,id] of configs){
    const base=`http://192.0.2.10:${port}`;
    const url=`${base}/images/uploads/cartoon-network-${lang}-v2-${variant}.png`;
    const image=await fetch(url,{signal:AbortSignal.timeout(10000)});
    if(!image.ok || !image.headers.get('content-type')?.startsWith('image/'))throw Error(`${lang}: logo is not accessible`);
    await image.arrayBuffer();
    const r=await fetch(`${base}/api/channels/${id}`);
    if(!r.ok)throw Error(`${lang}: cannot read channel`);
    originals.push({lang,base,id,url,channel:await r.json()});
  }
  const backup=`/config/tunarr/backups/cn-icons-${Date.now()}.json`;
  await fs.writeFile(backup,JSON.stringify(originals));
  console.log('Previous channel settings:',backup);
  for(const {lang,base,id,url,channel} of originals){
    const r=await fetch(`${base}/api/channels/${id}`,{
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...channel,icon:{...channel.icon,path:url,useDefaultIconFallback:false}})
    });
    if(!r.ok)throw Error(`${lang}: icon update failed (HTTP ${r.status})`);
    const saved=await r.json();
    if(saved.icon.path!==url || saved.startTime!==channel.startTime ||
       Math.abs(saved.duration-channel.duration)>1 || saved.programCount!==channel.programCount)
      throw Error(`${lang}: channel verification failed`);
    console.log(`${saved.name}: ${variant} logo installed; ${saved.programCount} schedule entries retained.`);
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
NODE
