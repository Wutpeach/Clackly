const http = require("node:http");
const { URL } = require("node:url");

const DEFAULT_BRIDGE_PORT = 49371;

function getBridgeUrl() {
  if (process.env.RESOLVE_COMMAND_CENTER_BRIDGE_URL) {
    return process.env.RESOLVE_COMMAND_CENTER_BRIDGE_URL.replace(/\/$/, "");
  }

  const port = process.env.RESOLVE_COMMAND_CENTER_PORT || String(DEFAULT_BRIDGE_PORT);
  return `http://127.0.0.1:${port}`;
}

function postJson(url, payload) {
  const body = JSON.stringify(payload);
  const target = new URL(url);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        method: "POST",
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        },
        timeout: 5000
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          try {
            const parsed = responseBody ? JSON.parse(responseBody) : {};
            if (response.statusCode >= 200 && response.statusCode < 300) {
              resolve(parsed);
              return;
            }

            reject(new Error(parsed.error || `Bridge returned HTTP ${response.statusCode}`));
          } catch (error) {
            reject(new Error(`Invalid bridge response: ${error.message}`));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Bridge request timed out"));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function getJson(url) {
  const target = new URL(url);

  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        timeout: 1000
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          try {
            const parsed = responseBody ? JSON.parse(responseBody) : {};
            if (response.statusCode >= 200 && response.statusCode < 300) {
              resolve(parsed);
              return;
            }

            reject(new Error(parsed.error || `Bridge returned HTTP ${response.statusCode}`));
          } catch (error) {
            reject(new Error(`Invalid bridge response: ${error.message}`));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Bridge health request timed out"));
    });
    request.on("error", reject);
  });
}

function createBridgeExecutionAdapter({
  getUrl = getBridgeUrl,
  request = postJson,
  checkHealth = getJson
} = {}) {
  return {
    isAvailable: async () => {
      try {
        const response = await checkHealth(`${getUrl()}/health`);
        return response && response.ok === true;
      } catch (_error) {
        return false;
      }
    },
    addMarker: () => request(`${getUrl()}/command`, {
      command: "timeline.addMarker"
    })
  };
}

module.exports = {
  createBridgeExecutionAdapter,
  getJson,
  getBridgeUrl,
  postJson
};
