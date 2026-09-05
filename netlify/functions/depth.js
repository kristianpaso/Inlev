const { proxyMultipart } = require("./lib/proxy.js");

exports.handler = async (event) => proxyMultipart(event, {
  serviceUrl: process.env.DEPTH_SERVICE_URL,
  path: "/api/measurement/depth",
  serviceName: "Djupmodellen"
});
