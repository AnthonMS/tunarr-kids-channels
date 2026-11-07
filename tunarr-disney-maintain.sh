#!/bin/sh
# Public reference guard. Remove these two commands after adaptation.
printf '%s\n' 'Reference copy: adapt addresses, channel IDs, catalogue and database mappings, then remove this guard before deployment.' >&2
exit 1
# Persistent Unraid host entry point. Calendar calculations happen in Europe/Copenhagen.
set -eu
mkdir -p /mnt/user/appdata/scripts/state
exec 9>/mnt/user/appdata/scripts/state/tunarr-disney.lock
flock -n 9 || exit 0
docker exec Tunarr-DK node /config/tunarr/disney/rebuild-disney.mjs --maintain
