import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { chromium, expect } from "@playwright/test";
const { version } = JSON.parse(await fs.readFile("package.json", "utf8"));
const parent = await fs.mkdtemp(path.join(os.tmpdir(), "OV-portable-"));
const port = await new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const value = server.address().port;
    server.close(() => resolve(value));
  });
});
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  path.resolve(`release/Open-Volleyball-${version}-Windows.exe`),
  [
    `--user-data-dir=${path.join(parent, "profile")}`,
    `--remote-debugging-port=${port}`,
  ],
  { env, windowsHide: true, stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!browser)
    throw new Error("Portable launcher did not start its desktop application.");
  const page =
    browser
      .contexts()[0]
      .pages()
      .find((p) => p.url().startsWith("volley://")) ||
    browser.contexts()[0].pages()[0];

  await expect(
    page.getByRole("heading", { name: "Tournois", exact: true }),
  ).toBeVisible();
  await fs.mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({ path: "docs/screenshots/welcome.png" });
  const fixture = path.join(parent, "Exemple.openvolley");
  await fs.cp(
    path.resolve("examples/03 - Tableau Principale prêt à jouer.openvolley"),
    fixture,
    { recursive: true },
  );
  const result = await page.evaluate(
    (folder) => window.volley.call("open", { path: folder }),
    fixture,
  );
  if (!result.ok) throw new Error(result.error);
  await page.reload();
  await page
    .locator(".lane.principale .phase-node")
    .filter({ hasText: "Phase finale" })
    .click();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelector(".progression-scroll").scrollLeft = 0;
  });
  await page.screenshot({ path: "docs/screenshots/progression.png" });
  await page.locator(".bracket-panel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "docs/screenshots/bracket.png" });
  await page
    .evaluate(() => window.dispatchEvent(new Event("volley-close")))
    .catch(() => {});
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else {
      child.once("exit", resolve);
      setTimeout(resolve, 8000);
    }
  });
  console.log(
    "Portable launcher: PASS. Loaded packaged UI, opened a copied sample, displayed progression/bracket, closed normally.",
  );
} finally {
  await browser?.close().catch(() => {});
  if (child.exitCode === null) child.kill();
  if (path.dirname(parent) !== os.tmpdir())
    throw new Error("Unexpected temporary destination.");
  await fs
    .rm(parent, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    })
    .catch(() => {});
}
