const express = require("express");
const dns = require("dns").promises;

const swaggerUi = require("swagger-ui-express");
const swaggerJSDoc = require("swagger-jsdoc");

const app = express();

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

// ---------- Swagger ----------
const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Outbound IP Service",
      version: "1.0.0",
      description:
        "Tiny service that resolves the public IP for an AWS EC2 public DNS / base URL.",
    },
    servers: [{ url: "/" }], // works locally + in prod
  },
  apis: [__filename],
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// raw spec
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
 *                   example: my public IPv4 address
 *                 hostname:
 *                   type: string
 *                   example: url hostname
 *       500:
 *         description: Failed to resolve IP
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: Failed to determine AWS public IP
 *                 message:
 *                   type: string
 *                   example: some error message
 */
app.get("/aws-public-ip", async (req, res) => {
  try {
    const url = new URL(AWS_BASE_URL);
    const hostname = url.hostname;

    const lookup = await dns.lookup(hostname, { family: 4 });
    const ip = lookup.address;

    if (!isIPv4(ip)) {
      return res.status(502).json({
        ok: false,
        error: "DNS lookup did not return a valid IPv4 address",
        hostname,
        raw: lookup,
      });
    }

    return res.json({
      ok: true,
      method: "dns-lookup",
      ip,
      hostname,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Failed to determine AWS public IP",
      message: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Swagger UI available at /docs`);
});
