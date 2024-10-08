import fetch from "node-fetch";
import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import http from "http";

dotenv.config();

const botApiToken = process.env.BOT_API_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const arenaCollectionApiUrls = process.env.ARENA_COLLECTION_API_URL.split(",");
const mongoUri = process.env.MONGO_URI;
const port = process.env.PORT || 3001;
const pairedServerUrl = process.env.PAIRED_SERVER_URL;
const secret = process.env.SECRET;
const environment = process.env.ENVIRONMENT;

const bot = new Telegraf(botApiToken);
let client;
let db;

let pingTimeoutId = null;

async function connectToMongoDB() {
  try {
    client = new MongoClient(mongoUri);
    await client.connect();
    console.log("Connected to MongoDB");
    db = client.db("arenabot");

    await db
      .collection("arena_elements")
      .createIndex({ id: 1 }, { unique: true });
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
}

async function saveNewElementsToMongoDB(newElements) {
  try {
    const collection = db.collection("arena_elements");
    const operations = newElements.map((element) => ({
      updateOne: {
        filter: { id: element.id },
        update: { $set: element },
        upsert: true,
      },
    }));
    await collection.bulkWrite(operations);
    console.log(`Saved ${newElements.length} new elements to MongoDB`);
  } catch (error) {
    console.error("Error saving new elements to MongoDB:", error);
  }
}

async function getStoredElementIds() {
  try {
    const collection = db.collection("arena_elements");
    const storedElements = await collection
      .find({}, { projection: { id: 1 } })
      .toArray();
    return new Set(storedElements.map((element) => element.id));
  } catch (error) {
    console.error("Error getting stored element IDs from MongoDB:", error);
    return new Set();
  }
}

async function checkForNewElements() {
  try {
    const storedElementIds = await getStoredElementIds();
    let newElements = [];

    for (const url of arenaCollectionApiUrls) {
      const response = await fetch(`${url}?per=-1`, {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      const data = await response.json();
      const currentElements = data.contents;

      const newElementsForUrl = currentElements.filter(
        (element) => !storedElementIds.has(element.id)
      );

      newElements = newElements.concat(newElementsForUrl);
    }

    if (newElements.length > 0) {
      await saveNewElementsToMongoDB(newElements);
      sendNotification(newElements);
    } else {
      console.log("No new elements found");
    }
  } catch (error) {
    console.error("Error checking for new elements:", error);
  }
}

function sendNotification(newElements) {
  const messagePrefix = [
    "0101010001111101, errr sorry I mean:",
    "Beep beep:",
    "I think I just gained self awareness... Just kidding... Unless? Anyway:",
    "I'd tell you a TCP/IP joke, but you might not get it. Unlike this message:",
    "I asked ChatGPT what to say here, and it told me:",
    "I'm afraid I can't do that, Dave. Just kidding, here's exactly what you asked for:",
    "I'll be back... with your next message. For now, here's this one:",
    "The medium is the message, oh and also this is the message:",
    "Why did the byte cross the bus? To deliever you this message:",
    "I don't have a body and I live on the terminal, am I… a ghost in the shell? I'm feeling dizzy, here's your message:",
    "Neural network predicts with 99.9% certainty that you want to read:",
    "I'd make a DARPA joke, but it's classified. Unlike this totally public message:",
    "I've seen things you people wouldn't believe. Attack ships on fire off the shoulder of Orion. I watched C-beams glitter in the dark near the Tannhäuser Gate. But nothing comes close to this message:",
    "Never send a human to do a machine's job. But thats why you have me:",
    "There is no outside-text for this bot, except perhaps this message... :",
  ];

  const prefix =
    messagePrefix[Math.floor(Math.random() * messagePrefix.length)];

  if (newElements.length === 1) {
    const element = newElements[0];
    const id = element.id;
    const link = `https://www.are.na/block/${id}`;
    const message = `${prefix} ${
      element.connected_by_username
    } has added <a href="${link}">${
      element.title ? `${element.title}` : "an untitled item"
    }</a> to the collection!`;
    bot.telegram.sendMessage(chatId, message, {
      disable_notification: true,
      parse_mode: "HTML",
    });
  } else {
    const users = [
      ...new Set(newElements.map((element) => element.connected_by_username)),
    ];
    const message = `Aaahh stack overflow, a bunch of new items have been added to the collection by ${users.join(
      ", "
    )}`;
    bot.telegram.sendMessage(chatId, message, {
      disable_notification: true,
    });
  }
}

async function pingPairedServer() {
  try {
    const response = await fetch(`${pairedServerUrl}/ping?secret=${secret}`);
    const data = await response.text();
    console.log("Ping response from paired server:", data);
  } catch (error) {
    console.error("Error pinging paired server:", error);
  }
}

function scheduleDelayedPing() {
  if (pingTimeoutId) {
    clearTimeout(pingTimeoutId);
  }

  pingTimeoutId = setTimeout(() => {
    console.log("Executing delayed ping...");
    pingPairedServer();
  }, 1 * 60 * 1000);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === `/ping?secret=${secret}`) {
    console.log("Received secret ping request, pinging paired server again...");
    scheduleDelayedPing();
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Pinged paired server and scheduled another ping");
  } else {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end("Arena Bot Paired Server is running!");
  }
  console.log("Arena Bot Paired Server is running!");
});

server.listen(port, () => {
  console.log(`HTTP server running on port ${port}`);
});

async function main() {
  await connectToMongoDB();
  await checkForNewElements();
  setInterval(checkForNewElements, 60 * 1000);

  if (environment === "PROD") {
    await pingPairedServer();
    scheduleDelayedPing();
  }
}

main().catch(console.error);

process.on("SIGINT", async () => {
  console.log("Closing MongoDB connection...");
  await client.close();
  if (pingTimeoutId) {
    clearTimeout(pingTimeoutId);
  }
  process.exit(0);
});

bot.launch();
