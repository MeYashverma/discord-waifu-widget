#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const axios = require("axios");

const ANILIST_API = "https://graphql.anilist.co";
const JIKAN_API = "https://api.jikan.moe/v4";
const NEKOS_BEST_API = "https://nekos.best/api/v2/waifu";
const DISCORD_API = "https://discord.com/api/v9";
const MEMORY_FILE = path.resolve(__dirname, "last_character.json");
const DISCORD_USER_AGENT =
  "DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)";

const TEXT_MAX = 100;
const IMAGE_URL_MAX = 512;
const RECENT_MEMORY_LIMIT = 25;

const config = loadConfig();

function loadConfig() {
  const required = ["DISCORD_APP_ID", "DISCORD_USER_ID", "DISCORD_BOT_TOKEN"];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    discordAppId: process.env.DISCORD_APP_ID.trim(),
    discordUserId: process.env.DISCORD_USER_ID.trim(),
    discordBotToken: process.env.DISCORD_BOT_TOKEN.trim(),
    widgetUsername: process.env.WIDGET_USERNAME?.trim() || "waifu-widget",
    source: normalizeSource(process.env.CHARACTER_SOURCE || "auto"),
    minPage: positiveInt(process.env.MIN_SOURCE_PAGE, 1),
    maxPage: positiveInt(process.env.MAX_SOURCE_PAGE, 5),
    maxAttempts: positiveInt(process.env.MAX_PICK_ATTEMPTS, 8),
    imageFallback: !isTruthy(process.env.DISABLE_IMAGE_FALLBACK),
    dryRun: isTruthy(process.env.DRY_RUN),
    eventName: process.env.GITHUB_EVENT_NAME || "local",
  };
}

function normalizeSource(value) {
  const normalized = String(value || "auto").trim().toLowerCase();
  return ["auto", "anilist", "jikan"].includes(normalized) ? normalized : "auto";
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) {
    return { lastId: null, lastName: null, recent: [], updatedAt: null };
  }

  try {
    const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    const recent = Array.isArray(memory.recent)
      ? memory.recent.filter(Boolean).map(String).slice(0, RECENT_MEMORY_LIMIT)
      : [];

    // Backward compatibility with the old custom-database memory format:
    // { "last": "Lisa", "index": 17 }
    return {
      lastId: memory.lastId ? String(memory.lastId) : null,
      lastName: typeof memory.lastName === "string"
        ? memory.lastName
        : typeof memory.last === "string"
          ? memory.last
          : null,
      recent,
      updatedAt: typeof memory.updatedAt === "string" ? memory.updatedAt : null,
    };
  } catch {
    return { lastId: null, lastName: null, recent: [], updatedAt: null };
  }
}

function saveMemory(memory) {
  fs.writeFileSync(MEMORY_FILE, `${JSON.stringify(memory, null, 2)}\n`);
}

function buildNextMemory(character, previous) {
  const id = character.globalId;
  const recent = [id, ...(previous.recent || []).filter((item) => item !== id)]
    .slice(0, RECENT_MEMORY_LIMIT);

  return {
    lastId: id,
    lastName: character.name,
    recent,
    provider: character.provider,
    updatedAt: new Date().toISOString(),
  };
}

function isManualRun() {
  return config.eventName === "workflow_dispatch";
}

function randomPage() {
  const min = Math.min(config.minPage, config.maxPage);
  const max = Math.max(config.minPage, config.maxPage);
  return min + Math.floor(Math.random() * (max - min + 1));
}

function deterministicDailyPage() {
  const bucket = Math.floor(Date.now() / (6 * 60 * 60 * 1000));
  const min = Math.min(config.minPage, config.maxPage);
  const max = Math.max(config.minPage, config.maxPage);
  return min + (bucket % (max - min + 1));
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function formatNumber(num) {
  const value = Number(num);
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function truncate(value, max = TEXT_MAX) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function hashString(input) {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicPick(list, seed) {
  if (list.length === 0) return "";
  return list[hashString(seed) % list.length];
}

const vibes = [
  "DOMINANT",
  "SEDUCTIVE",
  "MYSTERIOUS",
  "PLAYFUL",
  "CONFIDENT",
  "CHAOTIC",
  "WHOLESOME",
  "TSUNDERE",
  "YANDERE",
  "DEADLY",
  "ELEGANT",
  "LOYAL",
  "INTENSE",
  "ROYAL",
];

function generateFanbase(character) {
  const sourceBoost = hashString(character.source || character.name) % 240000;
  const characterBoost = hashString(`${character.name}:${character.globalId}`) % 100000;
  return Number(character.favourites || 0) + 120000 + sourceBoost + characterBoost;
}

function generateRating(fanbase) {
  if (fanbase > 750000) return "MYTHIC";
  if (fanbase > 500000) return "LEGENDARY";
  if (fanbase > 350000) return "ELITE";
  if (fanbase > 220000) return "ICONIC";
  if (fanbase > 120000) return "POPULAR";
  return "RISING";
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanDescription(text) {
  return decodeEntities(text)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~!/g, "")
    .replace(/!~/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[_*~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBioAndDescription(description) {
  const cleaned = cleanDescription(description);
  if (!cleaned) return { bio: "Character", description: "Profile Available" };

  const roleRules = [
    [/witch/i, "Witch"],
    [/archon/i, "Archon"],
    [/hunter/i, "Hunter"],
    [/maid/i, "Maid"],
    [/mage|magician|sorcer/i, "Mage"],
    [/student|academy/i, "Student"],
    [/princess|queen|royal/i, "Royalty"],
    [/knight/i, "Knight"],
    [/idol|singer/i, "Idol"],
    [/soldier|warrior/i, "Soldier"],
    [/assassin/i, "Assassin"],
    [/captain|commander/i, "Captain"],
    [/detective/i, "Detective"],
    [/goddess|deity/i, "Goddess"],
  ];

  const bio = roleRules.find(([regex]) => regex.test(cleaned))?.[1] || "Character";

  const stripped = cleaned
    .replace(/Height:.*?(?=[A-Z]|$)/gi, "")
    .replace(/Birthday:.*?(?=[A-Z]|$)/gi, "")
    .replace(/Age:.*?(?=[A-Z]|$)/gi, "")
    .replace(/Blood Type:.*?(?=[A-Z]|$)/gi, "")
    .replace(/Gender:.*?(?=[A-Z]|$)/gi, "")
    .replace(/\d+\s*cm/gi, "")
    .replace(/\d+\s*kg/gi, "")
    .trim();

  const detailRules = [
    [/witch/i, "Witch of Sin"],
    [/guild/i, "Guild Member"],
    [/academy/i, "Academy Student"],
    [/division/i, "Special Division"],
    [/shogun/i, "Divine Ruler"],
    [/captain/i, "Squad Captain"],
    [/commander/i, "Field Commander"],
  ];

  const matchedDetail = detailRules.find(([regex]) => regex.test(stripped))?.[1];
  if (matchedDetail) return { bio, description: matchedDetail };

  const firstSentence = stripped.split(/[.!?]/)[0]?.trim() || "Profile Available";
  const detail = /height|birthday|blood type|gender/i.test(firstSentence) || firstSentence.length < 4
    ? "Profile Available"
    : firstSentence;

  return { bio, description: truncate(detail, 80) };
}

function isFemaleFromAniList(character) {
  const gender = String(character.gender || "").toLowerCase();
  return gender.includes("female") || gender.includes("woman") || gender.includes("girl");
}

function isProbablyFemaleFromText(text) {
  const about = String(text || "").toLowerCase();
  if (/gender\s*:\s*female/.test(about)) return true;
  if (/gender\s*:\s*male/.test(about)) return false;

  const femaleMatches = about.match(/\b(she|her|hers|girl|woman|female|heroine|princess|queen|goddess)\b/g) || [];
  const maleMatches = about.match(/\b(he|him|his|boy|man|male|hero|prince|king)\b/g) || [];

  // Jikan does not expose gender consistently, so be conservative. A single
  // "her" in a male character's relationship text is not enough.
  return femaleMatches.length >= 2 && femaleMatches.length > maleMatches.length;
}

function normalizeAniListCharacter(item) {
  const mediaTitle = item.media?.nodes?.[0]?.title;
  const source = mediaTitle?.english || mediaTitle?.romaji || mediaTitle?.native || "AniList";
  const name = item.name?.full || item.name?.native || "Unknown";
  return {
    provider: "anilist",
    globalId: `anilist:${item.id}`,
    id: item.id,
    name,
    source,
    universe: "ANIME",
    favourites: Number(item.favourites || 0),
    age: item.age != null && String(item.age).trim() ? String(item.age) : "Unknown",
    blood: typeof item.bloodType === "string" && item.bloodType.trim() ? item.bloodType : "Unknown",
    description: item.description || "",
    image: item.image?.large || "https://i.imgur.com/4M34hi2.png",
    siteUrl: item.siteUrl || "",
  };
}

async function fetchAniListCandidates(page) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        characters(sort: FAVOURITES_DESC) {
          id
          siteUrl
          name { full native }
          gender
          favourites
          age
          bloodType
          description(asHtml: false)
          image { large }
          media(sort: POPULARITY_DESC, perPage: 1) {
            nodes { title { romaji english native } }
          }
        }
      }
    }
  `;

  const response = await axios.post(
    ANILIST_API,
    { query, variables: { page, perPage: 25 } },
    {
      timeout: 15_000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "discord-waifu-widget/1.0",
      },
    },
  );

  const characters = response.data?.data?.Page?.characters || [];
  return characters.filter(isFemaleFromAniList).map(normalizeAniListCharacter);
}

async function fetchJikanTopAnimePage(page) {
  const response = await axios.get(`${JIKAN_API}/top/anime`, {
    timeout: 25_000,
    params: { page, limit: 10 },
    headers: {
      Accept: "application/json",
      "User-Agent": "discord-waifu-widget/1.0",
    },
  });

  return response.data?.data || [];
}

async function fetchJikanAnimeCharacters(animeId) {
  const response = await axios.get(`${JIKAN_API}/anime/${animeId}/characters`, {
    timeout: 25_000,
    headers: {
      Accept: "application/json",
      "User-Agent": "discord-waifu-widget/1.0",
    },
  });

  return response.data?.data || [];
}

async function fetchJikanFull(id) {
  const response = await axios.get(`${JIKAN_API}/characters/${id}/full`, {
    timeout: 25_000,
    headers: {
      Accept: "application/json",
      "User-Agent": "discord-waifu-widget/1.0",
    },
  });
  return response.data?.data || null;
}

function normalizeJikanCharacter(item, full) {
  const anime = full?.anime?.[0]?.anime || item.anime?.[0]?.anime;
  const manga = full?.manga?.[0]?.manga || item.manga?.[0]?.manga;
  const source = anime?.title || manga?.title || "MyAnimeList";
  return {
    provider: "jikan",
    globalId: `jikan:${item.mal_id}`,
    id: item.mal_id,
    name: item.name || full?.name || "Unknown",
    source,
    universe: anime ? "ANIME" : manga ? "MANGA" : "ANIME",
    favourites: Number(item.favorites || full?.favorites || 0),
    age: "Unknown",
    blood: "Unknown",
    description: full?.about || item.about || "",
    image:
      full?.images?.jpg?.image_url ||
      full?.images?.webp?.image_url ||
      item.images?.jpg?.image_url ||
      item.images?.webp?.image_url ||
      "https://i.imgur.com/4M34hi2.png",
    siteUrl: item.url || full?.url || "",
  };
}

async function pickFromAniList(memory) {
  const attemptedPages = new Set();
  const firstPage = isManualRun() ? randomPage() : deterministicDailyPage();

  for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
    const page = attempt === 0 ? firstPage : randomPage();
    if (attemptedPages.has(page)) continue;
    attemptedPages.add(page);

    try {
      const candidates = await fetchAniListCandidates(page);
      const fresh = shuffle(candidates).filter((item) => !memory.recent.includes(item.globalId));
      if (fresh.length > 0) return fresh[0];
      if (candidates.length > 0) return shuffle(candidates)[0];
    } catch (error) {
      const status = error.response?.status;
      console.warn(`AniList page ${page} failed${status ? ` (${status})` : ""}.`);
      return null;
    }
  }

  return null;
}

async function pickFromJikan(memory) {
  const attemptedPages = new Set();

  for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
    const page = attempt === 0 && !isManualRun() ? deterministicDailyPage() : randomPage();
    if (attemptedPages.has(page)) continue;
    attemptedPages.add(page);

    try {
      const animeList = shuffle(await fetchJikanTopAnimePage(page));
      for (const anime of animeList.slice(0, 5)) {
        const cast = shuffle(await fetchJikanAnimeCharacters(anime.mal_id));
        for (const entry of cast.slice(0, 12)) {
          await sleep(350);
          const item = entry.character;
          if (!item?.mal_id) continue;
          const full = await fetchJikanFull(item.mal_id);
          const normalized = normalizeJikanCharacter(
            { ...item, favorites: item.favorites || 0 },
            { ...full, anime: [{ anime: { title: anime.title } }] },
          );
          const knownFemale = isProbablyFemaleFromText(normalized.description);
          const notRecent = !memory.recent.includes(normalized.globalId);
          if (knownFemale && notRecent) return normalized;
        }
      }
    } catch (error) {
      const status = error.response?.status;
      console.warn(`Jikan anime page ${page} failed${status ? ` (${status})` : ""}.`);
      if (status === 429) await sleep(2_000);
    }
  }

  return null;
}

async function pickFromNekosBest(memory) {
  if (!config.imageFallback) return null;

  try {
    const response = await axios.get(NEKOS_BEST_API, {
      timeout: 15_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "discord-waifu-widget/1.0",
      },
    });

    const item = response.data?.results?.[0];
    if (!item?.url) return null;

    const id = `nekos:${item.url}`;
    return {
      provider: "nekos.best",
      globalId: id,
      id,
      name: "Waifu of the Day",
      source: item.artist_name ? `Art by ${item.artist_name}` : "Nekos.best",
      universe: "ARTWORK",
      favourites: 0,
      age: "Unknown",
      blood: "Unknown",
      description: item.source_url ? "Fresh artwork fallback" : "Random SFW artwork",
      image: item.url,
      siteUrl: item.source_url || item.artist_href || "https://nekos.best/",
    };
  } catch (error) {
    const status = error.response?.status;
    console.warn(`Nekos.best image fallback failed${status ? ` (${status})` : ""}.`);
    return null;
  }
}

async function pickCharacter(memory) {
  if (config.source !== "jikan") {
    const ani = await pickFromAniList(memory);
    if (ani) return ani;
    if (config.source === "anilist") {
      throw new Error("AniList source failed and CHARACTER_SOURCE=anilist disables fallback");
    }
  }

  const jikan = await pickFromJikan(memory);
  if (jikan) return jikan;

  const imageFallback = await pickFromNekosBest(memory);
  if (imageFallback) return imageFallback;

  throw new Error("Could not pick a character from AniList, Jikan, or image fallback");
}

function buildMetadata(character) {
  const parsed = extractBioAndDescription(character.description);
  const fanbase = generateFanbase(character);

  return {
    source: character.source,
    fanbase,
    vibe: deterministicPick(vibes, character.globalId),
    rating: generateRating(fanbase),
    age: character.age || "Unknown",
    blood: character.blood || "Unknown",
    bio: parsed.bio,
    description: parsed.description,
    image: character.image,
  };
}

function textField(name, value, max = TEXT_MAX) {
  return { type: 1, name, value: truncate(value, max) };
}

function imageField(name, url) {
  const safe = String(url || "").trim().slice(0, IMAGE_URL_MAX);
  return { type: 3, name, value: { url: safe } };
}

function buildPayload(character, meta) {
  return {
    username: config.widgetUsername,
    data: {
      dynamic: [
        textField("waifu", character.name),
        textField("source", meta.source),
        textField("fanbase", formatNumber(meta.fanbase)),
        textField("vibe", meta.vibe),
        textField("rating", meta.rating),
        textField("age", meta.age),
        textField("blood", meta.blood),
        textField("bio", meta.bio),
        textField("description", meta.description, 80),
        textField("universe", character.universe),
        imageField("image", meta.image),
      ],
    },
  };
}

async function updateDiscord(payload) {
  if (config.dryRun) {
    console.log("DRY_RUN=true; not PATCHing Discord. Payload:");
    console.log(JSON.stringify(payload, null, 2));
    return true;
  }

  const url = `${DISCORD_API}/applications/${config.discordAppId}/users/${config.discordUserId}/identities/0/profile`;

  try {
    const response = await axios.patch(url, payload, {
      timeout: 15_000,
      headers: {
        Authorization: `Bot ${config.discordBotToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": DISCORD_USER_AGENT,
      },
      validateStatus: (status) => (status >= 200 && status < 300) || status === 204,
    });

    console.log(`Discord widget updated: ${response.status}`);
    return true;
  } catch (error) {
    const status = error.response?.status;
    const body = error.response?.data;
    console.error("Discord PATCH failed", {
      status,
      message: error.message,
      body: body ? JSON.stringify(body).slice(0, 500) : undefined,
    });
    return false;
  }
}

async function main() {
  console.log("Starting Discord Waifu Widget update...");
  console.log(`Source mode: ${config.source}`);
  console.log(`Image fallback: ${config.imageFallback ? "enabled" : "disabled"}`);

  const memory = loadMemory();
  const character = await pickCharacter(memory);
  const nextMemory = buildNextMemory(character, memory);

  console.log(`Picked: ${character.name} (${character.source}) via ${character.provider}`);
  console.log(`Previous: ${memory.lastName || "none"}`);

  const meta = buildMetadata(character);
  const payload = buildPayload(character, meta);

  const ok = await updateDiscord(payload);
  if (!ok) process.exitCode = 1;

  if (ok && !config.dryRun) {
    saveMemory(nextMemory);
    console.log("Saved character memory.");
  }

  console.log(ok ? "Done." : "Finished with errors.");
}

main().catch((error) => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
