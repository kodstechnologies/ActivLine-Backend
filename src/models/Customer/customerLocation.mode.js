import mongoose from "mongoose";

const customerLocation = mongoose.Schema(
  {
    email: {
      type: String,
      require: true,
    },
    location: {
      latitude: {
        type: Number,
        required: true,
      },

      longitude: {
        type: Number,
        required: true,
      },
    },
  },
  { timestamps: true },
);

const Location =
  mongoose.models.customerLocation ||
  mongoose.model("Location", customerLocation);

export default Location;
