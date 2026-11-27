import fs from "fs/promises";
import path from "path";

// Ensure required ServerEnv vars have safe defaults when rendering static HTML for Vercel.
process.env.GAME_ENV ||= "prod";
process.env.TURNSTILE_SITE_KEY ||= "1x00000000000000000000AA";
process.env.DOMAIN ||=
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  "localhost";
process.env.GIT_COMMIT ||=
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "vercel";

async function main(): Promise<void> {
  const { renderHtmlContent } = await import("../src/server/RenderHtml");
  const root = path.join(import.meta.dirname, "..");
  const staticDir = path.join(root, "static");
  const indexPath = path.join(staticDir, "index.html");

  const rendered = await renderHtmlContent(indexPath, { perServer: false });
  await fs.writeFile(indexPath, rendered, "utf-8");

  const cosmeticsSrc = path.join(root, "resources", "cosmetics.json");
  const cosmeticsDest = path.join(staticDir, "cosmetics.json");
  try {
    await fs.copyFile(cosmeticsSrc, cosmeticsDest);
  } catch {
    // Optional if resources/cosmetics.json is absent.
  }

  console.log("Rendered static/index.html for Vercel deployment.");
}

main().catch((error) => {
  console.error("Failed to render Vercel static HTML:", error);
  process.exit(1);
});
