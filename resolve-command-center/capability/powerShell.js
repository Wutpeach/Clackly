const POWER_SHELL_TIMEOUT_MS = 5000;

function runExecFile(execFile, executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      encoding: "utf8",
      timeout: POWER_SHELL_TIMEOUT_MS,
      windowsHide: true,
      shell: false,
      maxBuffer: 1024 * 1024,
      ...options
    }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(String(stdout));
    });
  });
}

module.exports = { POWER_SHELL_TIMEOUT_MS, runExecFile };
