# 🌸 Discord Waifu Widget Framework

> **A fully automated Discord Dynamic Profile Widget that updates with a rotating Waifu of the Day using AniList metadata, GitHub Actions automation, and Discord’s Dynamic Widget API.**

![Node.js](https://img.shields.io/badge/Node.js-22-green?style=for-the-badge)
![GitHub Actions](https://img.shields.io/badge/GitHub-Actions-blue?style=for-the-badge)
![Discord API](https://img.shields.io/badge/Discord-Dynamic%20Widgets-5865F2?style=for-the-badge)
![AniList](https://img.shields.io/badge/API-AniList-02A9FF?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Stable-success?style=for-the-badge)

---

# 🚀 Overview

This project automatically updates your Discord profile widget with a new **Waifu of the Day**.

The system rotates through a curated character dataset, fetches live metadata from AniList, enriches profile information, generates dynamic stats, and pushes everything directly to Discord’s Dynamic Widget API.

```text
No VPS
No Paid APIs
No Local Machine
No Manual Updates
100% Cloud Automated
```

---

# ✨ Widget Preview

Example output:

```text
WAIFU       → Makima
BIO         → Devil Hunter
DESCRIPTION → Tokyo Special Division 4
SOURCE      → Chainsaw Man

SIMPS       → 218K
VIBE        → ELEGANT
RANK        → LEGENDARY
AGE         → 19
BLOOD       → AB
WORLD       → GACHA
```

Alternative day:

```text
WAIFU       → Bronya
BIO         → Assassin
DESCRIPTION → Academy Student
SOURCE      → Honkai Star Rail

SIMPS       → 494K
VIBE        → ROYAL
RANK        → LEGENDARY
AGE         → 14+
BLOOD       → Unknown
WORLD       → GACHA
```

Includes:

```text
Character Artwork
Live AniList Metadata
Dynamic Stat Generation
```

---

# 🏗 System Architecture

```mermaid
flowchart TD

A[waifus_final.json] --> B[update.js]

B --> C[Load last_character.json]

C --> D[Pick Next Character]

D --> E[AniList GraphQL API]

E --> F[Fetch Metadata]

F --> G[Metadata Parsing Engine]

G --> H[Generate Stats]

H --> I[Discord PATCH API]

I --> J[Discord Profile Updated]
```

---

# 🎲 Rotation Engine

The system uses persistent memory rather than random daily seed.

This guarantees:

```text
No duplicate consecutive characters

Sequential character rotation

Manual reroll support
```

Logic:

```mermaid
flowchart LR

A[last_character.json] --> B[Read Previous State]

B --> C[Sequential Index]

C --> D[Pick Character]

D --> E[Save New State]

E --> F[Prevent Duplicate]
```

---

# 🧠 Metadata Engine

Unlike static widgets, this project enriches characters dynamically.

## BIO DETECTION

Auto detects roles:

```text
Hunter
Mage
Knight
Princess
Archon
Witch
Student
Assassin
Captain
Idol
Maid
Soldier
```

---

## DESCRIPTION ENGINE

Automatically parses AniList descriptions.

Cleans:

```text
HTML Tags

Height Fields

Birthday Fields

Blood Type Fields

Markdown Formatting

Broken Metadata Strings
```

Output example:

```text
Tokyo Special Division 4

Academy Student

Witch of Sin

Guild Member
```

---

# 🌐 Character Database

The dataset contains:

```text
302 manually curated female-only characters
```

Properties:

```text
Anime

Gacha Games

JRPG

Visual Novels

Gaming Characters
```

No duplicates.

No fake entries.

Balanced franchise coverage.

---

<details>

<summary>🌸 Supported Universes</summary>

## Anime

```text
Chainsaw Man
Re:Zero
Naruto
Bleach
One Piece
Jujutsu Kaisen
Attack on Titan
Date A Live
High School DxD
Cyberpunk Edgerunners
Violet Evergarden
Konosuba
Death Note
One Punch Man
```

---

## Gacha / Anime Games

```text
Genshin Impact
Honkai Star Rail
Zenless Zone Zero
Wuthering Waves
Nikke
Blue Archive
Azur Lane
```

---

## JRPG / Games

```text
Fate Series
Persona 5
NieR Automata
Final Fantasy VII
Resident Evil
Bayonetta
```

</details>

---

# 🌍 APIs Used

## AniList API

Used for:

```text
Character Search

Favorites Count

Age

Blood Type

Description

Character Artwork
```

Documentation:

:contentReference[oaicite:0]{index=0}

GraphQL Endpoint:

```text
https://graphql.anilist.co
```

---

## Discord Widget API

Method:

```text
PATCH
```

Endpoint:

```text
https://discord.com/api/v9/applications/{APP_ID}/users/{USER_ID}/identities/0/profile
```

---

# 🔄 API Execution Flow

```mermaid
sequenceDiagram

participant GitHub Actions

participant update.js

participant AniList API

participant Discord API

GitHub Actions->>update.js: Run Workflow

update.js->>update.js: Pick Character

update.js->>AniList API: Search Character

AniList API-->>update.js: Return Metadata

update.js->>update.js: Parse Metadata

update.js->>Discord API: PATCH Widget

Discord API-->>update.js: 204 Success
```

---

# ⚙️ GitHub Actions Automation

Supports both scheduled and manual execution.

Schedule:

```text
Scheduled Auto Rotation

workflow_dispatch Manual Reroll
```

Flow:

```mermaid
flowchart TD

A[GitHub Trigger] --> B[Install Dependencies]

B --> C[Run update.js]

C --> D[Pick Character]

D --> E[Query AniList]

E --> F[Parse Metadata]

F --> G[Update Discord Widget]
```

---

# 📂 Project Structure

```mermaid
graph TD

ROOT[discord-waifu-widget]

ROOT --> A[update.js]

ROOT --> B[waifus_final.json]

ROOT --> C[last_character.json]

ROOT --> D[package.json]

ROOT --> E[.github]

E --> F[workflows]

F --> G[update.yml]
```

---

# 🔐 Required Secrets

Add these in:

```text
Settings → Secrets → Actions
```

Required:

```text
DISCORD_APP_ID

DISCORD_USER_ID

DISCORD_BOT_TOKEN
```

---

# 📦 Example Discord Payload

```json
{
  "data": {
    "dynamic": [
      {
        "name": "waifu",
        "value": "Makima"
      },
      {
        "name": "source",
        "value": "Chainsaw Man"
      },
      {
        "name": "fanbase",
        "value": "218K"
      },
      {
        "name": "vibe",
        "value": "ELEGANT"
      },
      {
        "name": "rating",
        "value": "LEGENDARY"
      },
      {
        "name": "age",
        "value": "19"
      },
      {
        "name": "blood",
        "value": "AB"
      },
      {
        "name": "bio",
        "value": "Devil Hunter"
      },
      {
        "name": "description",
        "value": "Tokyo Special Division 4"
      }
    ]
  }
}
```

---

# 🚀 Deployment

```mermaid
flowchart TD

A[Clone Repository]

A --> B[Add Secrets]

B --> C[Upload Dataset]

C --> D[Push Code]

D --> E[GitHub Action Starts]

E --> F[Run update.js]

F --> G[AniList Query]

G --> H[Discord Widget Updated]
```

---

# ⚠️ Current Limitations

AniList metadata may fail for:

```text
Short names

Alias characters

Characters with ambiguous names
```

Reason:

```text
AniList exact search mismatch
```

---

# 🧰 Tech Stack

```text
Node.js

GitHub Actions

Axios

Discord API

AniList GraphQL API

JSON Database
```

---
