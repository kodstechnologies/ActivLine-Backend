import activlineClient from "../../external/activline/activline.client.js";
import Franchise from "../../models/Franchise/franchise.model.js";
/**
 * Get franchise account(s)
 * @param {string | undefined} accountId
 */
export const getFranchiseAccounts = async (accountId) => {
  const endpoint = accountId
    ? `/get_account_details/${accountId}`
    : `/get_account_details`;

  return await activlineClient.get(endpoint);
};


export const syncFranchiseData = async () => {

  const externalData = await activlineClient.get("/get_account_details");

  if (!Array.isArray(externalData)) {
    return [];
  }

  const operations = externalData.map((item) => ({
    updateOne: {
      filter: { accountId: item.accountId },
      update: {
        $set: {
          accountName: item.accountName,
          apiKey: item.apiKey,
          companyName: item.companyName,
          parentAccountId: item.parentAccountId,
          dateCreated: new Date(item.dateCreated),
        },
      },
      upsert: true,
    },
  }));

  if (operations.length) {
    await Franchise.bulkWrite(operations);
  }

  return await Franchise.find().sort({ dateCreated: -1 });
};