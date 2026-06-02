import Relocation from "../../models/Customer/relocation.model.js";

export const createRelocationRepo = async (data) => {
  return await Relocation.create(data);
};

export const findRelocationById = async (id) => {
  return await Relocation.findById(id);
};

export const findRelocationsRepo = async (query, skip, limit) => {
  return await Relocation.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate(
      "userId",
      "userName phoneNumber emailId installationAddress address",
    );
};

export const countRelocationsRepo = async (query) => {
  return await Relocation.countDocuments(query);
};

export const updateRelocationRepo = async (id, updateData) => {
  return await Relocation.findByIdAndUpdate(
    id,
    { $set: updateData },
    { new: true, runValidators: true },
  );
};

export const deleteRelocationRepo = async (id) => {
  return await Relocation.findByIdAndDelete(id);
};

export const findOneRelocationRepo = async (query) => {
  return await Relocation.findOne(query);
};

export const upsertRelocationRepo = async (query, updateData) => {
  return await Relocation.findOneAndUpdate(
    query,
    { $set: updateData },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  ).populate(
    "userId",
    "userName phoneNumber emailId installationAddress address",
  );
};

export const findLatestRelocationRepo = async (query) => {
  return await Relocation.findOne(query).sort({ createdAt: -1 });
};
