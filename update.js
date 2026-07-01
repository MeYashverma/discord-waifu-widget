const axios = require("axios");
const fs = require("fs");

// =====================
// ENV
// =====================
const DISCORD_APP_ID = process.env.DISCORD_APP_ID;
const DISCORD_USER_ID = process.env.DISCORD_USER_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// detect manual github run
const IS_MANUAL =
  process.env.GITHUB_EVENT_NAME === "workflow_dispatch";

// =====================
// LOAD CHARACTER POOL
// =====================
const waifus =
  JSON.parse(
    fs.readFileSync(
      "./waifus_final.json",
      "utf8"
    )
  );

// =====================
// ELITE CHARACTERS
// =====================
const ELITE = [
  "Makima",
  "Tifa Lockhart",
  "Raiden Shogun",
  "2B",
  "Kafka",
  "Yor Forger",
  "Zero Two",
  "Asuka Langley",
  "Lucy Heartfilia",
  "Akeno Himejima",
  "Esdeath",
  "Camellya",
  "Firefly"
];

// =====================
// FORMAT NUMBER
// =====================
function formatNumber(num) {
  num = Number(num);

  if (num >= 1000000)
    return (num / 1000000).toFixed(1) + "M";

  if (num >= 1000)
    return (num / 1000).toFixed(1) + "K";

  return String(num);
}

// =====================
// PICK CHARACTER
// =====================
function getCharacter() {

  // manual run = random
  if (IS_MANUAL) {

    const index =
      Math.floor(
        Math.random() *
        waifus.length
      );

    return waifus[index];
  }

  // scheduled run = stable rotation
  const day =
    Math.floor(
      Date.now() /
      86400000
    );

  const index =
    day % waifus.length;

  return waifus[index];
}

// =====================
// ANILIST QUERY
// =====================
async function fetchCharacter(name) {

  const query = `
  query ($search: String) {
    Character(search: $search) {

      name {
        full
      }

      image {
        large
      }

      favourites

      description

      media(perPage:1) {
        nodes {
          title {
            romaji
          }
        }
      }
    }
  }`;

  const variables = {
    search: name
  };

  const response =
    await axios.post(
      "https://graphql.anilist.co",
      {
        query,
        variables
      }
    );

  return response
    .data
    .data
    .Character;
}

// =====================
// DETECT UNIVERSE
// =====================
function detectUniverse(
  source,
  override
) {

  if (override)
    return override;

  const s =
    source.toLowerCase();

  if (
    s.includes("genshin") ||
    s.includes("honkai") ||
    s.includes("wuthering") ||
    s.includes("zenless") ||
    s.includes("nte")
  ) {
    return "GACHA";
  }

  if (
    s.includes("final fantasy") ||
    s.includes("nier") ||
    s.includes("persona")
  ) {
    return "JRPG";
  }

  if (
    s.includes("resident evil") ||
    s.includes("league")
  ) {
    return "GAME";
  }

  return "ANIME";
}

// =====================
// POPULARITY SCORE
// =====================
function getPopularity(
  favs,
  source,
  name
) {

  let score =
    Number(favs);

  const s =
    source.toLowerCase();

  // franchise boosts
  if (
    s.includes("final fantasy")
  )
    score *= 5;

  if (
    s.includes("genshin")
  )
    score *= 4;

  if (
    s.includes("honkai")
  )
    score *= 4;

  if (
    s.includes("wuthering")
  )
    score *= 4;

  if (
    s.includes("chainsaw")
  )
    score *= 2;

  // elite boost
  if (
    ELITE.includes(name)
  ) {
    score += 10000;
  }

  return formatNumber(score);
}

// =====================
// ARCHETYPE ENGINE
// =====================
function getArchetype(
  character
) {

  const name =
    character.name.full;

  const desc =
    (
      character.description ||
      ""
    ).toLowerCase();

  if (
    name.includes("Makima")
  )
    return "DEVIL HUNTER";

  if (
    name.includes("Tifa")
  )
    return "MARTIAL ARTIST";

  if (
    name.includes("Raiden")
  )
    return "ARCHON";

  if (
    name === "2B"
  )
    return "ANDROID SOLDIER";

  if (
    name.includes("Kafka")
  )
    return "STELLAR HUNTER";

  if (
    name.includes("Yor")
  )
    return "ASSASSIN";

  if (
    name.includes("Zero Two")
  )
    return "HYBRID PILOT";

  if (
    desc.includes("assassin")
  )
    return "ASSASSIN";

  if (
    desc.includes("soldier")
  )
    return "SOLDIER";

  if (
    desc.includes("witch")
  )
    return "WITCH";

  return "MYSTERIOUS";
}

// =====================
// TIER ENGINE
// =====================
function getTier(
  favs,
  name
) {

  favs =
    Number(favs);

  if (
    ELITE.includes(name)
  )
    return "LEGENDARY";

  if (
    favs > 100000
  )
    return "GOD TIER";

  if (
    favs > 50000
  )
    return "ELITE WAIFU";

  if (
    favs > 15000
  )
    return "ICONIC";

  if (
    favs > 5000
  )
    return "POPULAR";

  return "RISING STAR";
}

// =====================
// BUILD PAYLOAD
// =====================
function buildPayload(
  data
) {

  return {
    data: {
      dynamic: [

        {
          type: 1,
          name: "waifu",
          value: data.name
        },

        {
          type: 1,
          name: "source",
          value: data.source
        },

        {
          type: 1,
          name: "fanbase",
          value: data.fanbase
        },

        {
          type: 1,
          name: "vibe",
          value: data.vibe
        },

        {
          type: 1,
          name: "rating",
          value: data.rating
        },

        {
          type: 1,
          name: "universe",
          value: data.universe
        },

        {
          type: 3,
          name: "image",
          value: {
            url: data.image
          }
        }
      ]
    }
  };
}

// =====================
// UPDATE DISCORD
// =====================
async function updateDiscord(
  payload
) {

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

  console.log(
    "Discord:",
    response.status
  );
}

// =====================
// MAIN
// =====================
(async () => {

  try {

    console.log(
      "Starting..."
    );

    const picked =
      getCharacter();

    console.log(
      "Picked:",
      picked.name
    );

    const character =
      await fetchCharacter(
        picked.name
      );

    const source =
      character
        .media
        ?.nodes?.[0]
        ?.title
        ?.romaji
      ||
      picked.source
      ||
      "Unknown";

    const universe =
      detectUniverse(
        source,
        picked.universe
      );

    const fanbase =
      getPopularity(
        character.favourites,
        source,
        character.name.full
      );

    const vibe =
      getArchetype(
        character
      );

    const rating =
      getTier(
        character.favourites,
        character.name.full
      );

    const data = {

      name:
        character.name.full,

      source:
        source,

      fanbase:
        fanbase,

      vibe:
        vibe,

      rating:
        rating,

      universe:
        universe,

      image:
        character.image.large
    };

    console.log(data);

    const payload =
      buildPayload(
        data
      );

    await updateDiscord(
      payload
    );

    console.log(
      "Success."
    );

  } catch (err) {

    console.error(
      "ERROR"
    );

    if (
      err.response
    ) {

      console.error(
        err.response.status
      );

      console.error(
        err.response.data
      );

    } else {

      console.error(
        err.message
      );
    }
  }

})();
