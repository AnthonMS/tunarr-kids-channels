#!/bin/sh
# Every argument is single-quoted by disney-audio.cjs, including embedded quotes.
# exec keeps the real FFmpeg as Tunarr's child, with no orphan encoder processes.
set -eu
prepared=$(node /config/tunarr/disney-audio.cjs "$@")
eval "set -- $prepared"
exec /usr/bin/ffmpeg "$@"
