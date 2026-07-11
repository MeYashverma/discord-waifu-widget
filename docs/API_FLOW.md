# API Flow

The widget uses a hybrid approach: a local verified character database provides stable names/sources, while public APIs enrich the selected character with artwork and metadata.

```mermaid
sequenceDiagram
    autonumber
    participant App as update.js
    participant DB as waifus_final.json
    participant AniList as AniList GraphQL
    participant Jikan as Jikan REST
    participant Kitsu as Kitsu REST
    participant RemoveBG as remove.bg API
    participant DiscordCDN as Discord upload
    participant Discord as Discord Widget API

    App->>DB: pick real character, avoid recent IDs
    par metadata lookups
        App->>AniList: Character(search: name)
        App->>Jikan: /v4/characters?q=name and /full
        App->>Kitsu: /characters?filter[name]=name
    end
    App->>App: merge DB + API data
    App->>RemoveBG: optional background removal
    alt remove.bg succeeded
        RemoveBG-->>App: transparent cutout (trusted as-is)
    else remove.bg not configured or failed
        App->>App: local border/color heuristic cleanup
    end
    App->>App: resize/crop to widget frame
    App->>DiscordCDN: upload processed PNG
    DiscordCDN-->>App: cdn.discordapp.com URL
    App->>Discord: PATCH full Dynamic Identity payload
    Discord-->>App: 204 or 2xx
```

## Source priority

| Data | Priority |
| --- | --- |
| Character name/source/universe | `waifus_final.json` |
| Bio/description | verified seed details → AniList/Jikan/Kitsu text → generated fallback |
| Image | database image → AniList → Jikan → Kitsu → Nekos.best fallback |
| Background removal | remove.bg when `REMOVE_BG_API_KEY` exists and the call succeeds (its cutout is trusted as-is); local border/color heuristic only runs as a fallback when remove.bg is not configured or fails |

## Discord PATCH

```http
PATCH https://discord.com/api/v9/applications/{DISCORD_APP_ID}/users/{DISCORD_USER_ID}/identities/0/profile
Authorization: Bot {DISCORD_BOT_TOKEN}
Content-Type: application/json
```

The payload includes the root `username` plus all dynamic fields in a single PATCH.
