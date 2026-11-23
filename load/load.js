import { check, sleep } from "k6";
import http from "k6/http";
import {
  API_URL,
  JSON_HEADERS,
  SCENARIO_USERS,
  SEED_EMAIL,
  bearerHeaders,
  resetPasswordPayload,
  signInPayload,
  signUpPayload,
} from "./common.js";

const VUS = Number(__ENV.LOAD_VUS ?? 50);
const SIGNUP_VUS = Number(__ENV.LOAD_SIGNUP_VUS ?? 5);
const RAMP_UP = __ENV.LOAD_RAMP_UP ?? "1m";
const HOLD = __ENV.LOAD_HOLD ?? "5m";
const RAMP_DOWN = __ENV.LOAD_RAMP_DOWN ?? "30s";
const P95_MS = Number(__ENV.LOAD_P95_MS ?? 5000);
const SLEEP_MS = Number(__ENV.LOAD_SLEEP_MS ?? 200);

const stages = (target) => [
  { duration: RAMP_UP, target },
  { duration: HOLD, target },
  { duration: RAMP_DOWN, target: 0 },
];

function scenario(exec, targetVus) {
  return { executor: "ramping-vus", exec, stages: stages(targetVus), gracefulStop: "30s" };
}

const json = (classTag) => ({ headers: JSON_HEADERS, tags: { class: classTag } });
const bearer = (classTag, token) => ({ headers: bearerHeaders(token), tags: { class: classTag } });

export const options = {
  scenarios: {
    hello: scenario("hello", VUS),
    health: scenario("health", VUS),
    sign_up: scenario("signUp", SIGNUP_VUS),
    sign_in: scenario("signIn", VUS),
    me: scenario("me", VUS),
    logout: scenario("logout", VUS),
    confirm_account: scenario("confirmAccount", VUS),
    forgot_password: scenario("forgotPassword", VUS),
    reset_password: scenario("resetPassword", VUS),
  },
  thresholds: {
    // k6 v2.2.0 cannot combine the `expected_response` tag with custom tags in
    // a sub-metric, so requests are partitioned by a single custom `class` tag:
    //   success    - endpoints that must return 2xx under load (strict)
    //   signup     - sign-up is fail-fast when the dev Mailtrap inbox cannot
    //                keep up with concurrent emails (500 + rollback). It has NO
    //                threshold: the signal is the strict check below + the
    //                auth_signup_count{result} metric on the dashboard.
    //   error-path - confirm/reset with invalid tokens (expected 400, via checks)
    "http_req_failed{class:success}": ["rate<0.01"],
    http_req_duration: [`p(95)<${P95_MS}`],
  },
};

function maybeSleep() {
  if (SLEEP_MS > 0) sleep(SLEEP_MS / 1000);
}

export function hello() {
  const signInRes = http.post(
    `${API_URL}/auth/sign-in`,
    JSON.stringify(signInPayload(SCENARIO_USERS.hello)),
    json("success"),
  );
  check(signIn, { "hello pre sign-in -> 200": (r) => r.status === 200 });
  const res = http.get(`${API_URL}/`, bearer("success", signInRes.json().token));
  check(res, { "GET / -> 200": (r) => r.status === 200 });
  maybeSleep();
}

export function health() {
  const res = http.get(`${API_URL}/auth`, { tags: { class: "success" } });
  check(res, { "GET /auth -> 200": (r) => r.status === 200 });
  maybeSleep();
}

export function signUp() {
  const res = http.post(`${API_URL}/auth/sign-up`, JSON.stringify(signUpPayload()), json("signup"));
  check(res, { "POST /auth/sign-up -> 201": (r) => r.status === 201 });
  maybeSleep();
}

export function signIn() {
  const res = http.post(
    `${API_URL}/auth/sign-in`,
    JSON.stringify(signInPayload(SEED_EMAIL)),
    json("success"),
  );
  check(res, { "POST /auth/sign-in -> 200": (r) => r.status === 200 });
  maybeSleep();
}

export function me() {
  const signInRes = http.post(
    `${API_URL}/auth/sign-in`,
    JSON.stringify(signInPayload(SCENARIO_USERS.me)),
    json("success"),
  );
  check(signIn, { "me pre sign-in -> 200": (r) => r.status === 200 });
  const res = http.get(`${API_URL}/auth/me`, bearer("success", signInRes.json().token));
  check(res, { "GET /auth/me -> 200": (r) => r.status === 200 });
  maybeSleep();
}

export function logout() {
  const signInRes = http.post(
    `${API_URL}/auth/sign-in`,
    JSON.stringify(signInPayload(SCENARIO_USERS.logout)),
    json("success"),
  );
  check(signIn, { "logout pre sign-in -> 200": (r) => r.status === 200 });
  const res = http.post(`${API_URL}/auth/logout`, null, bearer("success", signInRes.json().token));
  check(res, { "POST /auth/logout -> 200": (r) => r.status === 200 });
  maybeSleep();
}

export function confirmAccount() {
  const res = http.post(
    `${API_URL}/auth/confirm-account`,
    JSON.stringify({ token: "invalid-token" }),
    { ...json("error-path"), expectedResponse: false },
  );
  check(res, { "POST /auth/confirm-account -> 400 (error-path)": (r) => r.status === 400 });
  maybeSleep();
}

export function forgotPassword() {
  const res = http.post(
    `${API_URL}/auth/forgot-password`,
    JSON.stringify({ email: SEED_EMAIL }),
    json("success"),
  );
  check(res, { "POST /auth/forgot-password -> 202": (r) => r.status === 202 });
  maybeSleep();
}

export function resetPassword() {
  const res = http.post(`${API_URL}/auth/reset-password`, JSON.stringify(resetPasswordPayload()), {
    ...json("error-path"),
    expectedResponse: false,
  });
  check(res, { "POST /auth/reset-password -> 400 (error-path)": (r) => r.status === 400 });
  maybeSleep();
}
