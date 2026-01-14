
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

function ipFromEc2Hostname(hostname) {
  const m = hostname.match(/^ec2-(\d+)-(\d+)-(\d+)-(\d+)\./);
  if (!m) return null;
  const ip = `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
  return isIPv4(ip) ? ip : null;
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
    servers: [{ url: `http://localhost:${PORT}` }],
  },
  apis: [__filename], // reads JSDoc from this file
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// optional: raw spec
app.get("/openapi.json", (req, res) => res.json(swaggerSpec));

// ---------- routes ----------
/**
 * @swagger
 * /aws-public-ip:
 *   get:
 *     summary: Resolve the public IPv4 for the configured AWS base URL
 *     description: >
 *       First tries to parse the IPv4 from EC2 public DNS names like ec2-34-202-126-158.compute-1.amazonaws.com.
 *       If that fails, falls back to DNS lookup.
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
 *                   example: parsed-from-hostname
 *                 ip:
 *                   type: string
 *                   example: 34.202.126.158
 *                 hostname:
 *                   type: string
 *                   example: ec2-34-202-126-158.compute-1.amazonaws.com
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

    const parsed = ipFromEc2Hostname(hostname);
    if (parsed) {
      return res.json({
        ok: true,
        method: "parsed-from-hostname",
        ip: parsed,
        hostname,
      });
    }

    const lookup = await dns.lookup(hostname, { family: 4 });
    return res.json({
      ok: true,
      method: "dns-lookup",
      ip: lookup.address,
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
  console.log(`Running on http://localhost:${PORT}`);
  console.log(`Swagger UI: http://localhost:${PORT}/docs`);
});



// const express = require("express");
// const dns = require("dns").promises;

// const app = express();

// const AWS_BASE_URL =
//   process.env.AWS_BASE_URL ||
//   "http://ec2-34-202-126-158.compute-1.amazonaws.com";

// const PORT = process.env.PORT || 3000;

// // Simple IPv4 validator
// function isIPv4(ip) {
//   const ipv4 =
//     /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
//   return ipv4.test(ip);
// }

// // Extract IP from EC2 public DNS name: ec2-34-202-126-158.compute-1.amazonaws.com
// function ipFromEc2Hostname(hostname) {
//   const m = hostname.match(/^ec2-(\d+)-(\d+)-(\d+)-(\d+)\./);
//   if (!m) return null;
//   const ip = `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
//   return isIPv4(ip) ? ip : null;
// }

// app.get("/aws-public-ip", async (req, res) => {
//   try {
//     const url = new URL(AWS_BASE_URL);
//     const hostname = url.hostname;

//     // 1) Try parsing from hostname (fast + no network)
//     const parsed = ipFromEc2Hostname(hostname);
//     if (parsed) {
//       return res.json({ ok: true, method: "parsed-from-hostname", ip: parsed, hostname });
//     }

//     // 2) Fallback to DNS lookup (general solution)
//     const lookup = await dns.lookup(hostname, { family: 4 });
//     return res.json({
//       ok: true,
//       method: "dns-lookup",
//       ip: lookup.address,
//       hostname,
//     });
//   } catch (err) {
//     return res.status(500).json({
//       ok: false,
//       error: "Failed to determine AWS public IP",
//       message: err.message,
//     });
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Running on http://localhost:${PORT}`);
//   console.log(`GET /aws-public-ip -> resolves IP for ${AWS_BASE_URL}`);
// });
