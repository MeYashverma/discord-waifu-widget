#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");

const ANILIST_API = "https://graphql.anilist.co";
const JIKAN_API = "https://api.jikan.moe/v4";
const KITSU_API = "https://kitsu.io/api/edge";
const NEKOS_BEST_API = "https://nekos.best/api/v2/waifu";
const REMOVE_BG_API = "https://api.remove.bg/v1.0/removebg";
const DISCORD_API = "https://discord.com/api/v9";

const MEMORY_FILE = path.resolve(__dirname, "last_character.json");
const WAIFU_FILE = path.resolve(__dirname, "waifus_final.json");
const SEED_FILE = path.resolve(__dirname, "data/waifus_seed.json");
const IMAGE_CACHE_DIR = path.resolve(__dirname, ".cache/images");
const DISCORD_USER_AGENT =
  "DiscordBot (https://github.com/discord/discord-api-docs, 1.0.0)";

const TEXT_MAX = 100;
const IMAGE_URL_MAX = 512;
const RECENT_MEMORY_LIMIT = 35;

const config = loadConfig();
const WAIFUS = loadWaifuDatabase();
const SEED_DETAILS = loadSeedDetails();

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
    dryRun: isTruthy(process.env.DRY_RUN),
    eventName: process.env.GITHUB_EVENT_NAME || "local",
    imageFix: !isTruthy(process.env.DISABLE_IMAGE_FIX),
    removeBg: !isTruthy(process.env.DISABLE_REMOVE_BG),
    removeBgApiKey: process.env.REMOVE_BG_API_KEY?.trim() || "",
    discordImageWebhookUrl: process.env.DISCORD_IMAGE_WEBHOOK_URL?.trim() || "",
    discordTargetChannelId: process.env.DISCORD_TARGET_CHANNEL_ID?.trim() || "",
    imageFallback: !isTruthy(process.env.DISABLE_IMAGE_FALLBACK),
  };
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadWaifuDatabase() {
  const raw = JSON.parse(fs.readFileSync(WAIFU_FILE, "utf8"));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("waifus_final.json must contain at least one character");
  }
  return raw
    .map((item) => ({
      name: String(item.name || "").trim(),
      source: String(item.source || "Unknown Source").trim(),
      universe: String(item.universe || "ANIME").trim(),
      image: String(item.image || "").trim(),
      bio: String(item.bio || "").trim(),
      description: String(item.description || "").trim(),
      age: String(item.age || "").trim(),
      blood: String(item.blood || "").trim(),
    }))
    .filter((item) => item.name);
}

function loadSeedDetails() {
  try {
    const seeds = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
    const map = new Map();
    for (const item of Array.isArray(seeds) ? seeds : []) {
      if (item?.name) map.set(item.name.toLowerCase(), item);
    }
    return map;
  } catch {
    return new Map();
  }
}

function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) {
    return { lastId: null, lastName: null, index: 0, recent: [], provider: null, updatedAt: null, cached: null };
  }

  try {
    const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    const recent = Array.isArray(memory.recent)
      ? memory.recent.filter(Boolean).map(String).slice(0, RECENT_MEMORY_LIMIT)
      : [];

    return {
      lastId: memory.lastId ? String(memory.lastId) : null,
      lastName: typeof memory.lastName === "string"
        ? memory.lastName
        : typeof memory.last === "string"
          ? memory.last
          : null,
      index: Number.isInteger(memory.index) && memory.index >= 0 ? memory.index : 0,
      recent,
      provider: typeof memory.provider === "string" ? memory.provider : null,
      updatedAt: typeof memory.updatedAt === "string" ? memory.updatedAt : null,
      cached: memory.cached && typeof memory.cached === "object" ? memory.cached : null,
    };
  } catch {
    return { lastId: null, lastName: null, index: 0, recent: [], provider: null, updatedAt: null, cached: null };
  }
}

function saveMemory(memory) {
  fs.writeFileSync(MEMORY_FILE, `${JSON.stringify(memory, null, 2)}\n`);
}

function isManualRun() {
  return config.eventName === "workflow_dispatch";
}

function characterId(character) {
  return `db:${character.name}:${character.source}`;
}

function pickCharacter(memory) {
  let picked;
  let nextIndex = memory.index % WAIFUS.length;

  if (isManualRun()) {
    const candidates = WAIFUS.filter((item) => !memory.recent.includes(characterId(item)));
    const pool = candidates.length > 0 ? candidates : WAIFUS;
    picked = pool[Math.floor(Math.random() * pool.length)];
    nextIndex = (WAIFUS.findIndex((item) => item.name === picked.name && item.source === picked.source) + 1) % WAIFUS.length;
  } else {
    for (let i = 0; i < WAIFUS.length; i += 1) {
      const candidate = WAIFUS[(nextIndex + i) % WAIFUS.length];
      if (!memory.recent.includes(characterId(candidate))) {
        picked = candidate;
        nextIndex = (nextIndex + i + 1) % WAIFUS.length;
        break;
      }
    }
    picked ||= WAIFUS[nextIndex];
    nextIndex = (nextIndex + 1) % WAIFUS.length;
  }

  return {
    ...picked,
    provider: "database",
    globalId: characterId(picked),
    nextIndex,
  };
}

function buildNextMemory(character, previous, meta, imageUrl) {
  const id = character.globalId;
  const recent = [id, ...(previous.recent || []).filter((item) => item !== id)]
    .slice(0, RECENT_MEMORY_LIMIT);

  return {
    lastId: id,
    lastName: character.name,
    index: character.nextIndex ?? previous.index ?? 0,
    recent,
    provider: character.provider,
    updatedAt: new Date().toISOString(),
    cached: { character, meta, imageUrl },
  };
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

function sha256Short(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex").slice(0, 24);
}

function hashString(input) {
  let hash = 2166136261;
  for (const char of String(input)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicPick(list, seed) {
  return list[hashString(seed) % list.length];
}

const vibes = ["DOMINANT", "SEDUCTIVE", "MYSTERIOUS", "PLAYFUL", "CONFIDENT", "CHAOTIC", "WHOLESOME", "TSUNDERE", "YANDERE", "DEADLY", "ELEGANT", "LOYAL", "INTENSE", "ROYAL"];

const franchiseWeights = {
  "One Piece": 550000,
  Naruto: 520000,
  Bleach: 450000,
  "Attack on Titan": 600000,
  "Chainsaw Man": 420000,
  "Jujutsu Kaisen": 500000,
  "Demon Slayer": 520000,
  "Genshin Impact": 500000,
  "Honkai Star Rail": 420000,
  "Final Fantasy VII": 450000,
  "NieR Automata": 380000,
  "Persona 5": 400000,
};

function generateFanbase(character, favourites = 0) {
  const base = franchiseWeights[character.source] || 180000;
  const jitter = hashString(`${character.name}:${character.source}`) % 90000;
  return Math.max(Number(favourites || 0), base + jitter);
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

function inferBio(text, fallback = "Character") {
  const cleaned = cleanDescription(text);
  const rules = [
    [/witch/i, "Witch"], [/archon/i, "Archon"], [/hunter/i, "Hunter"],
    [/maid/i, "Maid"], [/mage|magician|sorcer/i, "Mage"], [/student|academy/i, "Student"],
    [/princess|queen|royal/i, "Royalty"], [/knight/i, "Knight"], [/idol|singer/i, "Idol"],
    [/soldier|warrior/i, "Soldier"], [/assassin/i, "Assassin"], [/captain|commander/i, "Captain"],
    [/detective/i, "Detective"], [/goddess|deity/i, "Goddess"], [/android/i, "Android"],
    [/fiend|devil/i, "Devil"], [/hacker/i, "Hacker"],
  ];
  return rules.find(([regex]) => regex.test(cleaned))?.[1] || fallback;
}

function shortDescription(text, fallback = "Profile Available") {
  const cleaned = cleanDescription(text)
    .replace(/Height:.*?(?=[A-Z]|$)/gi, "")
    .replace(/Birthday:.*?(?=[A-Z]|$)/gi, "")
    .replace(/Age:.*?(?=[A-Z]|$)/gi, "")
    .replace(/Blood Type:.*?(?=[A-Z]|$)/gi, "")
    .replace(/Gender:.*?(?=[A-Z]|$)/gi, "")
    .replace(/\d+\s*cm/gi, "")
    .replace(/\d+\s*kg/gi, "")
    .trim();
  const first = cleaned.split(/[.!?]/)[0]?.trim();
  if (!first || first.length < 4 || /height|birthday|blood type|gender/i.test(first)) return fallback;
  return truncate(first, 80);
}

async function fetchAniListByName(name) {
  const query = `
    query ($search: String) {
      Character(search: $search) {
        id
        siteUrl
        name { full native }
        favourites
        age
        bloodType
        description(asHtml: false)
        image { large }
        media(sort: POPULARITY_DESC, perPage: 1) { nodes { title { romaji english native } } }
      }
    }
  `;
  try {
    const response = await axios.post(ANILIST_API, { query, variables: { search: name } }, {
      timeout: 15_000,
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "discord-waifu-widget/1.0" },
    });
    return response.data?.data?.Character || null;
  } catch (error) {
    console.warn(`AniList lookup failed for ${name}${error.response?.status ? ` (${error.response.status})` : ""}.`);
    return null;
  }
}

async function fetchJikanByName(name) {
  try {
    const response = await axios.get(`${JIKAN_API}/characters`, {
      timeout: 20_000,
      params: { q: name, limit: 1 },
      headers: { Accept: "application/json", "User-Agent": "discord-waifu-widget/1.0" },
    });
    const item = response.data?.data?.[0];
    if (!item) return null;
    await sleep(450);
    let full = null;
    try {
      const fullResponse = await axios.get(`${JIKAN_API}/characters/${item.mal_id}/full`, {
        timeout: 20_000,
        headers: { Accept: "application/json", "User-Agent": "discord-waifu-widget/1.0" },
      });
      full = fullResponse.data?.data || null;
    } catch {
      full = null;
    }
    return { item, full };
  } catch (error) {
    console.warn(`Jikan lookup failed for ${name}${error.response?.status ? ` (${error.response.status})` : ""}.`);
    return null;
  }
}

async function fetchKitsuByName(name) {
  try {
    const response = await axios.get(`${KITSU_API}/characters`, {
      timeout: 15_000,
      params: { "filter[name]": name },
      headers: { Accept: "application/vnd.api+json", "User-Agent": "discord-waifu-widget/1.0" },
    });
    return response.data?.data?.[0] || null;
  } catch (error) {
    console.warn(`Kitsu lookup failed for ${name}${error.response?.status ? ` (${error.response.status})` : ""}.`);
    return null;
  }
}

async function fetchNekosBestArt() {
  if (!config.imageFallback) return "";
  try {
    const response = await axios.get(NEKOS_BEST_API, {
      timeout: 15_000,
      headers: { Accept: "application/json", "User-Agent": "discord-waifu-widget/1.0" },
    });
    return response.data?.results?.[0]?.url || "";
  } catch (error) {
    console.warn(`Nekos.best image fallback failed${error.response?.status ? ` (${error.response.status})` : ""}.`);
    return "";
  }
}

async function buildMetadata(character) {
  const seed = SEED_DETAILS.get(character.name.toLowerCase()) || {};
  const [ani, jikan, kitsu] = await Promise.all([
    fetchAniListByName(character.name),
    fetchJikanByName(character.name),
    fetchKitsuByName(character.name),
  ]);

  const jItem = jikan?.item;
  const jFull = jikan?.full;
  const kAttr = kitsu?.attributes || {};
  const mediaTitle = ani?.media?.nodes?.[0]?.title;

  const description =
    seed.description ||
    ani?.description ||
    jFull?.about ||
    jItem?.about ||
    kAttr.description ||
    `${character.name} from ${character.source}`;

  const source =
    character.source ||
    mediaTitle?.english || mediaTitle?.romaji || mediaTitle?.native ||
    jFull?.anime?.[0]?.anime?.title ||
    jItem?.anime?.[0]?.anime?.title ||
    "Unknown Source";

  const image =
    character.image ||
    seed.image ||
    ani?.image?.large ||
    jFull?.images?.jpg?.image_url || jFull?.images?.webp?.image_url ||
    jItem?.images?.jpg?.image_url || jItem?.images?.webp?.image_url ||
    kAttr.image?.original || kAttr.image?.large || kAttr.image?.medium ||
    await fetchNekosBestArt();

  const fanbase = generateFanbase(character, ani?.favourites || jItem?.favorites || jFull?.favorites || 0);
  const bio = seed.bio || character.bio || inferBio(description, "Character");

  return {
    source,
    fanbase,
    vibe: deterministicPick(vibes, character.globalId || character.name),
    rating: generateRating(fanbase),
    age: seed.age || character.age || (ani?.age != null ? String(ani.age) : "Unknown"),
    blood: seed.blood || character.blood || (typeof ani?.bloodType === "string" && ani.bloodType.trim() ? ani.bloodType : "Unknown"),
    bio,
    description: seed.description || character.description || shortDescription(description, `${bio} profile`),
    image,
  };
}

function textField(name, value, max = TEXT_MAX) {
  return { type: 1, name, value: truncate(value, max) };
}

function imageField(name, url) {
  const safe = String(url || "").trim().slice(0, IMAGE_URL_MAX);
  return { type: 3, name, value: { url: safe } };
}

async function downloadImage(url, outputPath) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 25_000,
    maxContentLength: 12 * 1024 * 1024,
    headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8", "User-Agent": "discord-waifu-widget/1.0" },
  });
  await fsp.writeFile(outputPath, Buffer.from(response.data));
}

async function removeBackgroundWithApi(inputPath, outputPath) {
  if (!config.removeBg || !config.removeBgApiKey) return false;
  const form = new FormData();
  form.append("image_file", await fsp.readFile(inputPath), { filename: "waifu.png" });
  form.append("size", "auto");
  form.append("format", "png");

  try {
    const response = await axios.post(REMOVE_BG_API, form, {
      responseType: "arraybuffer",
      timeout: 45_000,
      headers: { ...form.getHeaders(), "X-Api-Key": config.removeBgApiKey },
      validateStatus: (status) => status >= 200 && status < 300,
    });
    await fsp.writeFile(outputPath, Buffer.from(response.data));
    console.log("Background removed with remove.bg API.");
    return true;
  } catch (error) {
    console.warn(`remove.bg failed${error.response?.status ? ` (${error.response.status})` : ""}; using local background cleanup.`);
    return false;
  }
}

function removeBorderBackground({ data, info }) {
  const { width, height, channels } = info;
  if (channels !== 4) return data;
  const out = Buffer.from(data);
  const visited = new Uint8Array(width * height);
  const queue = [];
  const idx = (x, y) => (y * width + x) * 4;
  const pos = (x, y) => y * width + x;
  const isBg = (x, y) => {
    const i = idx(x, y);
    const r = out[i], g = out[i + 1], b = out[i + 2], a = out[i + 3];
    if (a < 20) return true;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const bright = (r + g + b) / 3;
    const sat = max - min;
    return bright > 220 || (bright > 188 && sat < 30);
  };
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = pos(x, y);
    if (visited[p]) return;
    visited[p] = 1;
    if (isBg(x, y)) queue.push([x, y]);
  };
  for (let x = 0; x < width; x += 1) { push(x, 0); push(x, height - 1); }
  for (let y = 0; y < height; y += 1) { push(0, y); push(width - 1, y); }
  while (queue.length) {
    const [x, y] = queue.pop();
    out[idx(x, y) + 3] = 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return out;
}

async function localImageCleanup(inputPath, outputPath) {
  const raw = await sharp(inputPath)
    .rotate()
    .resize(768, 768, { fit: "inside", withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const transparent = removeBorderBackground(raw);
  await sharp(transparent, { raw: { width: raw.info.width, height: raw.info.height, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .resize(512, 512, { fit: "contain", position: "centre", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
}

async function processImage(inputPath, outputPath) {
  const removedPath = outputPath.replace(/\.png$/, "-removebg.png");
  const removed = await removeBackgroundWithApi(inputPath, removedPath);
  await localImageCleanup(removed ? removedPath : inputPath, outputPath);
}

async function uploadViaWebhook(localPath, filename) {
  const form = new FormData();
  form.append("file", await fsp.readFile(localPath), { filename, contentType: "image/png" });
  const sep = config.discordImageWebhookUrl.includes("?") ? "&" : "?";
  const response = await axios.post(`${config.discordImageWebhookUrl}${sep}wait=true`, form, {
    timeout: 30_000,
    headers: { ...form.getHeaders(), "User-Agent": DISCORD_USER_AGENT },
  });
  const url = response.data?.attachments?.[0]?.url;
  if (!url) throw new Error("Webhook upload did not return an attachment URL");
  return url;
}

async function uploadViaBotChannel(localPath, filename) {
  const form = new FormData();
  form.append("files[0]", await fsp.readFile(localPath), { filename, contentType: "image/png" });
  const response = await axios.post(`${DISCORD_API}/channels/${config.discordTargetChannelId}/messages`, form, {
    timeout: 30_000,
    headers: { ...form.getHeaders(), Authorization: `Bot ${config.discordBotToken}`, "User-Agent": DISCORD_USER_AGENT },
  });
  const url = response.data?.attachments?.[0]?.url;
  if (!url) throw new Error("Channel upload did not return an attachment URL");
  return url;
}

async function prepareImageUrl(sourceUrl) {
  const url = String(sourceUrl || "").trim();
  if (!url || !config.imageFix || config.dryRun) return url;
  if (!config.discordImageWebhookUrl && !config.discordTargetChannelId) {
    console.warn("Image fix/upload skipped: set DISCORD_IMAGE_WEBHOOK_URL or DISCORD_TARGET_CHANNEL_ID to host widget images on Discord CDN.");
    return url;
  }
  try {
    await fsp.mkdir(IMAGE_CACHE_DIR, { recursive: true });
    const key = sha256Short(url);
    const rawPath = path.join(IMAGE_CACHE_DIR, `${key}.img`);
    const pngPath = path.join(IMAGE_CACHE_DIR, `${key}-widget.png`);
    await downloadImage(url, rawPath);
    await processImage(rawPath, pngPath);
    const cdnUrl = config.discordImageWebhookUrl
      ? await uploadViaWebhook(pngPath, `waifu-${key}.png`)
      : await uploadViaBotChannel(pngPath, `waifu-${key}.png`);
    console.log("Prepared widget image via Discord CDN:", cdnUrl);
    return cdnUrl;
  } catch (error) {
    console.warn(`Image fix/upload failed (${error.message}); using source image URL.`);
    return url;
  }
}

function buildPayload(character, meta, imageUrl) {
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
        imageField("image", imageUrl || meta.image),
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
      headers: { Authorization: `Bot ${config.discordBotToken}`, "Content-Type": "application/json", Accept: "application/json", "User-Agent": DISCORD_USER_AGENT },
      validateStatus: (status) => (status >= 200 && status < 300) || status === 204,
    });
    console.log(`Discord widget updated: ${response.status}`);
    return true;
  } catch (error) {
    console.error("Discord PATCH failed", {
      status: error.response?.status,
      message: error.message,
      body: error.response?.data ? JSON.stringify(error.response.data).slice(0, 500) : undefined,
    });
    return false;
  }
}

async function main() {
  console.log("Starting Discord Waifu Widget update...");
  console.log(`Database size: ${WAIFUS.length}`);
  console.log(`Image fix/upload: ${config.imageFix ? "enabled" : "disabled"}`);
  console.log(`remove.bg: ${config.removeBg && config.removeBgApiKey ? "enabled" : "not configured"}`);

  const memory = loadMemory();
  const character = pickCharacter(memory);
  console.log(`Picked: ${character.name} (${character.source})`);
  console.log(`Previous: ${memory.lastName || "none"}`);

  const cached = memory.cached?.character?.globalId === character.globalId ? memory.cached : null;
  const meta = cached?.meta || await buildMetadata(character);
  const imageUrl = cached?.imageUrl || await prepareImageUrl(meta.image);
  const payload = buildPayload(character, meta, imageUrl);
  const nextMemory = buildNextMemory(character, memory, meta, imageUrl);

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
