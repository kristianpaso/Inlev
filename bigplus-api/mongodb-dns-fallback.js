const dns = require("dns");
const https = require("https");

const originalLookup = dns.lookup;
const originalResolveSrv = dns.promises.resolveSrv.bind(dns.promises);
const originalResolveTxt = dns.promises.resolveTxt.bind(dns.promises);
const cache = new Map();
const enabled = process.env.MONGODB_DOH !== "false";
const isMongoHost = (name) => /(^|\.)mongodb\.net\.?$/i.test(String(name));

function doh(name, type) {
  const key = `${type}:${name}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.answers);

  const base = process.env.MONGODB_DOH_URL || "https://dns.google/resolve";
  const url = `${base}?name=${encodeURIComponent(name)}&type=${type}`;
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { accept: "application/dns-json" } }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          const payload = JSON.parse(body);
          if (response.statusCode !== 200 || payload.Status !== 0 || !Array.isArray(payload.Answer)) {
            throw new Error(`DNS ${type} lookup failed for ${name}`);
          }
          const ttl = Math.max(10, Math.min(...payload.Answer.map((answer) => Number(answer.TTL) || 60)));
          cache.set(key, { answers: payload.Answer, expires: Date.now() + ttl * 1000 });
          resolve(payload.Answer);
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(8000, () => request.destroy(new Error("DNS lookup timeout")));
    request.on("error", reject);
  });
}

function answerAddress(answers) {
  const answer = answers.find((item) => item.type === 1 && /^\d+\.\d+\.\d+\.\d+$/.test(item.data));
  return answer && answer.data;
}

if (enabled) {
  dns.promises.resolveSrv = async (name) => {
    if (!isMongoHost(name)) return originalResolveSrv(name);
    const answers = await doh(name, "SRV");
    return answers.map((answer) => {
      const [priority, weight, port, target] = answer.data.split(/\s+/);
      return { priority: Number(priority), weight: Number(weight), port: Number(port), name: target.replace(/\.$/, "") };
    });
  };

  dns.promises.resolveTxt = async (name) => {
    if (!isMongoHost(name)) return originalResolveTxt(name);
    const answers = await doh(name, "TXT");
    return answers.map((answer) => [String(answer.data).replace(/^\"|\"$/g, "")]);
  };

  dns.lookup = function lookup(hostname, options, callback) {
    if (!isMongoHost(hostname)) return originalLookup.call(dns, hostname, options, callback);
    const actualOptions = typeof options === "function" ? {} : (options || {});
    const done = typeof options === "function" ? options : callback;
    doh(hostname, "A").then((answers) => {
      const address = answerAddress(answers);
      if (!address) throw new Error(`No IPv4 address for ${hostname}`);
      if (actualOptions && actualOptions.all) done(null, [{ address, family: 4 }]);
      else done(null, address, 4);
    }).catch((error) => done(error));
  };
}

module.exports = { enabled };
