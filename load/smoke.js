import { check } from "k6";
import http from "k6/http";
import {
  API_URL,
  JSON_HEADERS,
  SEED_EMAIL,
  bearerHeaders,
  resetPasswordPayload,
  signInPayload,
  signUpPayload,
} from "./common.js";

export const options = {
  scenarios: {
    smoke: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: "2m",
    },
  },
  thresholds: {
    "http_req_failed{expected_response:true}": ["rate<0.01"],
    http_req_duration: ["p(95)<5000"],
  },
};

export function setup() {
  const res = http.post(`${API_URL}/auth/sign-in`, JSON.stringify(signInPayload()), {
    headers: JSON_HEADERS,
  });
  const token = res.json().token;
  if (res.status !== 200 || !token) {
    throw new Error(
      `setup sign-in failed (${res.status}): ${res.body}. Run \`bun run load:seed\` first.`,
    );
  }
  return { token };
}

export default function (data) {
  const { token } = data;

  const hello = http.get(`${API_URL}/`, { headers: bearerHeaders(token) });
  const health = http.get(`${API_URL}/auth`);
  const signUp = http.post(`${API_URL}/auth/sign-up`, JSON.stringify(signUpPayload()), {
    headers: JSON_HEADERS,
  });
  const signIn = http.post(`${API_URL}/auth/sign-in`, JSON.stringify(signInPayload()), {
    headers: JSON_HEADERS,
  });
  const freshToken = signIn.json().token;
  const me = http.get(`${API_URL}/auth/me`, { headers: bearerHeaders(freshToken) });
  const logout = http.post(`${API_URL}/auth/logout`, null, {
    headers: bearerHeaders(freshToken),
  });
  const confirmAccount = http.post(
    `${API_URL}/auth/confirm-account`,
    JSON.stringify({ token: "invalid-token" }),
    { headers: JSON_HEADERS, expectedResponse: false },
  );
  const forgotPassword = http.post(
    `${API_URL}/auth/forgot-password`,
    JSON.stringify({ email: SEED_EMAIL }),
    { headers: JSON_HEADERS },
  );
  const resetPassword = http.post(
    `${API_URL}/auth/reset-password`,
    JSON.stringify(resetPasswordPayload()),
    { headers: JSON_HEADERS, expectedResponse: false },
  );

  check(hello, { "GET / -> 200 (with Bearer)": (r) => r.status === 200 });
  check(health, { "GET /auth -> 200": (r) => r.status === 200 });
  check(signUp, { "POST /auth/sign-up -> 201": (r) => r.status === 201 });
  check(signIn, { "POST /auth/sign-in -> 200": (r) => r.status === 200 });
  check(me, { "GET /auth/me -> 200": (r) => r.status === 200 });
  check(logout, { "POST /auth/logout -> 200": (r) => r.status === 200 });
  check(confirmAccount, {
    "POST /auth/confirm-account -> 400 (error-path)": (r) => r.status === 400,
  });
  check(forgotPassword, { "POST /auth/forgot-password -> 202": (r) => r.status === 202 });
  check(resetPassword, {
    "POST /auth/reset-password -> 400 (error-path)": (r) => r.status === 400,
  });
}
