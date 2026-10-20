
const mongoose = require("mongoose");

const incubatorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    city: String,
    state: String,
    type: String,
    sectors: [String],
    website: String,
    email: String,
    phone: String,
    host: String,
    supportedBy: String,
    lat: Number,
    lng: Number,
  },
  {
    timestamps: true,
    strict: false,
  }
);

module.exports =
  mongoose.models.Incubator ||
  mongoose.model("Incubator", incubatorSchema);
