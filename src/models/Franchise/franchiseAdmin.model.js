import mongoose from "mongoose";
import bcrypt from "bcryptjs";

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

export default mongoose.models.FranchiseAdmin ||
mongoose.model("FranchiseAdmin", franchiseAdminSchema);