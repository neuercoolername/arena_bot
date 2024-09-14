import fetch from "node-fetch";
import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import http from "http";

dotenv.config();

const botApiToken = process.env.BOT_API_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const arenaCollectionApiUrl = process.env.ARENA_COLLECTION_API_URL;
const mongoUri = process.env.MONGO_URI;
const port = process.env.PORT || 3000;

const bot = new Telegraf(botApiToken);
let client;
let db;

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
    const response = await fetch(arenaCollectionApiUrl);
    const data = await response.json();
    const currentElements = data.contents;

    const storedElementIds = await getStoredElementIds();

    const newElements = currentElements.filter(
      (element) => !storedElementIds.has(element.id)
    );

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
  if (newElements.length === 1) {
    const element = newElements[0];
    const message = `${element.user.username} has added "${element.title}" to the collection!`;
    bot.telegram.sendMessage(chatId, message);
  } else {
    const users = [
      ...new Set(newElements.map((element) => element.user.username)),
    ];
    const message = `New stuff has been added to the collection, by ${users.join(
      ", "
    )}`;
    bot.telegram.sendMessage(chatId, message);
  }
}

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.end("Arena Bot is running!");
});

server.listen(port, () => {
  console.log(`HTTP server running on port ${port}`);
});

async function main() {
  await connectToMongoDB();
  await checkForNewElements();
  // setInterval(checkForNewElements, 6 * 60 * 60 * 1000);
  setInterval(checkForNewElements, 60 * 1000);
}

main().catch(console.error);

process.on("SIGINT", async () => {
  console.log("Closing MongoDB connection...");
  await client.close();
  process.exit(0);
});

bot.launch();
