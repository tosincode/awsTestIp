const express = require("express");
const dns = require("dns").promises;
const crypto = require("crypto");

const swaggerUi = require("swagger-ui-express");
const swaggerJSDoc = require("swagger-jsdoc");

const app = express();

// Important behind DigitalOcean/NGINX so req.ip + x-forwarded-for work as expected
app.set("trust proxy", 1);

const AWS_BASE_URL =
  process.env.AWS_BASE_URL ||
  "http://ec2-34-202-126-158.compute-1.amazonaws.com";

const PORT = process.env.PORT || 3000;

// ---------- helpers ----------
function isIPv4(ip) {
  const ipv4 =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  return ipv4.test(ip);
}

// Best-effort client IP extraction (works with proxies if trust proxy is set)
function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    // first IP in the list is the original client
    return xff.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
}

function shortUa(ua) {
  if (!ua) return "";
  return String(ua).slice(0, 120);
}

// ---------- request logging middleware ----------
app.use((req, res, next) => {
  const requestId = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(8).toString("hex");

  const startedAt = Date.now();
  const clientIp = getClientIp(req);
  const ua = shortUa(req.headers["user-agent"]);

  req.requestId = requestId;

  // This line will show in DigitalOcean Runtime Logs
  console.log(
    `[${requestId}] --> ${req.method} ${req.originalUrl} | callerIp=${clientIp} | ua=${ua}`
  );

  res.on("finish", () => {
    const ms = Date.now() - startedAt;
    console.log(
      `[${requestId}] <-- ${req.method} ${req.originalUrl} | ${res.statusCode} | ${ms}ms`
    );
  });

  next();
});

// ---------- Swagger ----------
const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Outbound IP Service",
      version: "1.0.0",
      description:
        "Tiny service that resolves AWS public IP and logs the caller IP for inbound requests.",
    },
    // Relative server so Swagger uses current host (works on DO + locally)
    servers: [{ url: "/" }],
  },
  apis: [__filename],
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/openapi.json", (req, res) => res.json(swaggerSpec));

// ---------- routes ----------
/**
 * @swagger
 * /aws-public-ip:
 *   get:
 *     summary: Resolve the public IPv4 for the configured AWS base URL
 *     description: Resolves the hostname via DNS lookup and returns the A record IPv4 address.
 *     responses:
 *       200:
 *         description: Public IP resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 method:
 *                   type: string
 *                   example: dns-lookup
 *                 ip:
 *                   type: string
 *                   example: ip address
 *                 hostname:
 *                   type: string
 *                   example: url hostname
 *       500:
 *         description: Failed to resolve IP
 */
app.get("/aws-public-ip", async (req, res) => {
  const requestId = req.requestId || "no-request-id";

  try {
    const url = new URL(AWS_BASE_URL);
    const hostname = url.hostname;

    console.log(
      `[${requestId}] Resolving AWS hostname via DNS | hostname=${hostname} | AWS_BASE_URL=${AWS_BASE_URL}`
    );

    const lookup = await dns.lookup(hostname, { family: 4 });
    const ip = lookup.address;

    if (!isIPv4(ip)) {
      console.log(
        `[${requestId}] DNS lookup returned non-IPv4 | hostname=${hostname} | result=${JSON.stringify(
          lookup
        )}`
      );
      return res.status(502).json({
        ok: false,
        error: "DNS lookup did not return a valid IPv4 address",
        hostname,
        raw: lookup,
      });
    }

    console.log(`[${requestId}] Resolved AWS IP OK | hostname=${hostname} | ip=${ip}`);

    return res.json({
      ok: true,
      method: "dns-lookup",
      ip,
      hostname,
    });
  } catch (err) {
    console.log(`[${requestId}] Error resolving AWS IP | message=${err.message}`);
    return res.status(500).json({
      ok: false,
      error: "Failed to determine AWS public IP",
      message: err.message,
    });
  }
});

/**
 * @swagger
 * /client-ip:
 *   get:
 *     summary: Get the IP address of the caller (another service hitting this app)
 *     description: >
 *       Returns the best-effort caller IP using x-forwarded-for (if present) and req.ip.
 *       Logs callerIp to Runtime Logs.
 *     responses:
 *       200:
 *         description: Caller IP returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 callerIp:
 *                   type: string
 *                   example: 203.0.113.10
 *                 forwardedFor:
 *                   type: string
 *                   example: "203.0.113.10, 10.0.0.1"
 *                 userAgent:
 *                   type: string
 *                   example: "curl/8.0.1"
 *                 requestId:
 *                   type: string
 *                   example: "a1b2c3d4"
 */
app.get("/client-ip", async (req, res) => {
  const requestId = req.requestId || "no-request-id";
  const callerIp = getClientIp(req);

  // Explicit log so you can spot it easily in Runtime Logs
  console.log(
    `[${requestId}] /client-ip called | callerIp=${callerIp} | x-forwarded-for=${req.headers["x-forwarded-for"] || ""
    }`
  );

  return res.json({
    ok: true,
    callerIp,
    forwardedFor: req.headers["x-forwarded-for"] || null,
    userAgent: req.headers["user-agent"] || null,
    requestId,
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Swagger UI available at /docs`);
});
