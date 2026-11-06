const { fail } = require('./package');
const { CAPABILITY } = require('./ExtensionManager');

// ExtensionManager supplies the verified root; renderers can execute command IDs only.
function createExtensionPythonExecutor(runtimeManager) {
  return async ({ root, entry, commandId, config, input = {}, bytecodeCacheRoot, phase = 'execute' }) => {
    try {
      const { resolution, selectedBootstrap, readiness } = await runtimeManager.resolveAndProbe({ runtime: 'python', capabilityId: CAPABILITY });
      const launched = await runtimeManager.launcher.execute({ resolution, bootstrapPath: selectedBootstrap, bytecodeCacheRoot,
        request: { operation: 'script-execute', scriptRoot: root, entry, commandId, config, input, phase,
          ...(readiness.bridge ? { bridge: readiness.bridge } : {}) } });
      const script = launched?.response?.script;
      if (!script || typeof script.ok !== 'boolean' || !Array.isArray(script.logs)) throw fail('EXTENSION_RUNTIME_PROTOCOL', 'Python 返回无效结果。');
      if (!script.ok) {
        const error = fail('EXTENSION_SCRIPT_FAILED', '扩展执行失败：' + (script.error?.message || 'Python error'));
        error.userMessage = String(script.error?.message || 'Python error').slice(0, 2000);
        throw error;
      }
      return script;
    } catch (error) {
      if (error.code?.startsWith('EXTENSION_')) throw error;
      throw fail('EXTENSION_RUNTIME_FAILED', 'Resolve Python 执行失败：' + (error.code || error.message));
    }
  };
}
module.exports = { createExtensionPythonExecutor };
