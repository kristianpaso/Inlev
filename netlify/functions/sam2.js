const { proxyMultipart } = require("./lib/proxy.js");

exports.handler = async (event) => proxyMultipart(event, {
  serviceUrl: process.env.SAM2_SERVICE_URL,
  path: "/api/annotation/sam2",
  serviceName: "SAM 2"
});
