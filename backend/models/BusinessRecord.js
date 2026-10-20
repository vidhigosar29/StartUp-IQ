const mongoose = require("mongoose");

const businessRecordSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "products",
        "inventory",
        "sales",
        "expenses",
        "customers",
        "experiments",
      ],
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    amount: { type: Number, default: 0, min: 0 },
    quantity: { type: Number, default: 1, min: 0 },
    category: { type: String, trim: true, maxlength: 80, default: "General" },
    status: { type: String, trim: true, maxlength: 40, default: "Paid" },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true }
);

businessRecordSchema.index({ workspaceId: 1, type: 1, createdAt: -1 });

module.exports =
  mongoose.models.BusinessRecord ||
  mongoose.model("BusinessRecord", businessRecordSchema);
