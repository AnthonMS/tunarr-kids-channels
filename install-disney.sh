#!/bin/sh
# Public reference guard. Remove these two commands after adaptation.
printf '%s\n' 'Reference copy: adapt addresses, channel IDs, catalogue and database mappings, then remove this guard before deployment.' >&2
exit 1
# Owner-run on Unraid: default preview installs helper/assets only, no application changes.
# After reviewing preview: sh /mnt/user/downloads/install-disney.sh apply
set -eu
mode=${1:-preview}
case "$mode" in preview|apply) ;; *) echo 'Use preview or apply'; exit 1 ;; esac
stage=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mkdir -p /mnt/user/appdata/scripts/state /mnt/user/appdata/scripts/logs
exec 9>/mnt/user/appdata/scripts/state/tunarr-disney.lock
flock -n 9 || { echo 'Disney maintenance is already running'; exit 1; }
for file in disney-schedule.mjs rebuild-disney.mjs disney-audio.cjs ffmpeg-disney.sh \
  tunarr-disney-maintain.sh disney-channel-da-v3.png disney-channel-en-v3.png; do
  test -r "$stage/$file" || { echo "Missing staged file: $file"; exit 1; }
done
test "$(cat /sys/class/drm/renderD128/device/vendor)" = 0x8086
for container in Tunarr-DK Tunarr-EN; do
  docker exec "$container" sh -c 'test -r /dev/dri/renderD128 && test -w /dev/dri/renderD128'
done

media='/data/Media/Kids/Shows/Darkwing Duck/Season 02/Darkwing Duck S02E10.mkv'
probe=$(docker exec Tunarr-DK /usr/bin/ffprobe -v error \
  -show_entries stream=index,codec_type,codec_name -of json "$media")
printf '%s' "$probe" | jq -e '
  [.streams[] | select(.codec_type=="video") | .index] == [0] and
  [.streams[] | select(.codec_type=="audio") | .index] == [1,2,3] and
  all(.streams[] | select(.codec_type=="audio"); .codec_name=="aac")
' >/dev/null || { echo 'Darkwing source streams changed; inspect before enabling overrides.'; exit 1; }

for language in da en; do
  case "$language" in da) instance=dk; container=Tunarr-DK; audio=2 ;; en) instance=en; container=Tunarr-EN; audio=1 ;; esac
  config="/mnt/user/appdata/tunarr-$instance/config"
  test -d "$config"
  mkdir -p "$config/images/uploads"
  install -m 0644 "$stage/disney-channel-$language-v3.png" "$config/images/uploads/"
  install -m 0644 "$stage/disney-audio.cjs" "$config/disney-audio.cjs"
  install -m 0755 "$stage/ffmpeg-disney.sh" "$config/ffmpeg-disney.sh"
  jq -n --arg language "$language" --arg path "$media" --argjson audio "$audio" \
    '{version:1,language:$language,path:$path,videoIndex:0,audioIndex:$audio}' > "$config/disney-audio.json.new"
  chmod 0644 "$config/disney-audio.json.new"
  mv -f "$config/disney-audio.json.new" "$config/disney-audio.json"
  docker exec "$container" /config/tunarr/ffmpeg-disney.sh -version >/dev/null
  # Exercise the actual wrapper and hardware/audio filter graph, without media outputs.
  docker exec "$container" /config/tunarr/ffmpeg-disney.sh \
    -nostdin -hide_banner -loglevel error \
    -hwaccel vaapi -hwaccel_device /dev/dri/renderD128 -hwaccel_output_format vaapi \
    -ss 60 -i "$media" -t 3 \
    -filter_complex '[0:0]scale_vaapi=w=1920:h=1080:format=nv12[v];[0:1]aresample=async=1,apad[a]' \
    -map '[v]' -map '[a]' -c:v h264_vaapi -b:v 2000k -c:a aac -b:a 192k -f null -
  echo "$language: playback helper tested, actual video stream 0 and audio stream $audio."
done
target=/mnt/user/appdata/tunarr-dk/config/disney
mkdir -p "$target"
install -m 0644 "$stage/disney-schedule.mjs" "$target/disney-schedule.mjs"
install -m 0644 "$stage/rebuild-disney.mjs" "$target/rebuild-disney.mjs"

if [ "$mode" = preview ]; then
  docker exec Tunarr-DK node /config/tunarr/disney/rebuild-disney.mjs
  echo 'Helper/assets installed. No channels, playback settings or cron entries changed.'
  exit 0
fi

docker exec Tunarr-DK node /config/tunarr/disney/rebuild-disney.mjs --apply
install -m 0755 "$stage/tunarr-disney-maintain.sh" /mnt/user/appdata/scripts/tunarr-disney-maintain.sh
cron=/boot/config/plugins/dynamix/tunarr-disney.cron
test -d /boot/config/plugins/dynamix
command -v update_cron >/dev/null
printf '%s\n' '# Extend the paired Disney schedule before its 12-week horizon expires.' \
  '17 4 * * * /bin/sh /mnt/user/appdata/scripts/tunarr-disney-maintain.sh >>/mnt/user/appdata/scripts/logs/tunarr-disney-maintain.log 2>&1' > "$cron.new"
mv -f "$cron.new" "$cron"
update_cron
grep -F '/mnt/user/appdata/scripts/tunarr-disney-maintain.sh' /etc/cron.d/root
echo 'Persistent daily schedule maintenance installed. Dispatcharr and Jellyfin import are next.'
