const fs = require("fs");
const axios = require("axios");

// =====================
// ENV
// =====================

const DISCORD_APP_ID = process.env.DISCORD_APP_ID;
const DISCORD_USER_ID = process.env.DISCORD_USER_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const ANILIST_API = "https://graphql.anilist.co";

// =====================
// FILES
// =====================

const WAIFUS = require("./waifus_final.json");
const MEMORY_FILE = "./last_character.json";

// =====================
// HELPERS
// =====================

function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) {
    return { last: null, index: 0 };
  }
  return JSON.parse(fs.readFileSync(MEMORY_FILE));
}

function saveMemory(memory) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

function formatNumber(num) {
  num = Number(num);

  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";

  return String(num);
}

// =====================
// DETECT RUN TYPE
// =====================

function isManualRun() {
  return process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
}

// =====================
// PICK CHARACTER
// =====================

function pickCharacter() {
  const memory = loadMemory();

  let character;

  if (isManualRun()) {
    // random manual reroll
    do {
      character = WAIFUS[Math.floor(Math.random() * WAIFUS.length)];
    } while (character.name === memory.last);
  } else {
    // scheduled deterministic rotation
    let index = memory.index % WAIFUS.length;
    character = WAIFUS[index];

    if (character.name === memory.last) {
      index = (index + 1) % WAIFUS.length;
      character = WAIFUS[index];
    }

    memory.index = index + 1;
  }

  memory.last = character.name;
  saveMemory(memory);

  return character;
}

// =====================
// MANUAL OVERRIDES
// =====================

const overrides = {
  "Raiden Shogun": {
    vibe: "DOMINANT",
    rating: "GOD TIER",
    fanbase: 450000
  },

  "Makima": {
    vibe: "MANIPULATIVE",
    rating: "GOD TIER",
    fanbase: 420000
  },

  "Bayonetta": {
    vibe: "CONFIDENT",
    rating: "LEGENDARY",
    fanbase: 120000
  },

  "Kafka": {
    vibe: "MYSTERIOUS",
    rating: "ELITE WAIFU",
    fanbase: 280000
  },

  "Rias Gremory": {
    vibe: "SEDUCTIVE",
    rating: "ELITE WAIFU",
    fanbase: 320000
  },

  "Esdeath": {
    vibe: "DOMINANT",
    rating: "ELITE WAIFU",
    fanbase: 300000
  },

  "Zero Two": {
    vibe: "PLAYFUL",
    rating: "GOD TIER",
    fanbase: 500000
  }
};

// =====================
// VIBE ENGINE
// =====================

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
  "DEADLY"
];

function randomVibe() {
  return vibes[Math.floor(Math.random() * vibes.length)];
}

// =====================
// RATING ENGINE
// =====================

function generateRating(fanbase) {
  if (fanbase > 400000) return "GOD TIER";
  if (fanbase > 250000) return "ELITE WAIFU";
  if (fanbase > 150000) return "LEGENDARY";
  if (fanbase > 80000) return "ICONIC";
  if (fanbase > 30000) return "POPULAR";

  return "RISING STAR";
}

// =====================
// FRANCHISE FANBASE
// =====================

const franchiseWeights = {
  "Genshin Impact": 380000,
  "Chainsaw Man": 350000,
  "Re:Zero": 280000,
  "High School DxD": 300000,
  "One Piece": 400000,
  "Naruto": 420000,
  "Bleach": 300000,
  "League of Legends": 260000,
  "Nikke": 240000,
  "Zenless Zone Zero": 180000,
  "Wuthering Waves": 170000
};

function generateFanbase(character) {
  const base = franchiseWeights[character.source] || 90000;
  const variance = Math.floor(Math.random() * 50000);

  return base + variance;
}

// =====================
// ANILIST FETCH
// =====================

async function fetchAniList(name) {
  const query = `
  query ($search: String) {
    Character(search: $search) {
      favourites
      image {
        large
      }
    }
  }`;

  try {
    const response = await axios.post(
      ANILIST_API,
      {
        query,
        variables: {
          search: name
        }
      }
    );

    return {
      fanbase:
        response.data.data.Character?.favourites || null,

      image:
        response.data.data.Character?.image?.large || null
    };

  } catch {
    return null;
  }
}

// =====================
// BUILD METADATA
// =====================

async function buildMetadata(character) {
  const override = overrides[character.name];

  const ani = await fetchAniList(character.name);

  let fanbase =
    ani?.fanbase ||
    override?.fanbase ||
    generateFanbase(character);

  let vibe =
    override?.vibe ||
    randomVibe();

  let rating =
    override?.rating ||
    generateRating(fanbase);

  let image =
    ani?.image ||
    "https://i.imgur.com/4M34hi2.png";

  return {
    fanbase,
    vibe,
    rating,
    image
  };
}

// =====================
// BUILD PAYLOAD
// =====================

function buildPayload(character, meta) {
  return {
    data: {
      dynamic: [
        {
          type: 1,
          name: "waifu",
          value: character.name
        },
        {
          type: 1,
          name: "source",
          value: character.source
        },
        {
          type: 1,
          name: "fanbase",
          value: formatNumber(meta.fanbase)
        },
        {
          type: 1,
          name: "vibe",
          value: meta.vibe
        },
        {
          type: 1,
          name: "rating",
          value: meta.rating
        },
        {
          type: 1,
          name: "universe",
          value: character.universe
        },
        {
          type: 3,
          name: "image",
          value: {
            url: meta.image
          }
        }
      ]
    }
  };
}

// =====================
// UPDATE DISCORD
// =====================

async function updateDiscord(payload) {
  const url =
    `https://discord.com/api/v9/applications/${DISCORD_APP_ID}/users/${DISCORD_USER_ID}/identities/0/profile`;

  const response =
    await axios.patch(
      url,
      payload,
      {
        headers: {
          Authorization:
            `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type":
            "application/json"
        }
      }
    );

  console.log("Discord:", response.status);
}

// =====================
// MAIN
// =====================

(async () => {
  try {
    console.log("Starting update");

    const character =
      pickCharacter();

    console.log("Picked:", character.name);

    const meta =
      await buildMetadata(character);

    const payload =
      buildPayload(character, meta);

    await updateDiscord(payload);

    console.log("Done.");

  } catch (err) {
    console.error("ERROR");

    if (err.response) {
      console.error(err.response.status);
      console.error(err.response.data);
    } else {
      console.error(err.message);
    }
  }
})();
