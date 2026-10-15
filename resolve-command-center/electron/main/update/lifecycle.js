// Hold normal Electron shutdown only until task-owned streams and partial files
// are closed. A crash still leaves inert generated files for startup cleanup.
function registerUpdateLifecycle({ app, updateService }) {
  let quitting = false;
  let cleaned = false;
  app.on('before-quit', (event) => {
    if (cleaned) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    Promise.resolve(updateService.dispose()).catch(() => {}).finally(() => { cleaned = true; app.quit(); });
  });
}
module.exports = { registerUpdateLifecycle };
