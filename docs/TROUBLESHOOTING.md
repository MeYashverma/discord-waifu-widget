# Troubleshooting

---

## Quick table

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Missing required environment variables` | Secrets/env vars not set | Add `DISCORD_APP_ID`, `DISCORD_USER_ID`, `DISCORD_BOT_TOKEN` |
| Widget shows defaults | Field binding mismatch | Re-check [WIDGET_FIELDS.md](WIDGET_FIELDS.md) |
| Image missing | `image` field not Image/User Data | Set field type Image and Data Field `image` |
| AniList 403/disabled | AniList API issue | Script falls back to Jikan automatically |
| AniList and Jikan both fail | Upstream API outage/rate limit | Nekos.best image fallback keeps widget updating |
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

## Local dry run

Use:

```bash
DRY_RUN=true DISCORD_APP_ID=1 DISCORD_USER_ID=2 DISCORD_BOT_TOKEN=test npm start
```

This validates payload generation without touching Discord or memory.
