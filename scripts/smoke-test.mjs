#!/usr/bin/env node
/**
 * Smoke tests against a running Flow server (default http://localhost:3000)
 */
const base = process.env.FLOW_URL || "http://localhost:3000";

async function check(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(" ", err.message || err);
    return false;
  }
}

async function json(path, init) {
  const res = await fetch(`${base}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  console.log(`Flow smoke tests @ ${base}\n`);
  const results = [];

  results.push(
    await check("GET /api/health", async () => {
      const data = await json("/api/health");
      if (!data.ok) throw new Error("health not ok");
      if (!data.webcmd) throw new Error("missing webcmd block");
    }),
  );

  results.push(
    await check("GET /api/setup/status", async () => {
      const data = await json("/api/setup/status");
      if (!data.commands?.webcmd) throw new Error("missing setup commands");
    }),
  );

  results.push(
    await check("GET /api/webcmd", async () => {
      const data = await json("/api/webcmd");
      if (typeof data.ok !== "boolean") throw new Error("bad webcmd payload");
    }),
  );

  results.push(
    await check("POST /api/webcmd list", async () => {
      const data = await json("/api/webcmd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args: ["--version"] }),
      });
      if (!data.result) throw new Error("missing result");
    }),
  );

  results.push(
    await check("GET /api/accounts", async () => {
      const data = await json("/api/accounts");
      if (!Array.isArray(data.toolkits)) throw new Error("missing toolkits");
    }),
  );

  results.push(
    await check("POST /api/accounts demo-link", async () => {
      const data = await json("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit: "gmail", action: "demo-link" }),
      });
      if (!data.account) throw new Error("missing account");
    }),
  );

  results.push(
    await check("POST /api/booking/search", async () => {
      const data = await json("/api/booking/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Tokyo flights under 650", demo: true }),
      });
      if (!data.deals?.length) throw new Error("expected deals");
    }),
  );

  results.push(
    await check("POST /api/chat", async () => {
      const data = await json("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Shibuya hotel 2 nights" }),
      });
      if (!data.message?.content) throw new Error("missing assistant message");
    }),
  );

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
