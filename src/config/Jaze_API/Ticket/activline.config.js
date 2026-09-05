// config/external/activline.config.js
export const FALLBACK_ACTIVLINE_USERNAME = "gmai";
export const FALLBACK_ACTIVLINE_PASSWORD =
  "25bd1d0cfa2b8428341187c5d9f0f7763763489d";

export default {
  baseURL: "https://live.activline.in/api/v1",
  timeout: 15000,
  get username() {
    return process.env.ACTIVLINE_USERNAME || FALLBACK_ACTIVLINE_USERNAME;
  },
  get password() {
    return process.env.ACTIVLINE_PASSWORD || FALLBACK_ACTIVLINE_PASSWORD;
  },
};

