import Customer from "../../models/Customer/customer.model.js";

export const findByMobile = (phoneNumber) => {
  return Customer.findOne({ phoneNumber });
};

export const findByIdentifier = (identifier) => {
  return Customer.findOne({
    $or: [
      { phoneNumber: identifier },
      { emailId: identifier.toLowerCase() },
    ],
  });
};

export const findById = (id) => {
  return Customer.findById(id);
};

export const createCustomerRepo = async (data) => {
  const customer = await Customer.create(data);
  return customer;
};
export const updateCustomerRepo = async (activlineUserId, updateData) => {
  return Customer.findOneAndUpdate(
    { activlineUserId },
    { $set: updateData },
    { new: true, runValidators: true }
  );
};




export const findCustomerByActivlineId = async (activlineUserId) => {
  return Customer.findOne({ activlineUserId }).lean();
};
