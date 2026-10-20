
require("dotenv").config();

const mongoose = require("mongoose");
const Scheme = require("../models/Scheme");
const StatePolicy = require("../models/StatePolicy");

const schemesData = require("../data/schemes.json");
const stateData = require("../data/state-schemes.json");
const Incubator = require("../models/Incubator");
const incubatorsData = require("../data/incubators.json");

async function seedDatabase() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from backend/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB Atlas");

    const schemes = schemesData.schemes || [];
    const statePolicies = stateData.states || [];

    if (schemes.length === 0) {
      throw new Error("No central schemes found in schemes.json");
    }

    if (statePolicies.length === 0) {
      throw new Error("No state policies found in state-schemes.json");
    }

    await Scheme.bulkWrite(
      schemes.map((scheme) => ({
        updateOne: {
          filter: { slug: scheme.slug },
          update: { $set: scheme },
          upsert: true,
        },
      }))
    );

    await StatePolicy.bulkWrite(
      statePolicies.map((policy) => ({
        updateOne: {
          filter: { state: policy.state },
          update: { $set: policy },
          upsert: true,
        },
      }))
    );





    const schemeCount = await Scheme.countDocuments();
    const stateCount = await StatePolicy.countDocuments();

    console.log("Database seeding completed!");
    console.log(`Central schemes in database: ${schemeCount}`);
    console.log(`State/UT policies in database: ${stateCount}`);



    
    const incubators = incubatorsData.incubators || [];

    if (incubators.length === 0) {
      throw new Error("No incubators found in incubators.json");
    }

    await Incubator.bulkWrite(
      incubators.map((incubator) => ({
        updateOne: {
          filter: {
            name: incubator.name,
            city: incubator.city,
          },
          update: { $set: incubator },
          upsert: true,
        },
      }))
    );

    const incubatorCount = await Incubator.countDocuments();

    console.log(`Incubators in database: ${incubatorCount}`);

  } catch (error) {
    console.error("Database seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedDatabase();
