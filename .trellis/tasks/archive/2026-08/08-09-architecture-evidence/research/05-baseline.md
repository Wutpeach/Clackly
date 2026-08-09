# 05 — 测试基线（Phase 0）

## 命令矩阵

从 package.json 解析出的验证命令（无独立 lint / typecheck / CI job；`npm run build` = vite build 仅构建 renderer，与后端 main-process 代码无关）。

| 命令 | 用途 | 基线（2026-08-09, Windows 11, Node via npm test） |
|---|---|---|
| `npm test` | 全部 unit/integration（node --test 15 个 glob 目录 + 5 组 python unittest） | ✅ exit 0 |
| `npm run build` | vite build（renderer） | ✅ exit 0 —— 2026-08-09 实测：`vite v8.1.5`，1786 modules transformed，`dist/renderer/index.html` 0.39 kB + assets（index-DBzRlV_h.js 171.11 kB gzip 55.04 kB / index-DnlcyGqx.css 22.50 kB / HarmonyOS_Sans.ttf 342.07 kB），built in 291ms |
| `npm run lint` / typecheck | 无此脚本（package.json scripts 中不存在） | N/A——仓库未配置 |
| CI | 无 .github/workflows | N/A——仓库未配置 |

## 基线明细（`npm test`，含本阶段新增 8 个 JS 测试）

- node --test：**215 tests, 215 pass, 0 fail**（基线 207 + 新增 8；见下），0 skipped/cancelled/todo
- python unittest：5 组全 OK
  - `bridge/test_*.py`：3 tests OK
  - `resolve/test_*.py`：15 tests OK
  - `script-runtime/test_*.py`：15 tests OK
  - `resolve2ae_core/tests/test_*.py`：26 tests OK
  - `scripts/test_*.py`：2 tests OK

历史失败：无——基线全绿，未发现需记录的无关历史失败。

## 新增 characterization tests（本阶段）

| 文件 | 测试数 | 运行确认 |
|---|---|---|
| capability/script.test.js | 3 | ✅ |
| capability/registerScripts.defaultWiring.test.js | 1 | ✅ |
| electron/main/composition.test.js | 4 | ✅ |

单跑验证：`node --test capability/script.test.js capability/registerScripts.defaultWiring.test.js electron/main/composition.test.js` → 8 pass / 0 fail；随后完整 `npm test` 复跑 → 215/215 pass + 5 组 Python OK。

## 基线结论

- 仓库质量门当前只有 `npm test`；无 lint/typecheck/CI。若 Phase 1/2 需要更严格门禁，属用户决策，不在本阶段范围。
- 新增测试全部是纯 characterization（只断言现状），删除即可回滚，不影响任何产品行为。
