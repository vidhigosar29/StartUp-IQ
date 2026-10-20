
const mongoose = require("mongoose");

const stateIncentiveSchema = new mongoose.Schema(
  {
    incentiveId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    state: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    policy: { type: String, default: "" },
    period: { type: String, default: "" },
    portal: { type: String, default: "" },
    nodalAgency: { type: String, default: "" },
    name: {
      type: String,
      required: true,
      trim: true
    },
    type: { type: String, default: "Other", index: true },
    benefit: { type: String, default: "" },
    description: { type: String, default: "" },
    eligibility: { type: String, default: "" },
    url: { type: String, default: "" },
    sectors: { type: [String], default: [] },
    contactEmail: { type: String, default: "" },
    contactPhone: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.StateIncentive ||
  mongoose.model("StateIncentive", stateIncentiveSchema);
