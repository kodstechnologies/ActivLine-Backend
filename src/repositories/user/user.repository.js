import Customer from "../../models/Customer/customer.model.js";
import User from "../../models/user/user.model.js";

class UserRepository {
  create(data) {
    return User.create(data);
  }

  findByMobile(mobile) {
    return User.findOne({ mobile });
  }

  findByEmailOrMobile(emailId, phoneNumber) {
    const query = [];
    if (emailId) query.push({ emailId });
    if (phoneNumber) query.push({ phoneNumber });
    if (query.length === 0) return null;
    return Customer.findOne({ $or: query });
  }

  findByCustomerId(customerId) {
    return User.findOne({ customerId });
  }

  findById(id) {
    return User.findById(id);
  }

  findByResetToken(token) {
    return User.findOne({ passwordResetToken: token });
  }

  updateById(id, data) {
    return User.findByIdAndUpdate(id, data, { new: true });
  }
}

export default new UserRepository();
