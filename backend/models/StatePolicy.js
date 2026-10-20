
const mongoose = require("mongoose");

const statePolicySchema = new mongoose.Schema(
  {
    state: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

module.exports =
  mongoose.models.StatePolicy ||
  mongoose.model("StatePolicy", statePolicySchema);
