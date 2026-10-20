
const mongoose = require("mongoose");

const WorkspaceRecordSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "profile",
        "product",
        "material",
        "sale",
        "expense",
        "customer",
        "experiment",
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

WorkspaceRecordSchema.index({ owner: 1, type: 1, createdAt: -1 });

module.exports =
  mongoose.models.WorkspaceRecord ||
  mongoose.model("WorkspaceRecord", WorkspaceRecordSchema);
