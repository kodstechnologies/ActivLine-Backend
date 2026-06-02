import mongoose from "mongoose";

const maintenanceAlertLogSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    scheduledStartDate: {
      type: String,
      required: true,
    },
    scheduledEndDate: {
      type: String,
      required: true,
    },
    isTwelveHourSmsSent: {
      type: Boolean,
      default: false,
    },
    isEndSmsSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const MaintenanceAlertLog =
  mongoose.models.MaintenanceAlertLog ||
  mongoose.model("MaintenanceAlertLog", maintenanceAlertLogSchema);

export default MaintenanceAlertLog;
