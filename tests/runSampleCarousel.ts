import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { RawCarouselPayload } from "../src/types/carousel";
import { orchestrateCarouselGeneration } from "../src/core/orchestrator/orchestrateCarousel";
import { renderCarouselHtml } from "../src/template/htmlRenderer";

const envPath = process.env.DOTENV_CONFIG_PATH || ".env";
dotenv.config({ path: envPath });
dotenv.config({ path: "environment.env" });

async function main() {
  const jsonPath = path.resolve(__dirname, "samplePayload.json");
  const raw = JSON.parse(
    fs.readFileSync(jsonPath, "utf-8")
  ) as RawCarouselPayload;

  const finalCarousel = await orchestrateCarouselGeneration(raw);
  const html = renderCarouselHtml(finalCarousel);

  const outPath = path.resolve(__dirname, "sampleCarousel.html");
  fs.writeFileSync(outPath, html, "utf-8");

  // Minimal output to confirm run
  // Do not add anything else here.
  console.log("Wrote:", outPath);
}

main().catch((err) => {
  console.error("runSampleCarousel failed:", err);
  process.exit(1);
});

