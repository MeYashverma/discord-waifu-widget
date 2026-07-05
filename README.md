# 🌸 Discord Waifu Widget

> **Automated Discord Dynamic Profile Widget that rotates a live anime/game character using AniList metadata, Jikan fallback data, GitHub Actions, and Discord's Dynamic Widget API.**

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="GitHub Actions" src="https://img.shields.io/badge/GitHub_Actions-automated-2088FF?style=for-the-badge&logo=github-actions&logoColor=white">
  <img alt="Discord" src="https://img.shields.io/badge/Discord-Dynamic_Widget-5865F2?style=for-the-badge&logo=discord&logoColor=white">
  <img alt="AniList" src="https://img.shields.io/badge/AniList-GraphQL-02A9FF?style=for-the-badge">
</p>

```text
No VPS              No paid APIs        No local machine
No frontend         No database         100% GitHub Actions automation
```

---

## What this project does

This repo updates a Discord profile widget with a rotating **Waifu of the Day**.

Each run:

1. Picks a real character from the upgraded `waifus_final.json` database.
2. Uses AniList, Jikan/MyAnimeList, and Kitsu to enrich details and find accurate artwork.
3. Falls back to verified local details when public APIs are unavailable.
4. Optionally removes image backgrounds with remove.bg, then uploads a transparent PNG to Discord CDN.
5. Generates widget stats like fanbase, vibe, rating, age, blood type, bio, and universe.
6. Sends one full Discord Dynamic Identity payload.
7. Saves the new memory file only after a successful Discord update.

---

## Features

- 🧾 Upgraded real-character waifu database for stable names/sources
- 🌐 AniList, Jikan, and Kitsu enrichment for images and metadata
- 🎲 Manual reroll through GitHub Actions `workflow_dispatch`
- 🧠 AniList metadata enrichment
- 🛟 Jikan/MyAnimeList fallback when AniList is down/rate-limited
- 🧾 Verified seed fallback for real character fields during full API outages
- 🖼 Nekos.best SFW artwork fallback only if no character art is found
- ✂️ Optional remove.bg background removal for transparent widget images
- 🔍 Cover/zoom image framing so characters appear large like the Genshin widget
- 🖼 Character artwork field
- 🧩 Discord-CDN image upload/fix for reliable widget rendering
- 🧾 Full Discord payload with `username` binding
- 🔐 GitHub Secrets for Discord credentials
- 🧪 Local `DRY_RUN=true` testing mode

---

## Documentation

| Document | Purpose |
| --- | --- |
| [Setup](docs/SETUP.md) | Discord app, widget fields, secrets |
| [Architecture](docs/ARCHITECTURE.md) | Runtime architecture and Mermaid diagrams |
| [API flow](docs/API_FLOW.md) | AniList, Jikan, Discord PATCH flow |
| [Widget fields](docs/WIDGET_FIELDS.md) | Exact Discord widget editor bindings |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common issues and fixes |
| [Credits](docs/CREDITS.md) | References and acknowledgements |

---

## Widget fields

Bind these Discord widget fields as **User Data**:

| Field | Type | Description |
| --- | --- | --- |
| `waifu` | Text | Character name |
| `source` | Text | Anime/game/source title |
| `fanbase` | Text | Formatted popularity estimate |
| `vibe` | Text | Generated vibe label |
| `rating` | Text | Popularity tier |
| `age` | Text | AniList age, when available |
| `blood` | Text | AniList blood type, when available |
| `bio` | Text | Parsed role/category |
| `description` | Text | Clean short description |
| `universe` | Text | Source category |
| `image` | Image | Character artwork |

Full guide: [docs/WIDGET_FIELDS.md](docs/WIDGET_FIELDS.md)

---

## Quick start

### 1. Fork / clone

```bash
git clone https://github.com/MeYashverma/Discord-waifu-widget.git
cd Discord-waifu-widget
npm install
cp .env.example .env
```

### 2. Add credentials

Local `.env` or GitHub repository secrets:

```text
DISCORD_APP_ID=
DISCORD_USER_ID=
DISCORD_BOT_TOKEN=
DISCORD_IMAGE_WEBHOOK_URL=   # recommended for image display
```

Optional:

```text
WIDGET_USERNAME=waifu-widget
REMOVE_BG_API_KEY=      # optional, best transparent cutouts
DISABLE_IMAGE_FALLBACK=false
DISABLE_IMAGE_FIX=false
DISABLE_REMOVE_BG=false
WIDGET_IMAGE_FIT=cover      # cover = large/cropped, contain = full image
WIDGET_IMAGE_ZOOM=1.18      # larger = more zoom/crop
DRY_RUN=false
```

### 3. Test locally

```bash
npm run check
DRY_RUN=true npm start
```

### 4. Run on GitHub Actions

Open:

```text
Actions → Update Discord Waifu Widget → Run workflow
```

Scheduled runs happen every 6 hours.

---

## High-level architecture

```mermaid
flowchart TD
    GHA[GitHub Actions trigger] --> APP[update.js]
    APP --> DB[waifus_final.json]
    APP --> MEM[last_character.json]
    DB --> PICK[Pick real character]
    PICK --> ANI[AniList lookup]
    PICK --> JIKAN[Jikan lookup]
    PICK --> KITSU[Kitsu lookup]
    ANI --> META[Metadata builder]
    JIKAN --> META
    KITSU --> META
    META --> PAYLOAD[Discord payload]
    PAYLOAD --> DISCORD[PATCH Discord widget]
    DISCORD --> SAVE[Save memory]
    SAVE --> COMMIT[Commit last_character.json]
```

---

## Example payload

```json
{
  "username": "waifu-widget",
  "data": {
    "dynamic": [
      { "type": 1, "name": "waifu", "value": "Makima" },
      { "type": 1, "name": "source", "value": "Chainsaw Man" },
      { "type": 1, "name": "fanbase", "value": "420.0K" },
      { "type": 1, "name": "vibe", "value": "ELEGANT" },
      { "type": 1, "name": "rating", "value": "LEGENDARY" },
      { "type": 1, "name": "bio", "value": "Hunter" },
      {
        "type": 3,
        "name": "image",
        "value": { "url": "https://..." }
      }
    ]
  }
}
```

---

## Notes

- This is a personal/fan automation project.
- Character names/sources come from `waifus_final.json` so fields stay real. Public APIs enrich the selected character with better images and metadata.
- AniList may sometimes disable or rate-limit its API; Jikan fallback keeps the widget useful.
- Discord Dynamic Profile Widgets are experimental and may change.

---

## Credits

See [docs/CREDITS.md](docs/CREDITS.md).

---

## License

MIT — see [LICENSE](LICENSE).
