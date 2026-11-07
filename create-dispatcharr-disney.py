# Public reference guard. Remove only after reviewing the PLAN and installed models.
raise SystemExit("Reference copy: adapt addresses, channel IDs, catalogue and database mappings, then remove this guard before deployment.")
"""Owner-run via Dispatcharr manage.py shell. Create only the verified Disney pair."""
import inspect
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

from django.apps import apps
from django.db import transaction
from apps.channels.models import Channel, ChannelProfileMembership, Logo, Stream
from apps.epg.models import EPGData, EPGSource
from apps.epg.tasks import parse_programs_for_tvg_id
from apps.m3u.models import M3UAccount
from apps.m3u.tasks import refresh_single_m3u_account


# language, guide number, imported stream, account, EPG record, EPG source, port, CN template
PLAN = [
    ("DA", 9, 18, 2, 7, 1, 8104, 1),
    ("EN", 10, 19, 3, 8, 2, 8105, 2),
]
TVG_ID = "C2.50.tunarr.com"
FIELDS = ["id", "name", "channel_number", "logo_id", "epg_data_id",
          "channel_group_id", "stream_profile_id", "tvg_id", "user_level"]

inspect.signature(parse_programs_for_tvg_id.run).bind(7)
inspect.signature(refresh_single_m3u_account.run).bind(2)
for model, fields in (
    (Channel, FIELDS),
    (ChannelProfileMembership, ("channel", "channel_profile", "enabled")),
    (Logo, ("url", "name")),
):
    for field in fields:
        model._meta.get_field(field)


def snapshot(channels):
    return [dict(row, stream_ids=list(
        Channel.objects.get(pk=row["id"]).streams.order_by("pk").values_list("pk", flat=True)
    )) for row in channels.order_by("pk").values(*FIELDS)]


with transaction.atomic():
    list(Channel.objects.select_for_update().all())
    prepared = []
    for language, number, sid, aid, eid, source_id, port, template_id in PLAN:
        name = "Disney Channel " + language
        stream = Stream.objects.select_for_update().get(pk=sid)
        epg = EPGData.objects.get(pk=eid)
        template = Channel.objects.get(pk=template_id)
        logo_url = "http://192.0.2.10:%s/images/uploads/disney-channel-%s-v3.png" % (port, language.lower())
        account_name = "Tunarr-DK" if language == "DA" else "Tunarr-EN"
        if not (
            stream.name == name and stream.m3u_account_id == aid
            and stream.tvg_id == TVG_ID and urlsplit(stream.url).port == port
            and stream.logo_url == logo_url and epg.tvg_id == TVG_ID
            and epg.epg_source_id == source_id
            and M3UAccount.objects.get(pk=aid).name == account_name
            and EPGSource.objects.get(pk=source_id).name == account_name + "-EPG"
            and template.name == "Cartoon Network " + language
        ):
            raise RuntimeError("Unexpected %s source mapping; no channels created" % language)
        candidates = list(Channel.objects.filter(name=name))
        if len(candidates) > 1:
            raise RuntimeError("Multiple channels named %s; inspect before changing" % name)
        existing = candidates[0] if candidates else None
        if existing and not (
            existing.channel_number == number and existing.epg_data_id == eid
            and list(existing.streams.values_list("pk", flat=True)) == [sid]
        ):
            raise RuntimeError("Existing %s has different mappings; inspect first" % name)
        occupied = Channel.objects.filter(channel_number=number)
        if existing:
            occupied = occupied.exclude(pk=existing.pk)
        if occupied.exists():
            raise RuntimeError("Guide number %s is already occupied" % number)
        # Newer Dispatcharr versions can reserve a number through an override too.
        try:
            override_model = apps.get_model("channels", "ChannelOverride")
        except LookupError:
            override_model = None
        if override_model is not None:
            reserved = override_model.objects.filter(channel_number=number)
            if existing:
                reserved = reserved.exclude(channel_id=existing.pk)
            if reserved.exists():
                raise RuntimeError("Guide number %s is reserved by an override" % number)
        prepared.append((language, number, stream, epg, template, logo_url, existing))

    protected = Channel.objects.exclude(name__in=["Disney Channel DA", "Disney Channel EN"])
    before = snapshot(protected)
    original = snapshot(Channel.objects.all())
    folder = Path("/data/backups")
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = folder / ("disney-channels-%s-%s.json" % (stamp, uuid4().hex[:8]))
    with backup_path.open("x", encoding="utf-8") as handle:
        json.dump({"channels_before": original, "planned_numbers": {"DA": 9, "EN": 10}}, handle, indent=2, default=str)
        handle.write("\n")
    print("Previous channel mappings:", backup_path)

    saved = []
    for language, number, stream, epg, template, logo_url, existing in prepared:
        name = "Disney Channel " + language
        logo, _ = Logo.objects.get_or_create(url=logo_url, defaults={"name": name})
        if existing:
            if existing.logo_id != logo.pk:
                existing.logo = logo
                existing.save(update_fields=["logo"])
            channel = existing
        else:
            channel = Channel.objects.create(
                name=name, channel_number=number, logo=logo, epg_data=epg,
                tvg_id=TVG_ID, channel_group_id=template.channel_group_id,
                stream_profile_id=template.stream_profile_id, user_level=template.user_level,
            )
            channel.streams.add(stream)
            for membership in ChannelProfileMembership.objects.filter(channel_id=template.pk):
                ChannelProfileMembership.objects.get_or_create(
                    channel=channel, channel_profile_id=membership.channel_profile_id,
                    defaults={"enabled": membership.enabled},
                )
        channel.refresh_from_db()
        if not (
            channel.name == name and channel.channel_number == number
            and channel.epg_data_id == epg.pk and channel.logo_id == logo.pk
            and list(channel.streams.values_list("pk", flat=True)) == [stream.pk]
        ):
            raise RuntimeError("%s failed saved mapping verification" % name)
        saved.append(channel.pk)
    if before != snapshot(protected):
        raise RuntimeError("Protected channel mappings changed; transaction rolled back")

for channel in Channel.objects.filter(pk__in=saved).order_by("channel_number"):
    print(json.dumps({
        "id": channel.pk, "name": channel.name, "number": channel.channel_number,
        "logo_id": channel.logo_id, "logo_url": channel.logo.url,
        "epg_data_id": channel.epg_data_id,
        "stream_ids": list(channel.streams.values_list("pk", flat=True)),
        "stream_profile_id": channel.stream_profile_id,
    }, indent=2))

# Queue after commit so programme imports can see the new channel assignments.
for epg_id in (7, 8):
    job = parse_programs_for_tvg_id.delay(epg_id)
    print("EPG programme import queued:", epg_id, job.id)
for account_id in (2, 3):
    job = refresh_single_m3u_account.delay(account_id)
    print("M3U refresh/cache update queued:", account_id, job.id)
print("Disney DA #9 and EN #10 saved. Jellyfin guide refresh is next after export verification.")
