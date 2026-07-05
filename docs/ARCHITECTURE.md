# Architecture

This version uses a hybrid design: a local verified database keeps character identity stable, and live APIs improve images/details whenever they are available.

```mermaid
flowchart TB
    GHA[GitHub Actions] --> APP[update.js]
    APP --> DB[waifus_final.json]
    APP --> MEM[last_character.json]
    DB --> PICK[Pick next/reroll character]
    PICK --> ENRICH[Metadata enrichment]
    ENRICH --> ANILIST[AniList]
    ENRICH --> JIKAN[Jikan / MyAnimeList]
    ENRICH --> KITSU[Kitsu]
    ENRICH --> IMG[Image processing]
    IMG --> REMBG[remove.bg optional]
    IMG --> CDN[Discord CDN upload]
    CDN --> PATCH[Discord widget PATCH]
    PATCH --> MEM
```

## Why this approach

The previous purely-live approach could show generic fallback text when AniList/Jikan were down. The old purely-static approach became stale. The hybrid approach gives both:

- stable real character fields from `waifus_final.json`;
- better images and metadata from AniList/Jikan/Kitsu;
- optional remove.bg background removal;
- Discord-CDN hosted PNGs for reliable widget rendering;
- memory-based repeat avoidance.

## Memory

`last_character.json` stores rotation state and the last enriched payload cache. It is committed back by GitHub Actions after a successful Discord update.
