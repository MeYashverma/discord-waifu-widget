const axios = require("axios");
const fs = require("fs");

// ============================
// ENV VARIABLES
// ============================

const DISCORD_APP_ID = process.env.DISCORD_APP_ID;
const DISCORD_USER_ID = process.env.DISCORD_USER_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;


// ============================
// LOAD WAIFU DATABASE
// ============================

const waifus =
    JSON.parse(
        fs.readFileSync(
            "./waifus_final.json",
            "utf8"
        )
    );


// ============================
// FORMAT NUMBERS
// ============================

function formatNumber(num) {
    num = Number(num);

    if (num >= 1000000)
        return (num / 1000000).toFixed(1) + "M";

    if (num >= 1000)
        return (num / 1000).toFixed(1) + "K";

    return String(num);
}


// ============================
// DAILY SEEDED RANDOM
// same waifu entire day
// changes every day
// ============================

function getDailyWaifu() {

    const today = new Date();

    const seed =
        today.getUTCFullYear() * 10000 +
        (today.getUTCMonth() + 1) * 100 +
        today.getUTCDate();

    const random =
        Math.abs(
            Math.sin(seed) * 10000
        );

    const index =
        Math.floor(random) %
        waifus.length;

    return waifus[index];
}


// ============================
// ANILIST QUERY
// ============================

async function fetchAniList(characterName) {

    const query = `
    query ($search: String) {
      Character(search: $search) {
        name {
          full
        }

        favourites

        image {
          large
        }

        media(sort: POPULARITY_DESC) {
          nodes {
            title {
              romaji
            }
          }
        }
      }
    }
    `;

    const response =
        await axios.post(
            "https://graphql.anilist.co",
            {
                query: query,
                variables: {
                    search: characterName
                }
            },
            {
                headers: {
                    "Content-Type":
                        "application/json"
                }
            }
        );

    const char =
        response.data.data.Character;

    let source =
        "Unknown";

    if (
        char.media &&
        char.media.nodes &&
        char.media.nodes.length > 0
    ) {
        source =
            char.media.nodes[0]
                .title.romaji;
    }

    return {
        name:
            char.name.full,

        favourites:
            char.favourites || 0,

        source: source,

        image:
            char.image.large
    };
}


// ============================
// MEME STATUS LOGIC
// ============================

function getVibe(favs) {

    if (favs < 3000)
        return "WHO?";

    if (favs < 15000)
        return "CUTE";

    if (favs < 40000)
        return "SMASH";

    if (favs < 80000)
        return "HEAR ME OUT";

    if (favs < 150000)
        return "MOMMY";

    return "EVERYONE SIMPS";
}


function getRating(favs) {

    if (favs < 5000)
        return "MID";

    if (favs < 20000)
        return "GOOD";

    if (favs < 50000)
        return "DOWN BAD";

    if (favs < 100000)
        return "GOONED";

    if (favs < 200000)
        return "GOD TIER";

    return "TOUCH GRASS";
}


// ============================
// DISCORD PATCH
// ============================

async function updateDiscord(data) {

    const payload = {
        data: {
            dynamic: [

                {
                    type: 1,
                    name: "waifu",
                    value:
                        data.name
                },

                {
                    type: 1,
                    name: "source",
                    value:
                        data.source
                },

                {
                    type: 1,
                    name: "fanbase",
                    value:
                        formatNumber(
                            data.favourites
                        )
                },

                {
                    type: 1,
                    name: "vibe",
                    value:
                        getVibe(
                            data.favourites
                        )
                },

                {
                    type: 1,
                    name: "rating",
                    value:
                        getRating(
                            data.favourites
                        )
                }

            ]
        }
    };

    // add image if exists
    if (data.image) {

        payload.data.dynamic.push({

            type: 3,

            name: "image",

            value: {
                url: data.image
            }

        });
    }

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
        "Discord updated:",
        response.status
    );
}


// ============================
// MAIN
// ============================

(async () => {

    try {

        console.log(
            "Starting waifu update..."
        );

        const todayWaifu =
            getDailyWaifu();

        console.log(
            "Selected:",
            todayWaifu
        );

        const data =
            await fetchAniList(
                todayWaifu
            );

        console.log(
            "AniList found:",
            data.name
        );

        console.log(
            "Source:",
            data.source
        );

        console.log(
            "Favorites:",
            data.favourites
        );

        await updateDiscord(
            data
        );

    }
    catch (err) {

        console.error(
            "ERROR"
        );

        if (err.response) {

            console.error(
                err.response.status
            );

            console.error(
                err.response.data
            );

        }
        else {

            console.error(
                err.message
            );

        }
    }

})();
