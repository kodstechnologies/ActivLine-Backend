// import mongoose from "mongoose";

// const customerSchema = new mongoose.Schema(
//   {
//     // 🔹 Activline core fields
//     userGroupId: {
//       type: Number,
//       required: true,
//     },

//     accountId: {
//       type: String,
//       required: true,
//     },

//     userName: {
//       type: String,
//       required: true,
//     },

//     phoneNumber: {
//       type: String,
//       required: true,
//     },

//     emailId: {
//       type: String,
//     },

//     // 🔹 Optional fields
//     userState: String,
//     userType: String,
//     activationDate: String,

//     firstName: String,
//     lastName: String,

//     address: {
//       line1: String,
//       city: String,
//       pin: String,
//       state: String,
//       country: String,
//     },
// installationAddress: {
//   line2: String,
//   city: String,
//   pin: String,
//   state: String,
//   country: String,
// },

//     // 🔹 External system reference
//     activlineUserId: {
//       type: String,
//     },

//     // 🔹 Files
//     documents: {
//   idFile: String,
//   addressFile: String,
//   cafFile: String,
//   reportFile: String,
//   signFile: String,
//   profilePicFile: String,
// },


//     // 🔹 Audit
//     rawPayload: {
//       type: Object,
//     },

//     status: {
//       type: String,
//       default: "ACTIVE",
//     },
//     referral: {
//   code: {
//     type: String,
  
//     index: true
//   },
//   referredCount: {
//     type: Number,
//     default: 0
//   }
// },
//   },
//   { timestamps: true }
// );

// // ✅ Prevent OverwriteModelError
// const Customer =
//   mongoose.models.Customer ||
//   mongoose.model("Customer", customerSchema);

// export default Customer;


import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const customerSchema = new mongoose.Schema(
  {
    /* =================================
       🔹 CORE ACTIVLINE FIELDS
    ================================= */
    userGroupId: {
      type: Number,
      required: true,
    },

    accountId: {
      type: String,
      required: true,
    },

    userName: {
      type: String,
      required: true,
    },

    phoneNumber: {
      type: String,
      required: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
    },

    emailId: {
      type: String,
      index: true,
    },

    /* =================================
       🔹 OPTIONAL FIELDS
    ================================= */
    userState: String,
    userType: String,
    activationDate: String,
    expirationDate: String,
    customActivationDate: String,
    customExpirationDate: String,

    firstName: String,
    lastName: String,
    altPhoneNumber: String,
    altEmailId: String,

    /* =================================
       🔹 CUSTOMER ADDRESS
    ================================= */
    address: {
      line1: String,
      // line2: String,
      city: String,
      pin: String,
      state: String,
      country: String,
    },

    /* =================================
       🔹 INSTALLATION ADDRESS (FIXED)
    ================================= */
    installationAddress: {
      // line1: String,  // ✅ ADDED THIS (IMPORTANT FIX)
      line2: String,
      city: String,
      pin: String,
      state: String,
      country: String,
    },

    /* =================================
       🔹 BILLING / FLAGS
    ================================= */
    overridePriceEnable: String,
    overrideAmount: String,
    overrideAmountBasedOn: String,
    createBilling: String,
    disableUserIpAuth: String,
    disableUserMacAuth: String,
    disableUserHotspotAuth: String,

    /* =================================
       🔹 CAF
    ================================= */
    cafNum: String,

    /* =================================
       🔹 EXTERNAL REFERENCE
    ================================= */
    activlineUserId: {
      type: String,
    },

    // 🔹 Notification Tokens (Multi-device support)
    fcmTokens: {
      type: [String],
      default: [],
    },

    /* =================================
       🔹 FILES
    ================================= */
    documents: {
      idFile: String,
      addressFile: String,
      cafFile: String,
      reportFile: String,
      signFile: String,
      profilePicFile: String,
    },

    /* =================================
       🔹 STATUS
    ================================= */
    status: {
      type: String,
      default: "ACTIVE",
    },

    /* =================================
       🔹 MAINTENANCE DATES
    ================================= */
    maintenance: {
      lastDate: String,
      endDate: String,
    },

    /* =================================
       🔹 REFERRAL
    ================================= */
 referral: {
  code: {
    type: String,
    index: true,
    unique: true,   // optional but recommended
    sparse: true,   // important if using unique
    trim: true,
  },
  referredCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  getRewards: {
    type: String,
    trim: true,
    default: "1 Month FREE",
  },
  giveRewards: {
    type: String,
    trim: true,
    default: "$500 off",
  },
},



    /* =================================
       🔹 AUDIT
    ================================= */
    rawPayload: {
      type: Object,
    },

    /* =================================
       🔹 OTP (Password Reset)
    ================================= */
    otp: {
      code: String,
      expiresAt: Date,
    },
  },
  { timestamps: true }
);

// 🔐 Hash password before saving
customerSchema.pre("save", async function () {
  // 🔹 1. Hash Password (if modified)
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }

  // 🔹 2. Generate Referral Code (Only if new & has firstName)
  if (this.isNew && this.firstName) {
    const firstName = this.firstName
      .toUpperCase()
      .replace(/\s+/g, "");

    const lastCustomer = await mongoose.models.Customer.findOne({
      "referral.code": new RegExp(`^${firstName}`)
    }).sort({ "referral.code": -1 });

    let nextNumber = 1;

    if (lastCustomer?.referral?.code) {
      const lastCode = String(lastCustomer.referral.code);
      const match = lastCode.match(/(\d+)$/);
      const lastNumber = match ? parseInt(match[1], 10) : 0;
      nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
    }

    let paddedNumber = String(nextNumber).padStart(4, "0");
    let candidate = `${firstName}${paddedNumber}`;
    let attempts = 0;

    while (
      attempts < 20 &&
      (await mongoose.models.Customer.exists({ "referral.code": candidate }))
    ) {
      nextNumber += 1;
      paddedNumber = String(nextNumber).padStart(4, "0");
      candidate = `${firstName}${paddedNumber}`;
      attempts += 1;
    }

    if (attempts >= 20) {
      // Fallback: add a random suffix to avoid unique conflicts
      const randomSuffix = String(crypto.randomInt(0, 10000)).padStart(4, "0");
      candidate = `${firstName}${randomSuffix}`;
    }

    this.referral = {
      code: candidate,
      referredCount: 0
    };
  }

});



// 🔍 Compare password method
customerSchema.methods.comparePassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

const Customer =
  mongoose.models.Customer ||
  mongoose.model("Customer", customerSchema);

export default Customer;
