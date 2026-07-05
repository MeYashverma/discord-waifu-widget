# Architecture

This document explains the runtime design of the Discord Waifu Widget after removing the stale custom character database.

---

## Runtime overview

```mermaid
flowchart TB
    subgraph GitHub[GitHub Actions]
        TRIGGER[workflow_dispatch or cron]
        RUNNER[ubuntu-latest runner]
        INSTALL[npm ci]
        CHECK[npm run check]
        START[npm start]
    end

    subgraph App[Node.js updater]
        SCRIPT[update.js]
        MEMORY[last_character.json]
        PICK[Dynamic character picker]
        META[Metadata + stat builder]
        PAYLOAD[Discord payload builder]
    end

    subgraph APIs[External APIs]
        ANILIST[AniList GraphQL API]
        JIKAN[Jikan REST API]
        DISCORD[Discord Profile Widget API]
    end

    TRIGGER --> RUNNER --> INSTALL --> CHECK --> START
    START --> SCRIPT
    SCRIPT --> MEMORY
    SCRIPT --> PICK
    PICK -. primary female candidates .-> ANILIST
    PICK -. fallback anime cast candidates .-> JIKAN
    PICK --> META --> PAYLOAD
    PAYLOAD -. PATCH dynamic payload .-> DISCORD
    SCRIPT --> MEMORY
```

---

## Update lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub Actions
    participant App as update.js
    participant Memory as last_character.json
    participant AniList as AniList API
    participant Jikan as Jikan API
    participant Discord as Discord Widget API

    GH->>App: npm start
    App->>Memory: read recent character memory

    alt source is auto or anilist
        App->>AniList: Page.characters(sort: FAVOURITES_DESC)
        AniList-->>App: female candidates, metadata, artwork
    end

    opt AniList unavailable and fallback allowed
        App->>Jikan: GET top anime page
        App->>Jikan: GET anime cast
        App->>Jikan: GET character full data
        Jikan-->>App: female-like fallback candidate
    end

    App->>App: parse role, description, stats
    App->>Discord: PATCH full widget payload
    Discord-->>App: 204 or 2xx
    App->>Memory: save new character state
    GH->>GH: commit last_character.json
```

---

## Source modes

```mermaid
flowchart LR
    CFG{CHARACTER_SOURCE} -->|auto| A[AniList first]
    CFG -->|anilist| B[AniList only]
    CFG -->|jikan| C[Jikan only]
    A -->|AniList fails| C
    A --> D[Picked character]
    B --> D
    C --> D
```

| Mode | Behavior |
| --- | --- |
| `auto` | Try AniList female top characters, then Jikan fallback |
| `anilist` | Use only AniList and fail if AniList is unavailable |
| `jikan` | Use Jikan top-anime cast fallback only |

---

## Memory model

`last_character.json` only stores recent picks. It is not a character database.

```json
{
  "lastId": "anilist:12345",
  "lastName": "Makima",
  "recent": ["anilist:12345", "jikan:9876"],
  "provider": "anilist",
  "updatedAt": "2026-07-05T12:00:00.000Z"
}
```

The workflow commits this file after a successful Discord update so the next run can avoid repeats.

---

## Failure strategy

| Failure | Behavior |
| --- | --- |
| Missing Discord env vars | Fail fast before API work |
| Invalid memory file | Reset memory safely |
| AniList unavailable | Try Jikan when `CHARACTER_SOURCE=auto` |
| Jikan rate-limited | Wait briefly and try another page until attempts are exhausted |
| No candidate found | Fail without changing memory |
| Discord PATCH fails | Exit non-zero and do not save memory |
| Successful PATCH | Save memory and let workflow commit it |

---

## Why this is better than a custom database

The old version depended on `waifus_final.json`, which eventually becomes stale. The new version uses live public APIs:

- AniList for popular female characters and rich metadata.
- Jikan/MyAnimeList as a backup source when AniList is down.
- `last_character.json` only for repeat avoidance, not as source data.
