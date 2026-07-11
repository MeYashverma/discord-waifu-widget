# Troubleshooting

---

## Quick table

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Missing required environment variables` | Secrets/env vars not set | Add `DISCORD_APP_ID`, `DISCORD_USER_ID`, `DISCORD_BOT_TOKEN` |
| Widget shows defaults | Field binding mismatch | Re-check [WIDGET_FIELDS.md](WIDGET_FIELDS.md) |
| Image missing | Field mismatch or remote image blocked | Set field type Image/Data Field `image`, and set `DISCORD_IMAGE_WEBHOOK_URL` so images are uploaded to Discord CDN |
| Image too small / not cropped | Fit mode is contain or zoom too low | Use `WIDGET_IMAGE_FIT=cover` and increase `WIDGET_IMAGE_ZOOM` |
| Background not transparent | remove.bg missing/failed, or the source art has no hard edge between subject and background | Add a valid `REMOVE_BG_API_KEY`. If remove.bg ran and there's still a faint edge/fringe, see "Faint background fringe after remove.bg" below — this is a real limitation on some source images, not always a config issue |
| AniList 403/disabled | AniList API issue | Script falls back to Jikan automatically |
| AniList and Jikan both fail | Upstream API outage/rate limit | Verified seed fallback keeps fields real; Nekos.best can provide artwork |
| Memory advances on failed update | Old script behavior | Updated script saves memory only after Discord success |
| Workflow cannot push memory | Permissions/token issue | Ensure workflow has `permissions: contents: write` |
| `npm ci` fails | Missing/outdated lockfile | Run `npm install --package-lock-only` and commit lockfile |

---

## AniList is unavailable

AniList sometimes disables or rate-limits its API. The script logs a warning and tries Jikan fallback:

```text
AniList page 1 failed (403).
```

This is not fatal. If Jikan also fails, the widget still uses generated metadata and a fallback image.

---

## Discord PATCH 401 / 403

Check:

- `DISCORD_BOT_TOKEN` is current.
- `DISCORD_APP_ID` belongs to the same application as the bot token.
- `DISCORD_USER_ID` is your user ID, not the bot ID.
- Your widget/application is correctly authorized for profile widget updates.

---

## Widget updated but no visual change

Discord widget data field names are exact and case-sensitive. Verify:

```text
waifu
source
fanbase
vibe
rating
age
blood
bio
description
universe
image
```

All must be User Data fields.

---

## Manual reroll did not commit memory

The workflow commits `last_character.json` only if it changed and only after the script succeeds.

If no commit appears:

- The picked character may already be in recent memory, so no new memory write was needed.
- The Discord update failed.
- `last_character.json` did not change.

---

## Faint background fringe after remove.bg

`processImage()` now trusts remove.bg's own cutout when remove.bg succeeds, instead
of re-running the local `removeBorderBackground()` heuristic on top of it. That
heuristic was written for the no-`REMOVE_BG_API_KEY` fallback case (a coarse
bright/white or low-saturation border flood-fill) — applying it a second time on
already-AI-segmented art couldn't reliably improve remove.bg's own edges, and on
some characters it made things worse by clipping legitimate low-saturation/shadowed
pixels that were still part of the character (e.g. gray hair shadows or dark
clothing got misread as background).

If you still see a faint gray/white fringe on a specific character even with
`REMOVE_BG_API_KEY` set and working (check for `Background removed with remove.bg
API.` in the log), that means remove.bg itself left a soft edge on that particular
source image — usually because the source art has a decorative background element
(a pattern, gradient, or prop) directly touching the character with no hard edge,
which is a genuine limit of automated background removal, not something this
script's post-processing can fully correct without risking damage to other, cleaner
images. There is intentionally no automated "detect a bad cutout" check here: pixel
statistics (alpha ambiguity ratio, gray-blob size, edge-touching regions, confident-
core ratio) were all tested against real before/after images and none reliably
separated a genuinely bad cutout from a character with naturally soft/hairy edges —
a real fix would need actual image understanding (a vision-model call), not a pixel
heuristic. If a specific character's art consistently produces a bad cutout, the
most reliable fix is swapping that entry's `image` field in `waifus_seed.json` (or
`waifus_final.json`) for a cleaner source image.

---

## Local dry run

Use:

```bash
DRY_RUN=true DISCORD_APP_ID=1 DISCORD_USER_ID=2 DISCORD_BOT_TOKEN=test npm start
```

This validates payload generation without touching Discord or memory.
