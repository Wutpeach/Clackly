def _field(label, value):
    # Explicit result fields have a smaller limit than individual inputs.
    return {"label": label, "value": str(value)[:2000]}


def execute(context):
    command = context.command_id.rsplit("/", 1)[-1]
    result = {"$clackly": "result", "version": 1, "status": "success"}
    if command == "notice":
        result["message"] = "操作成功"
        return result
    if command == "details":
        result.update(
            message="结构化详情已准备",
            text="这是无需输入的只读详情。",
            fields=[_field("类型", "运行摘要示例"), _field("Resolve 项目", "未连接")],
            items=["无需输入", "不修改 Resolve 项目"],
        )
        return result
    if command != "summary":
        raise ValueError("未知命令")

    values = context.input
    prefix = context.config.get("prefix", "")
    title = values["title"]
    notes = values.get("notes", "")
    numbers = [values["number_one"], values["number_two"], values["number_three"]]
    include_tags = values.get("include_tags", False)
    display_format = values.get("format", "简洁")
    color = values.get("color", "")
    file_path = values.get("file", "")
    folder_path = values.get("folder", "")
    heading = (prefix + " " if prefix else "") + title
    text = heading + ("\n备注：" + notes if notes else "")
    fields = [
        _field("前缀", prefix), _field("标题", title), _field("备注", notes),
        _field("数字一", numbers[0]), _field("数字二", numbers[1]),
        _field("数字三", numbers[2]), _field("包括标签", "是" if include_tags else "否"),
        _field("格式", display_format), _field("颜色", color),
        _field("文件", file_path), _field("文件夹", folder_path),
    ]
    items = ["数字：" + str(number) for number in numbers]
    if include_tags:
        items.extend(["标签：" + display_format, "标签：" + color])
    result.update(message="本次摘要已生成", text=text[:32768], fields=fields, items=items)
    return result
