
require("dotenv").config();

const mongoose = require("mongoose");
const ReferenceData = require("../models/ReferenceData");

const datasets = {
  "decision-tree": require("../data/decision-tree.json"),
  lifecycle: require("../data/lifecycle.json"),
  "needs-index": require("../data/needs-index.json"),
  psu: require("../data/psu.json"),
  states: require("../data/states.json"),
  glossary: require("../data/glossary.json"),
  about: require("../data/about.json"),
  news: require("../data/news.json"),
  "india-map": require("../data/india-map.json"),
  "india-terrain": require("../data/india-terrain.json")
};

async function seedReferenceData() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from backend/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB Atlas");

    for (const [key, data] of Object.entries(datasets)) {
      await ReferenceData.updateOne(
        { key },
        { $set: { data } },
        { upsert: true, runValidators: true }
      );

      console.log(`Imported: ${key}`);
    }

    console.log("Reference datasets imported successfully.");
  } catch (error) {
    console.error("Reference data import failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

seedReferenceData();
