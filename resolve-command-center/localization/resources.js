// Main-process CommonJS consumers keep this stable require() entry point.
// The ESM source remains the single resource authority for Vite renderers.
module.exports = require("./resources.mjs");
