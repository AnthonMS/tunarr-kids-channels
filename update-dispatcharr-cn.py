# Public reference guard. Remove only after reviewing the PLAN and installed models.
raise SystemExit("Reference copy: adapt addresses, channel IDs, catalogue and database mappings, then remove this guard before deployment.")
"""Owner-run through Dispatcharr manage.py shell; update the existing CN pair."""

import inspect
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

from django.db import transaction
from apps.channels.models import Channel, Logo
from apps.m3u.models import M3UAccount
from apps.epg.models import EPGSource
from apps.m3u.tasks import refresh_single_m3u_account
from apps.epg.tasks import refresh_epg_data


PLAN = [
    (1, 17, 2, 1, 7, 8104, "DA"),
    (2, 2, 3, 2, 8, 8105, "EN"),
]

# Fail before writing if this installed version uses different task signatures.
inspect.signature(refresh_single_m3u_account.run).bind(2)
inspect.signature(refresh_epg_data.run).bind(1, force=True)
Logo._meta.get_field("url")
Logo._meta.get_field("name")

with transaction.atomic():
    records = []
    backup = []
    for cid, sid, aid, eid, number, port, language in PLAN:
        channel = Channel.objects.select_for_update().get(pk=cid)
        stream = channel.streams.select_for_update().get(pk=sid)
        expected_account = "Tunarr-DK" if language == "DA" else "Tunarr-EN"
        if not (
            list(channel.streams.values_list("pk", flat=True)) == [sid]
            and channel.channel_number == number
            and channel.epg_data_id == eid
            and stream.m3u_account_id == aid
            and urlsplit(stream.url).port == port
            and channel.name in ("Cartoon Network DK", "Cartoon Network " + language)
            and M3UAccount.objects.get(pk=aid).name == expected_account
            and EPGSource.objects.get(pk=eid).name == expected_account + "-EPG"
        ):
            raise RuntimeError("Unexpected mapping for channel %s; no updates applied" % cid)
        backup.append({
            "channel_id": cid, "name": channel.name,
            "channel_number": str(channel.channel_number),
            "logo_id": channel.logo_id, "epg_data_id": eid,
            "stream_id": sid, "stream_name": stream.name,
            "stream_logo_url": stream.logo_url, "m3u_account_id": aid,
        })
        stream._meta.get_field("logo_url")
        records.append((channel, stream, port, language))

    folder = Path("/data/backups")
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = folder / ("cn-channel-icons-%s-%s.json" % (stamp, uuid4().hex[:8]))
    with backup_path.open("x", encoding="utf-8") as handle:
        json.dump(backup, handle, indent=2)
        handle.write("\n")
    print("Previous CN settings:", backup_path)

    for channel, stream, port, language in records:
        name = "Cartoon Network " + language
        url = "http://192.0.2.10:%s/images/uploads/cartoon-network-%s-v2-white.png" % (
            port, language.lower()
        )
        logo, _ = Logo.objects.get_or_create(url=url, defaults={"name": name})
        channel.name = name
        channel.logo = logo
        channel.save(update_fields=["name", "logo"])
        stream.name = name
        stream.logo_url = url
        stream.save(update_fields=["name", "logo_url"])

for cid, sid, aid, eid, number, port, language in PLAN:
    channel = Channel.objects.select_related("logo").get(pk=cid)
    print(json.dumps({
        "id": cid, "name": channel.name, "number": str(channel.channel_number),
        "logo_id": channel.logo_id, "logo_url": channel.logo.url,
        "epg_data_id": channel.epg_data_id,
        "stream_ids": list(channel.streams.values_list("pk", flat=True)),
    }, indent=2))

# Use the installed native refresh jobs so normal parsing and cache handling run.
for account_id in (2, 3):
    task = refresh_single_m3u_account.delay(account_id)
    print("M3U refresh queued:", account_id, task.id)
for source_id in (1, 2):
    task = refresh_epg_data.delay(source_id, force=True)
    print("EPG refresh queued:", source_id, task.id)

print("CN names/logos saved. Refresh jobs queued; guide verification is next.")
