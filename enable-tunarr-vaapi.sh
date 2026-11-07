#!/bin/sh
# Public reference guard. Remove these two commands after adaptation.
printf '%s\n' 'Reference copy: adapt addresses, channel IDs, catalogue and database mappings, then remove this guard before deployment.' >&2
exit 1
# Owner-run on Unraid after adding /dev/dri to both saved Docker templates.
set -eu

device=/dev/dri/renderD128
test "$(cat /sys/class/drm/renderD128/device/vendor)" = 0x8086
for container in Tunarr-DK Tunarr-EN; do
  docker exec "$container" sh -c 'test -r /dev/dri/renderD128 && test -w /dev/dri/renderD128' || {
    echo "$container cannot access the Intel render device; no settings changed."
    exit 1
  }
done

backup=$(mktemp -d /mnt/user/appdata/tunarr-dk/config/backups/vaapi-XXXXXXXX)
echo "Previous transcode settings: $backup"

# Read and prepare both complete profiles before changing either instance.
for port in 8104 8105; do
  case "$port" in
    8104) channel=00000000-0000-4000-8000-000000000001 ;;
    8105) channel=00000000-0000-4000-8000-000000000002 ;;
  esac
  base="http://127.0.0.1:$port/api"
  curl -fsS --max-time 30 "$base/channels/$channel" > "$backup/channel-$port.json"
  id=$(jq -er '.transcodeConfigId | select(type == "string" and length == 36)' "$backup/channel-$port.json")
  printf '%s\n' "$id" > "$backup/profile-id-$port.txt"
  curl -fsS --max-time 30 "$base/transcode_configs/$id" > "$backup/profile-$port.json"
  jq -e --arg id "$id" '.id == $id and .videoFormat == "h264"' "$backup/profile-$port.json" >/dev/null
  jq --arg device "$device" '
    .hardwareAccelerationMode = "vaapi" |
    .vaapiDriver = "system" |
    .vaapiDevice = $device
  ' "$backup/profile-$port.json" > "$backup/new-profile-$port.json"
done

touched=""
rollback() {
  echo "Profile update failed; restoring previous settings."
  for prior in $touched; do
    id=$(cat "$backup/profile-id-$prior.txt")
    if curl -fsS --max-time 30 -X PUT -H 'Content-Type: application/json' \
      --data-binary "@$backup/profile-$prior.json" \
      "http://127.0.0.1:$prior/api/transcode_configs/$id" >/dev/null; then
      echo "Port $prior: previous profile restored."
    else
      echo "RESTORE FAILED on port $prior. Keep backup: $backup"
    fi
  done
  exit 1
}

for port in 8104 8105; do
  id=$(cat "$backup/profile-id-$port.txt")
  touched="$touched $port"
  if ! curl -fsS --max-time 30 -X PUT -H 'Content-Type: application/json' \
    --data-binary "@$backup/new-profile-$port.json" \
    "http://127.0.0.1:$port/api/transcode_configs/$id" >/dev/null; then
    rollback
  fi
  if ! curl -fsS --max-time 30 "http://127.0.0.1:$port/api/transcode_configs/$id" > "$backup/saved-profile-$port.json"; then
    rollback
  fi
  if ! diff -q \
    "$backup/new-profile-$port.json" "$backup/saved-profile-$port.json" >/dev/null; then
    # Compare JSON structure, allowing API serialization differences and key order.
    if ! jq -e -s '.[0] == .[1]' \
      "$backup/new-profile-$port.json" "$backup/saved-profile-$port.json" >/dev/null; then
      rollback
    fi
  fi
  echo "Port $port: Intel VAAPI saved and verified ($device)."
done

echo "Restarting Tunarr-DK and Tunarr-EN to start fresh encoding sessions."
docker restart Tunarr-DK Tunarr-EN
echo "Hardware encoding configured. Reopen each CN channel in Jellyfin and test playback."
