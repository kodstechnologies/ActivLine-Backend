const toStringMap = (data = {}) => {
  const result = {};
  if (!data || typeof data !== "object") return result;

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      result[key] = value;
    } else {
      result[key] = JSON.stringify(value);
    }
  }

  return result;
};

const buildCommonPayload = ({ title, body, data, link, icon, channelId }) => {
  const safeTitle = title || "";
  const safeBody = body || "";

  const message = {
    notification: {
      title: safeTitle,
      body: safeBody,
    },
    data: toStringMap(data),
    android: {
      priority: "high",
      notification: {
        channelId: channelId || "default",
        sound: "default",
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
      payload: {
        aps: {
          sound: "default",
          contentAvailable: true,
        },
      },
    },
    webpush: {
      headers: {
        Urgency: "high",
      },
      notification: {
        title: safeTitle,
        body: safeBody,
        icon: icon || "/favicon.ico",
        requireInteraction: true,
      },
    },
  };

  if (link) {
    message.webpush.fcmOptions = { link };
  }

  if (!Object.keys(message.data).length) {
    delete message.data;
  }

  return message;
};

export const buildFcmMessage = ({
  token,
  title,
  body,
  data,
  link,
  icon,
  channelId,
}) => ({
  token,
  ...buildCommonPayload({ title, body, data, link, icon, channelId }),
});

export const buildFcmMulticastMessage = ({
  tokens,
  title,
  body,
  data,
  link,
  icon,
  channelId,
}) => ({
  tokens,
  ...buildCommonPayload({ title, body, data, link, icon, channelId }),
});
