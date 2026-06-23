import mongoose from "mongoose";

const OutsourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    paymentType: {
      type: String,
      enum: ["one-time", "per-unit", "recurring"],
      default: "one-time",
    },
    amount: { type: Number, min: 0, default: 0 },
    rate: { type: Number, min: 0, default: 0 },
    units: { type: Number, min: 0, default: 0 },
    frequency: {
      type: String,
      enum: ["weekly", "monthly"],
      default: "monthly",
    },
    duration: { type: Number, min: 0, default: 0 },
    hours: { type: Number, min: 0, default: 0 },
    total: { type: Number, min: 0, default: 0 },
    fundedUnits: { type: Number, default: 0, min: 0 },
    fundedAmount: { type: Number, default: 0, min: 0 },
    fundingHistory: [
      {
        amount: Number,
        unitsFunded: Number,
        date: { type: Date, default: Date.now },
      },
    ],
    fundStatus: {
      type: String,
      enum: ["Not Initiated", "In Escrow", "Released"],
      default: "Not Initiated",
    },
    locationPreference: {
      type: String,
      trim: true,
      default: "Remote",
    },
    remote: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    applications: [{ type: mongoose.Schema.Types.ObjectId, ref: "Application" }],
    applicationCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true, index: true },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },
    views: { type: Number, default: 0 },
    skills: [{ type: String, trim: true }],
    applicationDeadline: { type: Date },
  },
  {
    timestamps: true,
  }
);

// ========== FIXED PRE-SAVE HOOK - NO 'next' PARAMETER ==========
OutsourceSchema.pre("save", function () {
  // Update application count
  if (this.isModified("applications")) {
    this.applicationCount = this.applications.length;
  }
  
  // Calculate total payment
  if (this.paymentType === "one-time") {
    this.total = this.amount || 0;
  } else if (this.paymentType === "per-unit") {
    this.total = (this.rate || 0) * (this.units || 0);
  } else if (this.paymentType === "recurring") {
    this.total = (this.rate || 0) * (this.duration || 0);
  }
});

// ========== INSTANCE METHODS ==========
OutsourceSchema.methods.closeOutsource = function () {
  this.status = "closed";
  this.isActive = false;
  return this.save();
};

OutsourceSchema.methods.incrementViews = function () {
  this.views += 1;
  return this.save();
};

OutsourceSchema.methods.isDeadlinePassed = function () {
  if (!this.applicationDeadline) return false;
  return new Date() > this.applicationDeadline;
};

OutsourceSchema.methods.addFunding = function (amount, unitsFunded) {
  this.fundedAmount += amount;
  this.fundedUnits += unitsFunded;
  this.fundingHistory.push({ amount, unitsFunded, date: new Date() });
  if (this.fundedAmount >= this.total) {
    this.fundStatus = "In Escrow";
  }
  return this.save();
};

// ========== STATIC METHODS ==========
OutsourceSchema.statics.findActive = function () {
  return this.find({
    isActive: true,
    status: "active",
    $or: [
      { applicationDeadline: null },
      { applicationDeadline: { $exists: false } },
      { applicationDeadline: { $gte: new Date() } },
    ],
  });
};

OutsourceSchema.statics.findByUser = function (userId) {
  return this.find({ createdBy: userId }).sort({ createdAt: -1 });
};

// ========== INDEXES ==========
OutsourceSchema.index({ createdBy: 1, createdAt: -1 });
OutsourceSchema.index({ status: 1, isActive: 1 });
OutsourceSchema.index({ skills: 1 });
OutsourceSchema.index({ applicationDeadline: 1 });

export const Outsource = mongoose.model("Outsource", OutsourceSchema);