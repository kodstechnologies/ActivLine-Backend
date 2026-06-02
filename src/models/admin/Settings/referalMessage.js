import mongoose from "mongoose";

const referalMessage = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);
export default mongoose.model("ReferalMessage", referalMessage);
