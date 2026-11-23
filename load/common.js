export const API_URL = __ENV.API_URL ?? "http://host.docker.internal:3000/api/v1";

export const SEED_EMAIL = __ENV.SEED_EMAIL ?? "load.user@coders.local";
export const SEED_PASSWORD = __ENV.LOAD_SEED_PASSWORD ?? "k6Password!2026";

export const SCENARIO_USERS = {
  hello: __ENV.LOAD_HELLO_EMAIL ?? "load.hello@coders.local",
  me: __ENV.LOAD_ME_EMAIL ?? "load.me@coders.local",
  logout: __ENV.LOAD_LOGOUT_EMAIL ?? "load.logout@coders.local",
};

export const SIGNUP_PASSWORD = __ENV.SIGNUP_PASSWORD ?? "k6Password!2026";

export const RUN_ID = __ENV.RUN_ID ?? Date.now();

export const JSON_HEADERS = { "content-type": "application/json" };

export function bearerHeaders(token) {
  return { authorization: `Bearer ${token}`, ...JSON_HEADERS };
}

export function uniqueEmail() {
  return `load-${RUN_ID}-${__VU}-${__ITER}@coders.local`;
}

export function signUpPayload(email = uniqueEmail()) {
  return {
    first_name: "Load",
    last_name: "Test",
    email,
    password: SIGNUP_PASSWORD,
    confirm_password: SIGNUP_PASSWORD,
  };
}

export function signInPayload(email = SEED_EMAIL, password = SEED_PASSWORD) {
  return { email, password };
}

export function resetPasswordPayload() {
  return {
    token: "invalid-token",
    password: "k6Password!2026",
    confirm_password: "k6Password!2026",
  };
}
