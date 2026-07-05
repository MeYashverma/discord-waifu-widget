# Setup Guide

Follow these steps to connect the Discord Waifu Widget to your Discord profile widget.

---

## 1. Create Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a new application.
3. Copy **Application ID** → `DISCORD_APP_ID`.
4. Open **Bot → Add Bot**.
5. Copy/reset the bot token → `DISCORD_BOT_TOKEN`.

---

## 2. Create / configure Profile Widget

Discord Dynamic Profile Widgets are still experimental. Helpful references:

- [Chloe Cinders — Discord widgets](https://chloecinders.com/blog/discord-widgets)
- [aamiaa widget creation script](https://gist.github.com/aamiaa/7cdd590e3949cd654758bc90bcb4710b)

Create User Data fields listed in [WIDGET_FIELDS.md](WIDGET_FIELDS.md).

---

## 3. Get Discord user ID

Enable Developer Mode:

```text
Discord → User Settings → Advanced → Developer Mode
```

Right-click your profile → Copy User ID → `DISCORD_USER_ID`.

---

## 4. GitHub secrets

Open:

```text
Repository → Settings → Secrets and variables → Actions → Secrets
```

Add:

| Secret | Required | Description |
| --- | --- | --- |
| `DISCORD_APP_ID` | Yes | Discord application ID |
| `DISCORD_USER_ID` | Yes | Your Discord user ID |
| `DISCORD_BOT_TOKEN` | Yes | Bot token |
| `DISCORD_IMAGE_WEBHOOK_URL` | Recommended | Webhook used to upload processed images to Discord CDN |
| `REMOVE_BG_API_KEY` | Optional | remove.bg API key for high-quality transparent images |
| `DISCORD_TARGET_CHANNEL_ID` | Optional | Bot channel-upload fallback for images |

Optional repository variables:

| Variable | Default | Description |
| --- | --- | --- |
| `WIDGET_USERNAME` | `waifu-widget` | Root payload username for Discord binding |
| `DISABLE_IMAGE_FALLBACK` | `false` | Disable Nekos.best emergency artwork fallback |
| `DISABLE_IMAGE_FIX` | `false` | Disable image processing/upload to Discord CDN |
| `DISABLE_REMOVE_BG` | `false` | Skip remove.bg even when API key exists |
| `WIDGET_IMAGE_FIT` | `cover` | `cover` for large cropped portraits, `contain` for full image |
| `WIDGET_IMAGE_ZOOM` | `1.18` | Portrait zoom when `WIDGET_IMAGE_FIT=cover` |

---

## 5. Run workflow

Open:

```text
Actions → Update Discord Waifu Widget → Run workflow
```

Scheduled rotation runs every 6 hours.

---

## 6. Local testing

```bash
npm install
cp .env.example .env
# fill .env
npm run check
DRY_RUN=true npm start
```

`DRY_RUN=true` prints the payload and does not PATCH Discord or save memory.

---

## 7. Expected healthy logs

```text
Starting Discord Waifu Widget update...
Source mode: auto
Image fallback: enabled
Picked: Makima (Chainsaw Man)
Discord widget updated: 204
Saved character memory.
Done.
```

If AniList is unavailable, this is still okay:

```text
AniList page 1 failed (403).
```

The script will try Jikan fallback next.
