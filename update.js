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
    do {
      character = WAIFUS[Math.floor(Math.random() * WAIFUS.length)];
    } while (character.name === memory.last);
  } else {
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
// FALLBACK GENERATORS
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

function generateRating(fanbase) {
  if (fanbase > 400000) return "GOD TIER";
  if (fanbase > 250000) return "ELITE WAIFU";
  if (fanbase > 150000) return "LEGENDARY";
  if (fanbase > 80000) return "ICONIC";
  if (fanbase > 30000) return "POPULAR";
  return "RISING STAR";
}

const franchiseWeights = {
  "Genshin Impact": 380000,
  "Chainsaw Man": 350000,
  "Re:Zero": 280000,
  "High School DxD": 300000,
  "Fairy Tail": 280000,
  "One Piece": 400000
};

function generateFanbase(character) {
  const base = franchiseWeights[character.source] || 100000;
  return base + Math.floor(Math.random() * 50000);
}

// =====================
// DESCRIPTION PARSER
// =====================
function cleanHTML(text) {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/~!/g, "")
    .replace(/!~/g, "")
    .replace(/\n/g, " ")
    .trim();
}

// crude parser but effective
function extractBioAndDescription(desc) {
  if (!desc) {
    return {
      bio: "Unknown Character",
      description: "No profile available"
    };
  }

  const cleaned = cleanHTML(desc);

  // keyword extraction
  let bio = "Anime Character";
  let detail = "Profile Unavailable";

  if (/hunter/i.test(cleaned)) bio = "Devil Hunter";
  else if (/mage/i.test(cleaned)) bio = "Mage";
  else if (/archon/i.test(cleaned)) bio = "Archon";
  else if (/soldier/i.test(cleaned)) bio = "Combat Specialist";
  else if (/student/i.test(cleaned)) bio = "Elite Student";
  else if (/princess/i.test(cleaned)) bio = "Royal Princess";
  else if (/witch/i.test(cleaned)) bio = "Magic User";

  // first sentence fallback
  const sentence =
    cleaned.split(".")[0]?.slice(0, 45) || "";

  detail = sentence || detail;

  return {
    bio,
    description: detail
  };
}

// =====================
// ANILIST FETCH
// =====================
async function fetchAniList(name) {
  const query = `
  query ($search: String) {
    Character(search: $search) {
      favourites
      age
      bloodType
      description

      dateOfBirth {
        day
        month
        year
      }

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
        variables: { search: name }
      }
    );

    return response.data.data.Character || null;

  } catch {
    return null;
  }
}

// =====================
// BUILD METADATA
// =====================
async function buildMetadata(character) {
  const ani = await fetchAniList(character.name);

  const fanbase =
    ani?.favourites ||
    generateFanbase(character);

  const vibe = randomVibe();

  const rating =
    generateRating(fanbase);

  const age =
    ani?.age || "Unknown";

  const blood =
    ani?.bloodType || "Unknown";

  const parsed =
    extractBioAndDescription(
      ani?.description
    );

  const image =
    ani?.image?.large ||
    "https://i.imgur.com/4M34hi2.png";

  return {
    fanbase,
    vibe,
    rating,
    age,
    blood,
    bio: parsed.bio,
    description: parsed.description,
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
          name: "age",
          value: String(meta.age)
        },
        {
          type: 1,
          name: "blood",
          value: meta.blood
        },
        {
          type: 1,
          name: "bio",
          value: meta.bio
        },
        {
          type: 1,
          name: "description",
          value: meta.description
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

  const response = await axios.patch(
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
    console.log("Starting update...");

    const character =
      pickCharacter();

    console.log(
      "Picked:",
      character.name
    );

    const meta =
      await buildMetadata(character);

    const payload =
      buildPayload(
        character,
        meta
      );

    await updateDiscord(payload);

    console.log("Widget updated.");

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
