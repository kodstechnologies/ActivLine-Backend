import * as relocationRepo from "../../repositories/Customer/relocation.repository.js";
import Customer from "../../models/Customer/customer.model.js";
import ApiError from "../../utils/ApiError.js";
import {
  editActivlineUserProfile,
  updateLocationService,
} from "./customerprofile.service.js";
import { sendMessage } from "../../utils/sendMessage.js";
import { SMS_TEMPLATE_ID } from "../../constants/sms_template_id.js";
import Location from "../../models/Customer/customerLocation.mode.js";
import { notifyCustomer } from "../Notification/customer.notification.service.js";

export const createRelocationService = async (user, payload) => {
  const customer = await Customer.findOne({
    $or: [
      { _id: user?._id },
      { activlineUserId: user?.activlineUserId },
    ].filter(Boolean),
  });

  if (!customer) {
    throw new ApiError(404, "Customer profile not found");
  }

  const {
    installation_address_line2,
    installation_address_city,
    installation_address_pin,
    installation_address_state,
    installation_address_country,
    longitude,
    latitude,
    sifted_date,
    userGroupId,
    accountId,
  } = payload;

  const existingRelocation = await relocationRepo.findOneRelocationRepo({
    userId: customer._id,
    // status: { $in: ["PENDING", "REQUEST"] },
  });

  const relocationData = {
    userId: customer._id,
    accountId,
    userGroupId,
    installation_address_line2,
    installation_address_city,
    installation_address_pin,
    installation_address_state,
    installation_address_country: installation_address_country || "India",
    longitude: longitude ? Number(longitude) : null,
    latitude: latitude ? Number(latitude) : null,
    sifted_date: new Date(sifted_date),
    status: "REQUEST",
  };
  if (existingRelocation?.status === "PENDING") {
    throw new ApiError(
      400,
      "An active relocation request is already pending approval",
    );
  }
  if (existingRelocation) {
    // If any active request (PENDING or REQUEST) already exists, update/overwrite it
    return await relocationRepo.updateRelocationRepo(
      existingRelocation._id,
      relocationData,
    );
  }

  // Otherwise, create a brand new relocation request
  return await relocationRepo.createRelocationRepo(relocationData);
};

export const getRelocationsService = async (user, filters) => {
  const { page = 1, limit = 10, status, accountId } = filters;
  const skip = (Number(page) - 1) * Number(limit);

  const query = {};

  if (user?.role === "CUSTOMER") {
    const customer = await Customer.findOne({
      $or: [
        { _id: user?._id },
        { activlineUserId: user?.activlineUserId },
      ].filter(Boolean),
    });
    if (!customer) {
      throw new ApiError(404, "Customer not found");
    }
    query.userId = customer._id;
  } else {
    if (status) query.status = status;
    if (accountId) query.accountId = accountId;

    if (user?.role === "FRANCHISE_ADMIN") {
      query.accountId = user.accountId;
    }
  }

  const total = await relocationRepo.countRelocationsRepo(query);
  const items = await relocationRepo.findRelocationsRepo(
    query,
    skip,
    Number(limit),
  );

  // Convert Mongoose documents to plain objects so we can add dynamic properties
  const plainItems = items.map((item) =>
    item.toObject ? item.toObject() : item,
  );

  // Dynamically look up and attach longitude and latitude coordinates from Location model by customer emailId
  const itemsWithCoordinates = await Promise.all(
    plainItems.map(async (item) => {
      if (item.userId && item.userId.emailId) {
        try {
          const loc = await Location.findOne({ email: item.userId.emailId });
          if (loc && loc.location) {
            if (item.userId.address) {
              item.userId.address.latitude = loc.location.latitude;
              item.userId.address.longitude = loc.location.longitude;
            }
            if (item.userId.installationAddress) {
              item.userId.installationAddress.latitude = loc.location.latitude;
              item.userId.installationAddress.longitude =
                loc.location.longitude;
            }
          }
        } catch (err) {
          console.error(
            "Failed to fetch coordinates from customerLocation model:",
            err.message,
          );
        }
      }
      return item;
    }),
  );

  return {
    items: itemsWithCoordinates,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

export const updateRelocationService = async (user, relocationId, payload) => {
  const request = await relocationRepo.findRelocationById(relocationId);
  if (!request) {
    throw new ApiError(404, "Relocation request not found");
  }

  const updates = { ...payload };

  if (user?.role === "CUSTOMER") {
    const customer = await Customer.findOne({
      $or: [
        { _id: user?._id },
        { activlineUserId: user?.activlineUserId },
      ].filter(Boolean),
    });
    if (!customer || String(request.userId) !== String(customer._id)) {
      throw new ApiError(403, "Access denied. You do not own this request.");
    }

    if (request.status !== "REQUEST") {
      throw new ApiError(
        400,
        "Cannot edit request details once process has started",
      );
    }

    delete updates.status;
  } else if (user?.role === "FRANCHISE_ADMIN") {
    if (String(request.accountId) !== String(user.accountId)) {
      throw new ApiError(
        403,
        "Access denied. Request belongs to another franchise.",
      );
    }
  }

  if (updates.sifted_date) updates.sifted_date = new Date(updates.sifted_date);
  if (updates.longitude) updates.longitude = Number(updates.longitude);
  if (updates.latitude) updates.latitude = Number(updates.latitude);

  const updatedRelocation = await relocationRepo.updateRelocationRepo(
    relocationId,
    updates,
  );

  // Apply condition: when status is updated to "COMPLETED" (and it was not already COMPLETED)
  if (updates.status === "COMPLETED" && request.status !== "COMPLETED") {
    const customer = await Customer.findById(request.userId);
    if (customer) {
      // 1. Update customer local address in MongoDB
      customer.installationAddress = {
        line2: request.installation_address_line2,
        city: request.installation_address_city,
        pin: request.installation_address_pin,
        state: request.installation_address_state,
        country: request.installation_address_country || "India",
      };

      customer.address = {
        line1: request.installation_address_line2,
        city: request.installation_address_city,
        pin: request.installation_address_pin,
        state: request.installation_address_state,
        country: request.installation_address_country || "India",
      };

      await customer.save();

      // 2. Call external Activline API to update subscriber's address
      if (customer.activlineUserId) {
        try {
          await editActivlineUserProfile({
            userId: customer.activlineUserId,
            address_line1: request.installation_address_line2,
            address_line2: request.installation_address_line2,
            address_city: request.installation_address_city,
            address_state: request.installation_address_state,
            address_pin: request.installation_address_pin,
          });
        } catch (apiError) {
          console.error(
            "Failed to sync customer address to Activline Jaze API:",
            apiError,
          );
        }
      }

      // 3. Update customer location model with relocation coordinates
      if (
        customer.emailId &&
        request.longitude !== null &&
        request.latitude !== null
      ) {
        try {
          await updateLocationService({
            email: customer.emailId,
            location: {
              longitude: Number(request.longitude),
              latitude: Number(request.latitude),
            },
          });
          console.log(
            `[Location] Successfully updated coordinates for customer ${customer.emailId}`,
          );
        } catch (locError) {
          console.error(
            "Failed to update customer Location coordinates on relocation complete:",
            locError.message,
          );
        }
      }
    }
  }

  // SMS & App Notification trigger for status changes to PENDING or COMPLETED

  if (
    (updates.status === "PENDING" && request.status !== "PENDING") ||
    (updates.status === "COMPLETED" && request.status !== "COMPLETED")
  ) {
    const customer = await Customer.findById(request.userId);
    console.log("customer data", customer?._id);
    if (customer) {
      const addressStr =
        `${request.installation_address_line2 || ""}, ${request.installation_address_city || ""}`
          .trim()
          .replace(/^,\s*/, "");

      // 1. Send SMS Notification
      if (customer.phoneNumber) {
        try {
          let smsData = null;
          if (updates.status === "PENDING") {
            smsData = SMS_TEMPLATE_ID.RELOCATION_PENDING(
              customer.userName || customer.firstName || "Customer",
            );
          } else if (updates.status === "COMPLETED") {
            smsData = SMS_TEMPLATE_ID.RELOCATION_COMPLETED(
              customer.userName || customer.firstName || "Customer",
              addressStr,
            );
          }

          if (smsData && smsData.ID) {
            await sendMessage({
              mobile: customer.phoneNumber,
              message: smsData.MESSAGE,
              template_id: smsData.ID,
            });
          }
          console.log(
            `[SMS] Sent relocation status update SMS to ${customer.phoneNumber} for status ${updates.status}`,
          );
        } catch (smsErr) {
          console.error(
            `[SMS] Failed to send relocation status SMS:`,
            smsErr.message,
          );
        }
      }

      // 2. Send Push & In-App Notification (Database + Firebase)
      try {
        let notificationTitle = "";
        let notificationMessage = "";

        if (updates.status === "PENDING") {
          notificationTitle = "Relocation Request Approved";
          notificationMessage = `Dear ${customer.userName || customer.firstName || "Customer"}, your relocation request is pending approval.`;
        } else if (updates.status === "COMPLETED") {
          notificationTitle = "Relocation Completed";
          notificationMessage = `Dear ${customer.userName || customer.firstName || "Customer"}, your relocation request to ${addressStr} has been completed successfully.`;
        }

        await notifyCustomer({
          customerId: customer._id,
          title: notificationTitle,
          message: notificationMessage,
          type: "SYSTEM",
          data: {
            relocationId: request._id.toString(),
            status: updates.status,
          },
        });
        console.log(
          `[Notification] Sent relocation in-app/push notification to customer ${customer._id} for status ${updates.status}`,
        );
      } catch (notifErr) {
        console.error(
          `[Notification] Failed to send relocation push/in-app notification:`,
          notifErr.message,
        );
      }
    }
  }

  return updatedRelocation;
};

export const deleteRelocationService = async (user, relocationId) => {
  const request = await relocationRepo.findRelocationById(relocationId);
  if (!request) {
    throw new ApiError(404, "Relocation request not found");
  }

  if (user?.role === "FRANCHISE_ADMIN") {
    if (String(request.accountId) !== String(user.accountId)) {
      throw new ApiError(
        403,
        "Access denied. Request belongs to another franchise.",
      );
    }
  }

  return await relocationRepo.deleteRelocationRepo(relocationId);
};

export const getMyRelocationService = async (user) => {
  const customer = await Customer.findOne({
    $or: [
      { _id: user?._id },
      { activlineUserId: user?.activlineUserId },
    ].filter(Boolean),
  });

  if (!customer) {
    throw new ApiError(404, "Customer profile not found");
  }

  return await relocationRepo.findLatestRelocationRepo({
    userId: customer._id,
    status: { $in: ["PENDING"] },
  });
};
