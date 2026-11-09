---
title: "验证、打包与迭代"
description: "先离线检查，再打包并在本地测试项目中验收。"
---

## 离线检查

先用 Python 3 检查语法，对确定性逻辑使用小型 fixture，覆盖正常结果、缺少项目/时间线、过期对象与失败。扩展业务通过 context.resolve 获取官方连接，不导入 Clackly 内部模块，不在模块导入时调用宿主。

当前 context.project 与 context.timeline **都要求已打开项目且有当前时间线**。只需项目的工具，应从 Resolve ProjectManager 获取项目并处理空值。详见[生命周期](/Clackly/docs/developer/reference/extension-v1/)。

## 官方打包器

在可访问完整 Skill 的环境使用自带工具，替换以下路径：

~~~text
python clackly-developer/scripts/package_extension.py my-tool output/my-tool-1.0.0.clackly
~~~

Windows 可以使用已确认的 Python 3 或 py -3；其他系统使用 python3。输出位于源码目录之外，且不能已经存在。工具检查基础身份、精确入口路径、Python 语法和 execute/view 回调，再生成 ZIP；**它不导入或执行扩展，也不替代 Host 安装校验**。

[获取 package_extension.py 原文](/Clackly/agent/clackly-developer/scripts/package_extension.py)

## 真实 Host 验证

离线通过之后，交付源码、包、实际检查记录与手测步骤。由用户在隔离的本地测试项目中从 Settings 安装，检查配置、输入、确认、结果、过期目标和失败后的数据状态。不要为“完成测试”自动操作生产项目或当前 Clackly 安装。

## 迭代

同一工具保留 Extension ID、Command ID 与兼容的设置键/类型。修改源码后提升版本并重新打包，或用同版本 Replace；不要直接修改安装树。说明不兼容配置变化。超时可能已写入数据，重试前先核对，不能承诺事务或自动回滚。
