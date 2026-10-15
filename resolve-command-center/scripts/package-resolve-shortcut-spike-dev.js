const fs = require("node:fs");
const path = require("node:path");

const { DEVELOPMENT_MARKER } = require("../electron/main/experimentalResolveShortcut");
const {
  APP_ROOT,
  assertSafePackageSource,
  createAndVerifyZip,
  createDistribution,
  runExistingPackage
} = require("./package-internal-beta");

function stageDevelopmentPayload({ sourceRoot, stageRoot }) {
  assertSafePackageSource(sourceRoot);
  fs.mkdirSync(stageRoot, { recursive: true });
  fs.cpSync(sourceRoot, stageRoot, { recursive: true, dereference: false, errorOnExist: true });
  const marker = path.join(stageRoot, "resources", "app", DEVELOPMENT_MARKER);
  fs.writeFileSync(marker, "Resolve bound-shortcut development spike\n", { encoding: "utf8", flag: "wx" });
  return marker;
}

function packageDevelopmentBuild({
  appRoot = APP_ROOT,
  outputRoot = path.join(APP_ROOT, "build", "resolve-shortcut-spike-dev"),
  timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-")
} = {}) {
  runExistingPackage();
  const stageRoot = path.join(outputRoot, timestamp, "win-unpacked");
  const marker = stageDevelopmentPayload({
    sourceRoot: path.join(appRoot, "release", "win-unpacked"),
    stageRoot
  });
  const distribution = createDistribution({
    appRoot,
    packageRoot: stageRoot,
    outputRoot: path.dirname(stageRoot)
  });
  const zip = createAndVerifyZip(distribution);
  return { ...distribution, marker, stageRoot, zip };
}

if (require.main === module) {
  try {
    const result = packageDevelopmentBuild();
    console.log(`Prepared verified development payload: ${result.output}`);
    console.log(`Marker: ${result.marker}`);
    console.log(`ZIP SHA-256: ${result.zip.sha256}`);
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

module.exports = { packageDevelopmentBuild, stageDevelopmentPayload };
