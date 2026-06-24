import userRepo from "../../repositories/user/user.repository.js";
import { ApiError } from "../../utils/ApiError.js";
import { generateAccessToken } from "../../utils/jwt.js";

class AuthService {
  async registerUser(data) {
    const existing = await userRepo.findByMobile(data.mobile);
    if (existing) throw new ApiError(409, "Mobile already registered");

    const customerId = "ACT" + Date.now();

    const user = await userRepo.create({
      ...data,
      customerId,
    });

    return user;
  }

  async checkUserExists({ emailId, phoneNumber }) {
    const user = await userRepo.findByEmailOrMobile(emailId, phoneNumber);
    if (user) {
      throw new ApiError(409, "User already exists");
    }
    return true;
  }

  async loginUser(identifier, password) {
    let user;

    if (/^[6-9]\d{9}$/.test(identifier)) {
      user = await userRepo.findByMobile(identifier);
    } else {
      user = await userRepo.findByCustomerId(identifier);
    }

    if (!user) throw new ApiError(404, "User not found");

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new ApiError(401, "Invalid credentials");

    const token = generateAccessToken({
      _id: user._id,
      role: "Customer",
      mobile: user.mobile,
    });

    return { user, token };
  }
}

export default new AuthService();
