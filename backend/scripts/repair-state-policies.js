
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const StatePolicy = require("../models/StatePolicy");
const stateData = require("../data/state-schemes.json");

async function repairStatePolicies() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error(
        "MONGODB_URI missing. Run this script from the backend folder."
      );
    }

    const policies = stateData.states;

    if (!Array.isArray(policies) || policies.length === 0) {
      throw new Error("Source JSON has no state policies.");
    }

    // Validate the source before touching the database.
    for (const policy of policies) {
      if (!policy.state || !Array.isArray(policy.schemes)) {
        throw new Error(`Invalid policy data for: ${policy.state || "unknown state"}`);
      }

      if (policy.schemes.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
        throw new Error(`Invalid incentive objects in: ${policy.state}`);
      }
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");

    // Back up existing records first.
    const existing = await StatePolicy.find({}).lean();
    const backupDir = path.join(__dirname, "..", "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const backupFile = path.join(
      backupDir,
      `state-policies-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    );

    fs.writeFileSync(backupFile, JSON.stringify(existing, null, 2), "utf8");
    console.log(`Backup saved: ${backupFile}`);
    console.log(`Existing records backed up: ${existing.length}`);

    // Update only the state policy collection.
    const operations = policies.map((policy) => ({
      updateOne: {
        filter: { state: policy.state },
        update: { $set: policy },
        upsert: true,
      },
    }));

    const result = await StatePolicy.bulkWrite(operations);

    console.log("State policies updated.");
    console.log(`Matched: ${result.matchedCount}`);
    console.log(`Modified: ${result.modifiedCount}`);
    console.log(`Inserted: ${result.upsertedCount}`);

    // Verify stored data.
    const firstPolicy = await StatePolicy.findOne({
      state: policies[0].state,
    }).lean();

    console.log("Verification state:", firstPolicy.state);
    console.log(
      "First stored incentive type:",
      typeof firstPolicy.schemes?.[0]
    );
    console.log(
      "First stored incentive:",
      JSON.stringify(firstPolicy.schemes?.[0], null, 2)
    );

    const badRecords = await StatePolicy.find({}).lean();
    const malformed = badRecords.filter(
      (policy) =>
        Array.isArray(policy.schemes) &&
        policy.schemes.some((item) => typeof item === "string")
    );

    console.log(`Records still containing string incentives: ${malformed.length}`);
  } catch (error) {
    console.error("State policy repair failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

repairStatePolicies();
