# Widget Fields

All Discord widget fields must use:

```text
Value Type: User Data
```

Field names are case-sensitive.

---

## Required fields

| Field | Type | Example | Description |
| --- | --- | --- | --- |
| `waifu` | Text | `Makima` | Character name |
| `source` | Text | `Chainsaw Man` | Anime/game/source title |
| `fanbase` | Text | `420.0K` | Formatted popularity estimate |
| `vibe` | Text | `ELEGANT` | Generated vibe label |
| `rating` | Text | `LEGENDARY` | Popularity tier |
| `age` | Text | `Unknown` | AniList age if available |
| `blood` | Text | `AB` | AniList blood type if available |
| `bio` | Text | `Hunter` | Parsed role/category |
| `description` | Text | `Special Division` | Short cleaned description |
| `universe` | Text | `ANIME` | Source category |
| `image` | Image | `https://...` | Character artwork |

---

## Payload field types

Text field:

```json
{ "type": 1, "name": "waifu", "value": "Makima" }
```

Image field:

```json
{
  "type": 3,
  "name": "image",
  "value": {
    "url": "https://cdn.myanimelist.net/images/characters/...jpg"
  }
}
```

---

## Common mistakes

| Problem | Fix |
| --- | --- |
| Widget shows fallback text | Set field to User Data, not Custom String |
| Image does not show | Field name must be exactly `image` and type must be Image |
| Some fields update, others do not | Check spelling and case for each Data Field |
| PATCH returns success but widget does not bind | Ensure payload includes `username` |
