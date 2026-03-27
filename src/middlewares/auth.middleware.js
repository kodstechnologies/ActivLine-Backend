import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/AsyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import Admin from "../models/auth/auth.model.js";
// import Customer from "../models/Customer/user.model.js";
import StaffStatus from "../models/staff/Staff.model.js";
import { ROLES } from "../constants/roles.js";
import CustomerSession from "../models/Customer/customerLogin.model.js";
import { refreshAccessToken } from "../services/auth/refresh.service.js";

/**
 * 🔐 Verify JWT (NON-BREAKING, PRODUCTION SAFE)
 */
export const verifyJWT = asyncHandler(async (req, _res, next) => {
  const res = _res;
  const hasBearer = req.headers.authorization?.startsWith("Bearer ");
  let token;

  // 1️⃣ Extract token (cookie OR header)
  if (hasBearer) {
    token = req.headers.authorization.slice(7);
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  // 2️⃣ No token
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (matches login cookie behavior)
  };

  if (!token) {
    if (!hasBearer && req.cookies?.refreshToken) {
      const refreshed = await refreshAccessToken({
        refreshToken: req.cookies.refreshToken,
      });

      if (res?.cookie) {
        res.cookie("accessToken", refreshed.accessToken, cookieOptions);
      }

      req.user = {
        _id: refreshed.user._id,
        role: (refreshed.user.role || "CUSTOMER").toUpperCase(),
        email: refreshed.user.email || null,
        accountId: refreshed.user.accountId || null,
      };

      return next();
    }

    throw new ApiError(401, "Unauthorized request");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch (err) {
    // ❗ Keep same behavior as before
    if (
      err?.name === "TokenExpiredError" &&
      !hasBearer &&
      req.cookies?.refreshToken
    ) {
      const refreshed = await refreshAccessToken({
        refreshToken: req.cookies.refreshToken,
      });

      if (res?.cookie) {
        res.cookie("accessToken", refreshed.accessToken, cookieOptions);
      }

      req.user = {
        _id: refreshed.user._id,
        role: (refreshed.user.role || "CUSTOMER").toUpperCase(),
        email: refreshed.user.email || null,
        accountId: refreshed.user.accountId || null,
      };

      return next();
    }

    throw new ApiError(401, "Invalid or expired access token");
  }

  // 3️⃣ Backward-compatible user attach
  req.user = {
    _id: decoded._id || decoded.id,
    role: (decoded.role || decoded.type || "CUSTOMER").toUpperCase(),
    email: decoded.email || null,
    accountId: decoded.accountId || null,
  };

  // 4️⃣ Safety check (won't break old tokens)
  if (!req.user._id) {
    throw new ApiError(401, "Invalid token payload");
  }

  next();
});


// export const verifyJWT = asyncHandler(async (req, _res, next) => {
//   let token = null;

//   // 1️⃣ Extract token safely (NO precedence bug)
//   if (req.cookies?.accessToken) {
//     token = req.cookies.accessToken;
//   } else if (req.headers.authorization?.startsWith("Bearer ")) {
//     token = req.headers.authorization.replace("Bearer ", "");
//   }

//   // 2️⃣ No token → Unauthorized
//   if (!token) {
//     throw new ApiError(401, "Unauthorized request");
//   }

//   try {
//     // 3️⃣ Verify token
//     const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

//     /*
//       decoded contains:
//       {
//         _id,
//         role,
//         email,
//         iat,
//         exp
//       }
//     */

//     // 4️⃣ Attach authenticated user (TRUST ONLY THIS)
//     req.user = {
//       _id: decoded._id,
//       role: decoded.role,
//       email: decoded.email, // ✅ correct key
//     };

//     next();
//   } catch (error) {
//     throw new ApiError(401, "Invalid or expired access token");
//   }
// });

export const adminAuth = asyncHandler(async (req, _res, next) => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized");
  }

  if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
    throw new ApiError(403, "Admin access only");
  }

  next();
});


export const isSuperAdmin = asyncHandler((req, _, next) => {
  if (!req.user || !req.user.role) {
    throw new ApiError(401, "Unauthorized");
  }

  // ✅ Explicit Super Admin check (future safe)
  if (req.user.role !== "SUPER_ADMIN") {
    throw new ApiError(403, "Forbidden: Super Admin only");
  }

  next();
});

export const canManageAdminStaff = asyncHandler(async (req, _, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, "Invalid Staff ID");
  }

  const staff = await Admin.findById(req.params.id);

  if (!staff) {
    throw new ApiError(404, "Admin staff not found");
  }

  // ✅ ADMIN → full access (Check this FIRST so they can manage terminated staff)
  if (req.user.role === "ADMIN" || req.user.role === "SUPER_ADMIN") {
    return next();
  }

  const staffStatus = await StaffStatus.findOne({ staffId: staff._id });
  // ❌ DISABLED staff cannot be managed by non-admins
  if (staffStatus && staffStatus.status === "DISABLED") {
    throw new ApiError(403, "Cannot manage disabled admin staff");
  }

  // ❌ ADMIN_STAFF cannot manage other admin staff
  if (req.user.role === "ADMIN_STAFF") {
    // allow only self-update (optional)
    if (req.user._id.toString() === staff._id.toString()) {
      return next();
    }
    throw new ApiError(403, "Admin staff cannot manage other admin staff");
  }

  throw new ApiError(403, "You are not allowed to perform this action");
});

export const blockTerminatedStaff = async (req, _, next) => {
  if (req.user?.role === "ADMIN_STAFF") {
    const status = await StaffStatus.findOne({ staffId: req.user._id });

    if (status?.status === "DISABLED") {
      throw new ApiError(403, "Account disabled");
    }
  }
  next();
};


export const verifyAccessToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access token missing",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET
    );

    // attach user to request
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "401 Invalid or expired access token",
    });
  }
};
export const verifyCustomerJWT = asyncHandler(async (req, _, next) => {
  const token =
    req.cookies?.accessToken ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    throw new ApiError(401, "Unauthorized");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch (error) {
    throw new ApiError(401, "Invalid or expired access token");
  }

  // 🔐 Role check (VERY IMPORTANT)
  if (decoded.role !== "CUSTOMER") {
    throw new ApiError(403, "Only customers can logout here");
  }

  // 🔐 Ensure session exists for THIS device
  const session = await CustomerSession.findOne({
    customerId: decoded._id,
    deviceId: decoded.deviceId,
  });

  if (!session) {
    throw new ApiError(401, "Session expired. Login again");
  }

  req.user = decoded;
  next();
});





// export const optionalCustomerAuth = (req, _, next) => {
//   const token =
//     req.cookies?.accessToken ||
//     req.headers.authorization?.replace("Bearer ", "");

//   if (!token) return next(); // 👈 no token, continue

//   try {
//     const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
//     req.user = decoded; // attach if valid
//   } catch {
//     // 👈 token expired → ignore
//   }

//   next();
// };
export const auth = (...allowedRoles) => {
  return asyncHandler(async (req, _res, next) => {
    await verifyJWT(req, _res, () => {});

    if (
      allowedRoles.length &&
      !allowedRoles.includes(req.user.role)
    ) {
      throw new ApiError(403, "Access denied");
    }

    next();
  });
};


export const verifyFranchiseAdmin = (req,res,next)=>{

 try{

 const token = req.headers.authorization?.split(" ")[1];

 if(!token){
   return res.status(401).json({
     success:false,
     message:"No token provided"
   });
 }

 const decoded = jwt.verify(token,process.env.JWT_SECRET);

 req.admin = decoded;

 next();

 }catch(error){

 res.status(401).json({
   success:false,
   message:"Invalid token"
 });

 }

};
