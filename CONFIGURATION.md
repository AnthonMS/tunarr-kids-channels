# Adapting the reference scripts

The source files contain editable configuration constants. There is no shared configuration-file loader. Review the values below rather than expecting an `.env` file to change them.

Do not deploy the public examples over a healthy installation. Your current installed scripts and state remain the operating copies until you deliberately test an adapted version.

## Reference guards

Both Node builders stop before live access unless `--fixture` is present. Each Dispatcharr Python script stops before importing Django. The host installers and maintenance runner print a warning and exit before any operation. Remove only the explicit guard statement(s), after reviewing that file's configuration and dependencies. Keep all existing validation, snapshots and rollback checks.

The two pure helper modules, shell FFmpeg launcher and offline tests are not blocked. They do not configure channels by themselves. The installed maintenance runner and installed builders must all be adapted and unguarded, or cron will fail.

## Addresses and identifiers

| Example | Meaning | Files |
|---|---|---|
| `192.0.2.10` | Documentation-only example host, replace with a reachable NAS address | Both builders, CN icon installer, both Dispatcharr scripts |
| `8104`, `8105` | Tunarr DK/EN host ports | Builders, VAAPI updater, icon installer, Dispatcharr scripts |
| `00000000-0000-4000-8000-000000000001` | Existing CN DA UUID | Both builders, VAAPI updater, CN icon installer |
| `00000000-0000-4000-8000-000000000002` | Existing CN EN UUID | Both builders, VAAPI updater, CN icon installer |
| Python `PLAN` rows and trailing refresh-ID loops | Installation-specific database mappings | Both Dispatcharr scripts |
| Guide numbers 7, 8, 9, 10 | Viewer-facing channel numbers, separate from database IDs | Dispatcharr scripts and their output/backup descriptions |

Use each Tunarr's `/api/channels` to inspect its actual UUIDs. Disney channel UUIDs are generated at creation and persisted in `state.json`; do not invent replacements for an existing schedule.

Dispatcharr PLAN numbers are retained as an example mapping only. They are not discovered or translated automatically. EPGData primary keys and EPGSource primary keys belong to different tables. Inspect each stream, source account, EPG record, guide number, CN template, profile and access setting in your installation.

If you change a PLAN, also review task signature checks, trailing refresh loops, snapshot labels and output strings. Do not assume editing the PLAN alone configures the whole file. The original CN script's example uses EPG IDs that also matched source IDs; on another database those can differ and need separate mapping.

## Containers, paths and hardware

| Assumption | Where to check |
|---|---|
| Container names `Tunarr-DK`, `Tunarr-EN`, `Dispatcharr` | All host shell operations and deployment commands |
| `/mnt/user/appdata/tunarr-{dk,en}/config` maps to `/config/tunarr` | Unraid templates, installers, builders and launcher |
| `/mnt/user/Media` maps to `/data/Media` | Both Tunarr templates |
| Jellyfin reports `/media/`, replaced with `/data/Media/` | Both Tunarr Jellyfin sources |
| `/mnt/user/downloads` is the staging directory | Host examples, scripts resolve the directory containing themselves |
| `/mnt/user/appdata/scripts` is the host scripts/state/log location | Disney installer and maintenance runner |
| Intel `/dev/dri/renderD128`, vendor `0x8086` | VAAPI updater, Disney builder and installer |
| `/usr/bin/ffmpeg` and FFprobe are the real bundled tools | Launcher, installer and executable settings |
| Unraid `update_cron` and `/boot/config/plugins/dynamix` exist | Disney installer |

Changing GPU vendor or profile type is outside a search-and-replace adaptation. The Disney builder explicitly verifies the expected Intel VAAPI profile. Hardware tests need real throughput, not merely the existence of a device node.

Keep media read-only where possible. Store credentials in service configuration. The scripts do not require copied API keys for their Tunarr API operations on the original trusted network. If your API requires authentication, adapt the request boundary and test it before use. Do not expose an unauthenticated administrative API to make an example work.

## Catalogue and rotation

- Both builders expect an enabled Jellyfin Shows library named `Kids Shows` in both instances and wait for `not_scanning` status.
- CN's `allowed` list matches normalized source titles. It expects exactly 23 source series, with valid episode durations. Duplicate remakes are grouped by source show ID. Changing this list also requires reviewing the expected count.
- Disney's `MAIN_SHOWS` lists 17 exact source titles, plus `Gravity Falls Shorts` and `Disney Sjov`. Every required series must exist. Dates in Sjov titles must be valid and unique. Test fixtures and their expected counts describe the original pool.
- Both languages must resolve the same Jellyfin external item IDs with equal durations. Copying a complete DK database over EN is not a translation mechanism.
- Production catalogue state is frozen. Do not delete state to make new files appear. A reviewed catalogue migration is not implemented.

## Exact-file audio exception

`install-disney.sh` now contains the example path `/data/Media/Kids/Shows/Darkwing Duck/Season 02/Darkwing Duck S02E10.mkv`. Replace it with the exact file visible inside your containers.

The original file had video 0, English audio 1, Danish audio 2 and a third audio track; all audio codecs were AAC. The installer validates that layout and creates each instance's `disney-audio.json`. Inspect actual file-level FFprobe output and identify languages by listening. Jellyfin metadata indices can differ from file indices.

The wrapper is tightly scoped to that file and selector layout. If your media does not need this exception, redesign and test the installer/builder expectation rather than blindly mapping another file's tracks. The preserved package does not offer a switch to disable it.

## Channel and EPG identity

The original Tunarr exports used `C1.49.tunarr.com` for CN and `C2.50.tunarr.com` for Disney in each instance. Verify your actual M3U/XMLTV output. The Python Disney script expects the latter ID and matching imported record metadata.

Keep Dispatcharr hashing at `TVG-ID` plus `M3U ID`; matching IDs in different source accounts are different streams. Map EPG data from the corresponding language source. Changing only the channel name cannot correct a stream selected from the wrong account.

## Local testing and publication

Run the supplied offline tests before and after adaptation. Use `--fixture fixtures` for an offline Disney-builder preview. Do not combine fixture/time overrides with apply. The CN builder expects a different full-catalogue fixture shape, which is not bundled; the Disney fixtures are not CN fixtures.

Inspect syntax for Node, Python and POSIX shell files. Then review real API previews and backups before any server writes. Passing offline tests establishes scheduler/audio behaviour, not compatibility with your current server.

No actual service credentials, runtime state, database backups or complete inventories belong in the public repository. `AI/` stays ignored. Review the final staged diff and artwork provenance before publication.
