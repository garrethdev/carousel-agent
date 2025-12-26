import dotenv from "dotenv";
import express from "express";
import path from "path";
import swaggerUi from "swagger-ui-express";
import { registerCarouselRoutes } from "./api/carouselRoute";
import { swaggerSpec } from "./docs/swagger";

const envPath = process.env.DOTENV_CONFIG_PATH || ".env";
dotenv.config({ path: envPath });
dotenv.config({ path: "environment.env" });

/**
 * Bootstraps the Express HTTP server for the carousel generator.
 *
 * - Serves static assets from the public/ directory.
 * - Registers all carousel API routes.
 * - Attempts to listen on PORT (default 3000), and if in use,
 *   will try successive ports up to port 3004.
 */
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("/", (_req, res) => {
  res.redirect("/form.html");
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

registerCarouselRoutes(app);

function listenWithFallback(port: number, remainingAttempts: number): void {
  const server = app.listen(port);

  server.on("listening", () => {
    console.log(`Server listening on port ${port}`);
  });

  server.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE" && remainingAttempts > 0) {
      console.warn(
        `Port ${port} in use, attempting port ${port + 1} (remaining attempts: ${
          remainingAttempts - 1
        })`
      );
      listenWithFallback(port + 1, remainingAttempts - 1);
      return;
    }
    throw err;
  });
}

const initialPort = Number(process.env.PORT) || 3000;
listenWithFallback(initialPort, 5);

