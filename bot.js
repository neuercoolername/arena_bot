import fetch from "node-fetch";
import { Telegraf } from "telegraf";
import dotenv from "dotenv";

dotenv.config();

const botApiToken = process.env.BOT_API_TOKEN;
const arenaCollectionApiUrl = process.env.ARENA_COLLECTION_API_URL;

console.log(botApiToken);

const bot = new Telegraf(botApiToken);

async function checkForNewElements() {
  const response = await fetch(
    "https://api.are.na/v2/channels/protocol-awo5urlnkjm"
  );
  const data = await response.json();

  console.log(data);
}

// setInterval(checkForNewElements, 60000);

checkForNewElements();

bot.launch();
