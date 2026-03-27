import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const franchiseAdminSchema = new mongoose.Schema(
{
  accountId: {
    type: String,
    required: true
  },

  name: {
    type: String,
    required: true
  },

  email: {
    type: String,
    required: true,
    unique: true
  },

  password: {
    type: String,
    required: true,
    select: false
  },

  role: {
    type: String,
    default: "FRANCHISE_ADMIN"
  },

  status: {
    type: String,
    default: "ACTIVE"
  },

  refreshToken: String,

  resetOTP: { type: String, default: null },
  resetOTPExpiry: { type: Date, default: null },

  profileImage: String,

  fcmTokens: [
    {
      token: String,
      deviceId: String,
      lastUsedAt: Date
    }
  ]

},
{ timestamps: true }
);

// password hash
franchiseAdminSchema.pre("save", async function(){
  if(!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password,10);
});

franchiseAdminSchema.methods.comparePassword = async function(password){
  return bcrypt.compare(password,this.password);
};

franchiseAdminSchema.methods.generateAccessToken = function(){
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      role: this.role,
      accountId: this.accountId
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1d"
    }
  );
};

franchiseAdminSchema.methods.generateRefreshToken = function(){
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "10d"
    }
  );
};

export default mongoose.models.FranchiseAdmin ||
mongoose.model("FranchiseAdmin", franchiseAdminSchema);
