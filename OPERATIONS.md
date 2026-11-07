# Deployment and recovery reference

These commands describe the original order of operations after adapting the reference scripts and removing their explicit guards. They do not constitute a request to rebuild healthy channels.

## Requirements

Use the Unraid host terminal for host scripts. Required tools include Docker, curl, jq, install, flock and Unraid `update_cron`. Node runs inside Tunarr for the builders. Dispatcharr Python scripts run inside its Django environment. Configure the media source and path replacement before a library scan.

Create and inspect the initial Cartoon Network channel in each Tunarr instance first. The CN builder replaces an existing pair; Disney is created later from the corresponding CN templates. Back up both full Tunarr configs and the Dispatcharr database separately.

## Stage files

Copy the adapted root `.mjs`, `.cjs`, `.sh` and `.py` files to `/mnt/user/downloads`. Do not include tests unless you need them there. Also copy these four selected files from `logos/` directly into the staging directory:

- `cartoon-network-da-v2-white.png`
- `cartoon-network-en-v2-white.png`
- `disney-channel-da-v3.png`
- `disney-channel-en-v3.png`

The selected CN white variants are bundled. The icon installer also supports black variants, but they must be generated and named `cartoon-network-{da,en}-v2-black.png` before choosing `black`.

## Build CN and enable hardware

```sh
install -m 0644 /mnt/user/downloads/rebuild-cn.mjs /mnt/user/appdata/tunarr-dk/config/rebuild-cn.mjs
docker exec Tunarr-DK node /config/tunarr/rebuild-cn.mjs
# Review the preview and existing backups before applying:
docker exec Tunarr-DK node /config/tunarr/rebuild-cn.mjs --apply
sh /mnt/user/downloads/install-cn-logos.sh white
```

Add Device `/dev/dri` to both saved Unraid Docker templates and apply them. Check which render node is Intel and accessible in both containers. The example updater requires Intel `renderD128` and an existing H.264 profile.

```sh
cat /sys/class/drm/renderD128/device/vendor
docker exec Tunarr-DK sh -c 'ls -l /dev/dri/renderD128'
docker exec Tunarr-EN sh -c 'ls -l /dev/dri/renderD128'
sh /mnt/user/downloads/enable-tunarr-vaapi.sh
```

The updater saves profiles, changes acceleration/driver/device and verifies them, then restarts both Tunarr containers. Check actual playback afterwards.

## Create Disney

```sh
# Writes helper/config/asset files and runs smoke tests:
sh /mnt/user/downloads/install-disney.sh preview
# Changes application settings/programming and installs daily cron:
sh /mnt/user/downloads/install-disney.sh apply
```

DK holds the builder, `state.json` and optional `pending.json` under `/config/tunarr/disney`. Both containers hold the audio helper/config and logos. First creation chooses a shared free internal number. Existing schedules extend from state rather than resetting their start.

## Import Dispatcharr and Jellyfin

Configure separate M3U/EPG sources for the two Tunarr instances. Substitute the NAS address for the example host:

```text
http://192.0.2.10:8104/api/channels.m3u
http://192.0.2.10:8104/api/xmltv.xml
http://192.0.2.10:8105/api/channels.m3u
http://192.0.2.10:8105/api/xmltv.xml
```

Set stream hashing to `TVG-ID` plus `M3U ID`. Refresh source accounts, inspect imported stream/EPG records, and adapt every relevant Python ID and task loop. Then either map through the interface or run the reviewed operations:

```sh
docker exec -i Dispatcharr python /app/manage.py shell < /mnt/user/downloads/update-dispatcharr-cn.py
docker exec -i Dispatcharr python /app/manage.py shell < /mnt/user/downloads/create-dispatcharr-disney.py
```

Verify the combined output before asking Jellyfin to refresh:

```text
http://192.0.2.10:9191/output/m3u
http://192.0.2.10:9191/output/epg
```

In Jellyfin Live TV, use those as the M3U tuner and XMLTV guide provider. If already configured, use the existing tuner. Run Refresh Guide and check each channel's actual picture, language, current episode and guide timing. Preserve existing DR channel mappings.

## Refresh stale guides and images

Inspect the saved Tunarr lineup, Tunarr XMLTV, Dispatcharr XMLTV and Jellyfin guide in that order. A downstream refresh cannot repair stale upstream data.

The original stale CN cache needed this channel-specific operation, with its actual UUID:

```sh
curl -fsS -X POST -H 'Content-Type: application/json' -d '{"channelId":"<ACTUAL_CHANNEL_UUID>"}' http://192.0.2.10:8104/api/tasks/UpdateXmlTvTask/run
```

Then refresh the correct EPG sources through Dispatcharr's interface or installed native tasks, verify exports, and run Jellyfin Refresh Guide.

If Jellyfin retains a prior channel icon, its targeted replacement operation is `POST /Items/{id}/RemoteImages/Download?type=Primary&imageUrl=<ENCODED_URL>`. Use the actual Jellyfin channel item ID, the correct Dispatcharr cached logo URL and an API key supplied privately at runtime. The original CN operation returned HTTP 204. This is conditional troubleshooting, not daily maintenance.

## Maintenance

Persistent cron definition: `/boot/config/plugins/dynamix/tunarr-disney.cron`, daily 04:17 server time. The installer calls `update_cron`. The host runner uses `flock` and calls the DK builder with `--maintain`.

```sh
cat /boot/config/plugins/dynamix/tunarr-disney.cron
tail -n 40 /mnt/user/appdata/scripts/logs/tunarr-disney-maintain.log
jq '{startTime,endTime,nextAppointment,sjovCursor,channels}' /mnt/user/appdata/tunarr-dk/config/disney/state.json
```

Manual maintenance is a potential write:

```sh
sh /mnt/user/appdata/scripts/tunarr-disney-maintain.sh
```

With at least 70 days remaining it returns early without a full audit of live lineups. Below that it appends to approximately 84 days and preserves the original timeline. Monitor failures rather than assuming the presence of a cron definition proves successful renewal.

## Recovery

Preserve both configs, Disney state, helper files and the update journal in regular backups. The builder's `/config/tunarr/backups/disney-<timestamp>/transaction.json` and `pending.json` describe an interrupted operation. A subsequent reviewed apply/maintenance can verify completion or attempt rollback. If rollback fails, keep the journal and indicated backup for inspection.

Do not delete state, recreate Disney blindly, clone the DK database over EN, or run historical sync against the Disney lineup. CN rebuild resets its start time; it is not an append. The CN icon installer snapshots prior metadata but has no paired automatic rollback. Mapping snapshots are not complete Dispatcharr database backups. Its queued refresh tasks run after the transaction and need their own verification.

The frozen Disney catalogue has no supported migration or history-pruning command. Test a reviewed change separately before altering an existing schedule.
