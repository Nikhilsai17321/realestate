import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { io as createSocketClient } from "socket.io-client";
import test from "node:test";

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(origin, child) {
  const expiresAt = Date.now() + 8000;
  while (Date.now() < expiresAt) {
    if (child.exitCode !== null) throw new Error(`Test API exited early. ${child.output}`);
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Test API did not become ready. ${child.output}`);
}

const readJson = async (response) => response.json();
const originHeader = { Origin: "http://127.0.0.1:5173" };
const jsonHeaders = { ...originHeader, "Content-Type": "application/json" };
const sessionCookie = (response) => response.headers.get("set-cookie")?.split(";", 1)[0] || "";

function socketReady(origin, requestOrigin) {
  return new Promise((resolve, reject) => {
    const socket = createSocketClient(origin, {
      transports: ["websocket"],
      ...(requestOrigin ? { extraHeaders: { Origin: requestOrigin } } : {}),
      reconnection: false,
      timeout: 3000
    });
    const finish = (error, accepted) => {
      socket.close();
      if (error) reject(error);
      else resolve(accepted);
    };
    socket.once("server:ready", () => finish(null, true));
    socket.once("connect_error", () => finish(null, false));
    socket.once("connect", () => setTimeout(() => finish(new Error("Socket did not emit server:ready")), 3000));
  });
}

test("secure API supports accounts, private enquiries, favorites, and admin inventory", { timeout: 30000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "propertyhub-test-"));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      APP_ORIGIN: "http://127.0.0.1:5173",
      SESSION_SECRET: "integration-test-session-secret-32-bytes-minimum",
      ADMIN_EMAIL: "admin@example.test",
      ADMIN_PASSWORD: "Admin-password-very-long-2026",
      DEEPSEEK_API_KEY: "",
      DEEPSEEK_MODEL: "deepseek-flash",
      DATABASE_PATH: join(directory, "test.sqlite")
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { child.output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { child.output += chunk; });

  t.after(async () => {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(directory, { recursive: true, force: true });
  });

  await waitForHealth(origin, child);

  const health = await fetch(`${origin}/api/health`);
  assert.deepEqual(await readJson(health).then(({ status, realtime }) => ({ status, realtime })), { status: "ok", realtime: true });
  assert.ok(health.headers.get("content-security-policy"));
  assert.equal(health.headers.get("x-powered-by"), null);

  assert.equal(await socketReady(origin, "http://127.0.0.1:5173"), true);
  assert.equal(await socketReady(origin, "https://attacker.example"), false);
  assert.equal(await socketReady(origin), false);

  const publicListings = await fetch(`${origin}/api/listings`);
  const { listings } = await readJson(publicListings);
  assert.ok(listings.length >= 9, "the public inventory should include at least the original demo listings");
  const missingRoute = await fetch(`${origin}/api/does-not-exist`);
  assert.equal(missingRoute.status, 404);
  assert.equal(missingRoute.headers.get("content-type").split(";", 1)[0], "application/json");
  const listing = listings.find((entry) => entry.id === "oakline-apartment");
  assert.ok(listing);

  const anonymousAdmin = await fetch(`${origin}/api/admin/stats`);
  assert.equal(anonymousAdmin.status, 401);
  const rejectedOrigin = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
    body: JSON.stringify({ name: "Cross Origin", email: "cross@example.test", password: "CorrectHorseBattery!" })
  });
  assert.equal(rejectedOrigin.status, 403);

  const registration = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name: "Integration Member", email: "member@example.test", password: "Zy7!Cobalt-Riverstone" })
  });
  assert.equal(registration.status, 201);
  const memberCookie = sessionCookie(registration);
  assert.match(memberCookie, /^propertyhub_session=/);

  const invalidPassword = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name: "Short Password", email: "short@example.test", password: "short" })
  });
  assert.equal(invalidPassword.status, 400);

  const memberHeaders = { ...jsonHeaders, Cookie: memberCookie };
  const memberAdmin = await fetch(`${origin}/api/admin/stats`, { headers: { Cookie: memberCookie } });
  assert.equal(memberAdmin.status, 403);

  const anonymousAiSearch = await fetch(`${origin}/api/ai/search`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ query: "two bedroom home in Jubilee Hills", currentMode: "buy" })
  });
  assert.equal(anonymousAiSearch.status, 401);
  const unconfiguredAiSearch = await fetch(`${origin}/api/ai/search`, {
    method: "POST",
    headers: memberHeaders,
    body: JSON.stringify({ query: "two bedroom home in Jubilee Hills", currentMode: "buy" })
  });
  assert.equal(unconfiguredAiSearch.status, 503);
  assert.match((await readJson(unconfiguredAiSearch)).error, /DEEPSEEK_API_KEY/);

  const saved = await fetch(`${origin}/api/favorites/${listing.id}`, { method: "PUT", headers: memberHeaders });
  assert.equal(saved.status, 204);
  const favorites = await fetch(`${origin}/api/favorites`, { headers: { Cookie: memberCookie } });
  assert.deepEqual((await readJson(favorites)).favorites.map(({ id }) => id), [listing.id]);

  const enquiry = await fetch(`${origin}/api/inquiries`, {
    method: "POST",
    headers: memberHeaders,
    body: JSON.stringify({ listingId: listing.id, name: "Integration Member", email: "ignored@example.test", phone: "+91 9000000000", message: "Please arrange a viewing this week." })
  });
  assert.equal(enquiry.status, 201);
  assert.equal((await readJson(enquiry)).delivery, "stored-locally");
  const privateInquiries = await fetch(`${origin}/api/my/inquiries`, { headers: { Cookie: memberCookie } });
  assert.equal((await readJson(privateInquiries)).inquiries.length, 1);

  const adminLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email: "admin@example.test", password: "Admin-password-very-long-2026" })
  });
  assert.equal(adminLogin.status, 200);
  const adminCookie = sessionCookie(adminLogin);
  const adminHeaders = { ...jsonHeaders, Cookie: adminCookie };
  const stats = await fetch(`${origin}/api/admin/stats`, { headers: { Cookie: adminCookie } });
  assert.equal(stats.status, 200);
  assert.equal((await readJson(stats)).inquiries, 1);

  const created = await fetch(`${origin}/api/admin/listings`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ title: "Testable Garden House", location: "Test District", city: "London", country: "United Kingdom", currency: "GBP", mode: "buy", type: "House", price: 720000, beds: 2, baths: 2, area: 1400, areaUnit: "sqm", image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80", description: "A temporary international inventory row used to check admin publishing.", verified: true })
  });
  assert.equal(created.status, 201);
  const createdListing = (await readJson(created)).listing;
  assert.equal(createdListing.sample, false);
  assert.equal(createdListing.currency, "GBP");
  assert.equal(createdListing.country, "United Kingdom");
  assert.equal(createdListing.areaUnit, "sqm");

  const forbiddenDelete = await fetch(`${origin}/api/admin/listings/${createdListing.id}`, { method: "DELETE", headers: memberHeaders });
  assert.equal(forbiddenDelete.status, 403);
  const deleted = await fetch(`${origin}/api/admin/listings/${createdListing.id}`, { method: "DELETE", headers: adminHeaders });
  assert.equal(deleted.status, 204);

  const logout = await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: memberHeaders });
  assert.equal(logout.status, 204);
  const revokedSession = await fetch(`${origin}/api/favorites`, { headers: { Cookie: memberCookie } });
  assert.equal(revokedSession.status, 401);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const failedLogin = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ email: "member@example.test", password: "incorrect-password" })
    });
    assert.equal(failedLogin.status, 401);
  }
  const limitedLogin = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ email: "member@example.test", password: "incorrect-password" })
  });
  assert.equal(limitedLogin.status, 429);
});

test("DeepSeek filters are validated and applied to actual inventory", { timeout: 30000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "propertyhub-ai-test-"));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const mockModule = pathToFileURL(join(process.cwd(), "test-support", "deepseek-mock.js")).href;
  const child = spawn(process.execPath, ["--import", mockModule, "server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      APP_ORIGIN: "http://127.0.0.1:5173",
      SESSION_SECRET: "deepseek-test-session-secret-32-bytes-minimum",
      DEEPSEEK_API_KEY: "test-only-not-a-real-provider-key",
      DEEPSEEK_MODEL: "deepseek-flash",
      DATABASE_PATH: join(directory, "test.sqlite")
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { child.output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { child.output += chunk; });

  t.after(async () => {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(directory, { recursive: true, force: true });
  });

  await waitForHealth(origin, child);
  const registration = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name: "AI Search Member", email: "ai-member@example.test", password: "Zy7!Cobalt-Riverstone" })
  });
  assert.equal(registration.status, 201);
  const cookie = sessionCookie(registration);

  const aiSearch = await fetch(`${origin}/api/ai/search`, {
    method: "POST",
    headers: { ...jsonHeaders, Cookie: cookie },
    body: JSON.stringify({ query: "2 bedroom rental near Manikonda under 50000", currentMode: "buy", currentCurrency: "all" })
  });
  assert.equal(aiSearch.status, 200);
  const { filters, provider } = await readJson(aiSearch);
  assert.equal(provider, "deepseek");
  assert.deepEqual(filters, {
    mode: "rent",
    currency: "INR",
    type: "Apartment",
    query: "Manikonda",
    maxPrice: 50000,
    minBeds: 2,
    summary: "2-bedroom rental near Manikonda under ₹50,000 per month."
  });

  const listings = await fetch(`${origin}/api/listings?mode=${filters.mode}&currency=${filters.currency}&type=${filters.type}&q=${encodeURIComponent(filters.query)}&maxPrice=${filters.maxPrice}&minBeds=${filters.minBeds}`);
  assert.deepEqual((await readJson(listings)).listings.map(({ id }) => id), ["garden-flat"]);
});
