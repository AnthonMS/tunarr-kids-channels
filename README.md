# Bilingual kids channels with Tunarr, Dispatcharr and Jellyfin

Reference scripts for my Unraid setup, completed on 7 November 2026:

- Cartoon Network DA and EN, playing matching episodes at matching times.
- Disney Channel DA and EN, including Disney Sjov every Friday at 19:00 in Europe/Copenhagen.
- Intel VAAPI transcoding, source-specific Dispatcharr mappings and one combined Jellyfin Live TV guide.

Jellyfin provides the catalogue, Tunarr reads shared media and creates the channels, Dispatcharr combines the M3U/XMLTV outputs, and Jellyfin plays them. Both language variants use one copy of the media.

## Status

This repository contains the reference scripts for the bilingual four-channel guide approved for publication on mlgaard.dk.

The scripts were extracted from a working installation. Addresses, channel UUIDs and the exact exceptional media path have been replaced with examples. Algorithms and fixtures are retained. The extracted package has not been deployed to the server.

These are installation-specific reference scripts. They expect an existing catalogue, CN channels, container names, Unraid paths and matching Dispatcharr records. They are not a general-purpose installer.

Server-operation entry points have an explicit reference guard that stops execution. Review [CONFIGURATION.md](CONFIGURATION.md), adapt every relevant value, and only then remove the guard in each script you intend to use. Pure scheduler/audio tests remain runnable without removing guards.

Tested original versions: Tunarr 1.3.13 and Jellyfin 10.11.11. An exact Dispatcharr release was not recorded. The Python operations validate parts of the installed model/task interface, but that is not a guarantee of compatibility with another release. Pin your actual container version or digest if you need reproducibility. The original `latest` tag was mutable.

The two-instance design reflects the global audio preferences in that tested Tunarr setup. Current Tunarr documentation describes stream-selection profiles. Check the version before assuming two instances are required for every newer installation.

## Files

| File | Job | Installed destination in the example layout |
|---|---|---|
| `rebuild-cn.mjs` | Preview/replace an existing CN pair and verify identities/timing | DK `/config/tunarr/rebuild-cn.mjs` |
| `disney-schedule.mjs` | Pure calendar, rotation and paired-lineup logic | DK `/config/tunarr/disney/` |
| `rebuild-disney.mjs` | Preview/create/extend Disney, recovery journal and rollback | DK `/config/tunarr/disney/` |
| `disney-audio.cjs` | Exact-file FFmpeg selector rewrite | Both `/config/tunarr/` |
| `ffmpeg-disney.sh` | Launch the helper and exec real FFmpeg | Both `/config/tunarr/` |
| `tunarr-disney-maintain.sh` | Locked host maintenance runner | `/mnt/user/appdata/scripts/` |
| `install-cn-logos.sh` | Stage/install selected CN icons and update metadata | One-time host operation |
| `enable-tunarr-vaapi.sh` | Back up/update existing Intel profiles, then restart Tunarr | One-time host operation |
| `install-disney.sh` | Stage helpers, smoke-test hardware/audio, create schedule and install cron | One-time host operation |
| `update-dispatcharr-cn.py` | Update the existing CN pair and queue native refresh jobs | Dispatcharr Django shell |
| `create-dispatcharr-disney.py` | Validate source-specific Disney mappings and create channels transactionally | Dispatcharr Django shell |
| `disney-schedule.test.mjs`, `disney-audio.test.cjs` | Offline calendar and audio tests | PC |
| `fixtures/` | Minimal inventory with anonymous IDs | Test input only |
| `logos/` | Selected icons, generators and source art | Stage selected PNGs with installers |

The host config mount is `/mnt/user/appdata/tunarr-{dk,en}/config` to `/config/tunarr` in each container. DK hosts the builder/state, but each instance retains its own database, audio helper and assets.

## Run offline tests

Use Node with `fetch`, `structuredClone`, `AbortSignal.timeout` and `Intl` timezone support. The runtime scripts have no npm dependencies.

```sh
node disney-schedule.test.mjs fixtures
node disney-audio.test.cjs
```

The audio test invokes Git Bash at `C:/Program Files/Git/usr/bin/bash.exe` on Windows, or `/bin/sh` on Unix. `node` must be on that shell's PATH.

The fixture catalogue has 1,116 entries with anonymous identifiers, no media or service credentials. The fixed test start generates 5,648 initial positions. The original live start generated 5,655; the gap before Friday changes padding and the count.

## Deployment order after adaptation

1. Back up both Tunarr configs and the Dispatcharr database. Verify the typed Jellyfin library, path replacement and completed scans.
2. Create the initial CN channels in Tunarr, inspect IDs and update the reference scripts. Review their catalogue expectations.
3. Stage the adapted scripts and selected PNGs in `/mnt/user/downloads`. Flatten the selected `logos/` paths into that staging folder.
4. Run the CN builder without `--apply`. Review its output before applying. Install the CN icons.
5. Add Device `/dev/dri` to both persistent Unraid Docker templates. Identify the Intel render node and check real hardware throughput. Run the adapted VAAPI updater.
6. Run the Disney installer preview, inspect hardware/audio tests and the proposed calendar, then apply after reviewing the changes.
7. Import both Tunarr sources in Dispatcharr. Set hashing to `TVG-ID` plus `M3U ID`, inspect actual database IDs and map each language to its matching source/EPG.
8. Verify Dispatcharr M3U/XMLTV exports, refresh Jellyfin's existing guide and play all four channels.
9. Monitor the installed cron, log and schedule end date. Preserve generated state and the update journal when troubleshooting.

Detailed commands and their effects are in [OPERATIONS.md](OPERATIONS.md). Adaptation points are in [CONFIGURATION.md](CONFIGURATION.md).

## Preview and write behaviour

- CN builder without `--apply`: read-only preview. Apply replaces programming and resets the shared start minute.
- Disney builder without flags: read-only preview. `--apply` creates or extends using persisted state. `--maintain` needs existing state or a recovery journal and may append.
- Disney installer `preview`: writes helper files, audio configuration and logos, runs smoke tests and installs builder files. It does not change application settings, programming or cron. It is not read-only.
- Disney installer `apply`: enables the helper, creates/verifies the pair and installs persistent daily maintenance.
- Dispatcharr scripts: database writes and native queued refreshes. Their mapping snapshots are not full database backups.

Do not use the historical `tunarr-sync.sh` on Disney. It drops flex entries and would discard the Friday padding. It is deliberately omitted from this package, as are historical media-relocation and temporary inspection tools.

## Evidence and limits

The original installation's CN pair had 21,436 verified positions; Disney had 5,655 including 12 flex breaks. The owner confirmed playback and intended languages on all four channels. Local tests cover calendar/DST, archive wrap, ordered rotation, append continuity and exact-file audio selection.

At completion, the first live Friday appointment and a cron-triggered horizon extension had not occurred. All fallbacks, prolonged simultaneous-viewer load and Disney flag artwork in the client had not all been observed. The Intel video-only benchmark does not establish a concurrent channel capacity.

The Disney catalogue is frozen in `state.json`; new downloads do not enter automatically. There is no supported catalogue-migration flag or history pruning. When maintenance stops, the finite lineup eventually repeats and the Friday calendar drifts.

## Artwork and licence

See [logos/ATTRIBUTION.md](logos/ATTRIBUTION.md) for retained source names and generator requirements. Logos are third-party marks used to label personal custom channels. No affiliation is claimed.

Original scripts, tests, anonymized fixtures and documentation use the [MIT licence](LICENSE). Raster artwork is excluded. See [NOTICE.md](NOTICE.md) for the scope and third-party exclusions.
