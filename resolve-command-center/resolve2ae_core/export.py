#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
[V1.0.1] Resolve2AE @Awei (LUT Support)
------------------------------------------------
1. [NEW] 自动获取片段 Input LUT 并应用到 AE Lumetri Color。
2. [V28.4] 设置界面：调试模式开关、自定义合成名称前缀。
3. [V28.3] JSX 自动清理（AE执行完自删除）。
4. [V28.2] 跳过被禁用的片段（D键禁用）。
5. [V28.1] Cyan标记支持：同时导出视频+音频轨道2。
6. [FIX] 修复翻转时锚点偏移取反的问题。
7. [FIX] 修复旋转方向在不同翻转状态下的转换规则。
"""

import os
import json
import platform
import time
import shutil
import tempfile
import math

from resolve.adapter import read_timeline_markers, read_timeline_start_frame
from resolve.timeline_range import TimelineRangeScanError, resolve_timeline_range

# ================= [1. 常量与配置] =================
CONFIG_FILE = os.path.join(os.path.expanduser("~"), ".resolve_to_ae_config.json")

BLEND_MODE_MAP = {
    0:  "BlendingMode.NORMAL",          1:  "BlendingMode.ADD",
    2:  "BlendingMode.SUBTRACT",        3:  "BlendingMode.DIFFERENCE",
    4:  "BlendingMode.MULTIPLY",        5:  "BlendingMode.SCREEN",
    6:  "BlendingMode.OVERLAY",         7:  "BlendingMode.HARD_LIGHT",
    8:  "BlendingMode.SOFT_LIGHT",      9:  "BlendingMode.DARKEN",
    10: "BlendingMode.LIGHTEN",         11: "BlendingMode.COLOR_DODGE",
    12: "BlendingMode.COLOR_BURN",      13: "BlendingMode.EXCLUSION",
    14: "BlendingMode.HUE",             15: "BlendingMode.SATURATION",
    16: "BlendingMode.COLOR",           17: "BlendingMode.LUMINOSITY",
    18: "BlendingMode.DIVIDE",          19: "BlendingMode.LINEAR_DODGE",
    20: "BlendingMode.LINEAR_BURN",     21: "BlendingMode.LINEAR_LIGHT",
    22: "BlendingMode.VIVID_LIGHT",     23: "BlendingMode.PIN_LIGHT",
    24: "BlendingMode.HARD_MIX",        25: "BlendingMode.LIGHTER_COLOR",
    26: "BlendingMode.DARKER_COLOR",    27: "BlendingMode.NORMAL",
    28: "BlendingMode.STENCIL_ALPHA",   29: "BlendingMode.SILHOUETTE_ALPHA",
    30: "BlendingMode.STENCIL_LUMA",    31: "BlendingMode.SILHOUETTE_LUMA"
}


def load_config():
    default_conf = {
        "last_known_ae_path": "",
        "debug_mode": False,
        "prefix": "Link"
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return {**default_conf, **json.load(f)}
        except: pass
    return default_conf

def timecode_to_frames(tc_str, fps):
    try:
        hours, minutes, seconds, frames = map(int, tc_str.split(':'))
        return int((hours * 3600 + minutes * 60 + seconds) * fps + frames)
    except: return 0

def parse_resolution(res_str):
    try:
        if not res_str: return 0, 0
        parts = res_str.lower().split('x')
        if len(parts) >= 2:
            return int(parts[0]), int(parts[1])
    except: pass
    return 0, 0

# ================= [1.5 LUT 搜索] =================

def get_ae_lut_dir(ae_path):
    """从 AE 可执行文件路径推导 Lumetri LUT 目录"""
    if not ae_path:
        return None
    if platform.system() == "Darwin":
        contents_dir = os.path.dirname(os.path.dirname(ae_path))
        lut_dir = os.path.join(contents_dir, "Lumetri", "LUTs", "Technical")
    else:
        support_dir = os.path.dirname(ae_path)
        lut_dir = os.path.join(support_dir, "Lumetri", "LUTs", "Technical")
    return lut_dir


def get_lut_directories():
    """获取 Resolve LUT 搜索目录"""
    dirs = []
    if platform.system() == "Windows":
        dirs = [
            r"C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\LUT",
            os.path.expandvars(r"%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\LUT"),
        ]
    else:
        dirs = [
            "/Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT",
            os.path.expanduser("~/Library/Application Support/Blackmagic Design/DaVinci Resolve/LUT"),
        ]
    return [d for d in dirs if os.path.exists(d)]


def find_lut_file(lut_name):
    """从 LUT 名称搜索实际文件路径"""
    if not lut_name:
        return None

    search_dirs = get_lut_directories()
    extensions = ['.cube', '.3dl', '.look', '.mga', '.m3d', '.csp']

    # 直接拼接相对路径
    for search_dir in search_dirs:
        for ext in extensions:
            direct_path = os.path.join(search_dir, lut_name + ext)
            if os.path.exists(direct_path):
                return direct_path

    return None


def copy_lut_to_ae(src_path, ae_lut_dir):
    """复制 LUT 到 AE 目录，返回目标文件名"""
    if not src_path or not os.path.exists(src_path) or not ae_lut_dir:
        return None

    filename = os.path.basename(src_path)
    dest_path = os.path.join(ae_lut_dir, filename)

    # 检查是否已存在
    if os.path.exists(dest_path):
        return filename

    # 复制文件
    try:
        shutil.copy2(src_path, dest_path)
        return filename
    except:
        return None


# ================= [2. 智能选区逻辑] =================

class MissingMarkerError(ValueError):
    pass


def get_target_clips_logic(timeline, target_policy="auto", media_policy="mixed"):
    if target_policy not in {"auto", "single", "blue-range"}:
        raise ValueError(f"Unsupported target policy: {target_policy}")
    if media_policy not in {"mixed", "audio", "video"}:
        raise ValueError(f"Unsupported media policy: {media_policy}")
    try:
        fps_str = timeline.GetSetting("timelineFrameRate")
        fps = float(fps_str) if fps_str else 24.0
    except: fps = 24.0

    start_frame = 0
    end_frame = 0
    mode = "single"

    tl_start_frame = read_timeline_start_frame(timeline)

    if target_policy in {"auto", "blue-range"}:
        timeline_range = None
        try:
            markers = read_timeline_markers(timeline)
        except Exception:
            if target_policy != "auto":
                raise
        else:
            try:
                timeline_range = resolve_timeline_range(tl_start_frame, markers)
            except TimelineRangeScanError as error:
                if target_policy != "auto":
                    raise error.cause from None
                timeline_range = error.resolve_partial(tl_start_frame)
        if timeline_range is not None:
            start_frame = timeline_range.start_frame
            end_frame = timeline_range.end_frame_exclusive
            mode = "batch"
        elif target_policy == "blue-range":
            raise MissingMarkerError("No Blue duration marker found")

    if mode == "single":
        current_tc = timeline.GetCurrentTimecode()
        start_frame = timecode_to_frames(current_tc, fps)
        end_frame = start_frame + 1

    def collect_clips(track_type):
        clips = []
        track_count = timeline.GetTrackCount(track_type)
        for t_idx in range(1, track_count + 1):
            if not timeline.GetIsTrackEnabled(track_type, t_idx): continue
            items = timeline.GetItemListInTrack(track_type, t_idx)
            if not items: continue

            for item in items:
                # [V28.2] 跳过被禁用的片段（D键禁用）
                if not item.GetClipEnabled(): continue

                i_start = item.GetStart()
                i_end = item.GetEnd()

                is_hit = False
                if mode == "batch":
                    if (i_start < end_frame and i_end > start_frame): is_hit = True
                else:
                    if i_start <= start_frame < i_end: is_hit = True

                if is_hit:
                    clips.append({
                        'item': item,
                        'track_index': t_idx,
                        'start_frame': i_start,
                        'track_type': track_type
                    })
        return clips

    def build_item_key(item, fallback_track_type=None, fallback_track_index=None):
        track_type = fallback_track_type
        track_index = fallback_track_index
        try:
            track_info = item.GetTrackTypeAndIndex()
            if track_info and len(track_info) >= 2:
                track_type = track_info[0]
                track_index = track_info[1]
        except:
            pass

        try:
            i_start = int(item.GetStart())
        except:
            i_start = -1
        try:
            i_end = int(item.GetEnd())
        except:
            i_end = -1
        try:
            i_name = item.GetName() or ""
        except:
            i_name = ""

        return (track_type, track_index, i_start, i_end, i_name)

    def topmost(clips):
        if not clips:
            return []
        max_track = max(c['track_index'] for c in clips)
        return [c for c in clips if c['track_index'] == max_track]

    video_clips = collect_clips("video")
    audio_clips = collect_clips("audio")

    def is_linked_to_video(audio_clip, video_keys):
        try:
            linked_items = audio_clip['item'].GetLinkedItems()
            if linked_items:
                for linked_item in linked_items:
                    linked_key = build_item_key(linked_item)
                    if linked_key[0] == "video" and linked_key in video_keys:
                        return True
        except Exception:
            pass
        return False

    if media_policy == "video":
        target_clips = video_clips if mode == "batch" else topmost(video_clips)
        content_type = "video"
    elif media_policy == "audio":
        target_clips = audio_clips if mode == "batch" else topmost(audio_clips)
        content_type = "audio"
    elif mode == "batch":
        # [V28.8] 混合批量：收集重叠视频与音频，去重已链接视频的音频层
        target_clips = list(video_clips)
        content_type = "video"
        video_keys = set(
            build_item_key(clip['item'], "video", clip['track_index'])
            for clip in video_clips
        )
        kept_audio = [
            clip for clip in audio_clips
            if not is_linked_to_video(clip, video_keys)
        ]
        if kept_audio:
            target_clips.extend(kept_audio)
            content_type = "mixed" if video_clips else "audio"
    else:
        # 单点混合：独立选择最上层视频与最上层音频，丢弃被该视频代表的链接音频
        top_video = topmost(video_clips)
        top_audio = topmost(audio_clips)
        if not top_video:
            target_clips = top_audio
            content_type = "audio"
        elif not top_audio:
            target_clips = top_video
            content_type = "video"
        else:
            video_key = build_item_key(
                top_video[0]['item'], "video", top_video[0]['track_index']
            )
            if is_linked_to_video(top_audio[0], {video_key}):
                target_clips = top_video
                content_type = "video"
            else:
                target_clips = top_video + top_audio
                content_type = "mixed"

    return mode, target_clips, fps, content_type

# ================= [3. OTIO 解析 (Robust)] =================

def parse_otio_robust(otio_path, timeline_start_frame, fps, debug=False):
    if debug:
        print(f"🕵️ OTIO Parser V1.0.1 (Base: {timeline_start_frame})")
    otio_exact_map = {}
    otio_fallback_list = []

    try:
        with open(otio_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        tracks = data.get("tracks", {}).get("children", [])
        current_v_track = 1

        for track in tracks:
            kind = track.get("kind", "Unknown")
            if "video" not in kind.lower():
                continue

            current_track_time_val = 0
            clips = track.get("children", [])
            for clip in clips:
                duration_val = 0
                duration_rate = fps

                source_range = clip.get("source_range")
                if source_range:
                    duration_val = source_range.get("duration", {}).get("value", 0)
                    duration_rate = source_range.get("duration", {}).get("rate", fps)

                frames_duration = int(duration_val * (fps / duration_rate)) if duration_rate else 0
                global_start = int(timeline_start_frame + current_track_time_val)
                schema = clip.get("OTIO_SCHEMA", "")

                if schema.startswith("Clip"):
                    clip_name = clip.get("name", "")
                    props = {
                        "zoom_x": 1.0, "zoom_y": 1.0, "pan": 0.0, "tilt": 0.0,
                        "rotation": 0.0, "anchor_x": 0.0, "anchor_y": 0.0,
                        "flip_x": False, "flip_y": False, "blend_mode": 0, "opacity": 100.0,
                        "time_scalar": 1.0,
                        "speed_keyframes": None,
                        "dynamic_zoom_keyframes": None,
                        "crop_left": 0.0, "crop_right": 0.0, "crop_top": 0.0, "crop_bottom": 0.0,
                        "distortion": 0.0,
                        "_debug_name": clip_name
                    }
                    effects = clip.get("effects", [])
                    for effect in effects:
                        # 恒定变速：LinearTimeWarp 的数据在顶层，不在 Resolve_OTIO metadata 中
                        effect_schema = effect.get("OTIO_SCHEMA", "")
                        if effect_schema.startswith("LinearTimeWarp"):
                            props["time_scalar"] = float(effect.get("time_scalar", 1.0))
                            if debug:
                                print(f"      -> [Info] Speed: {props['time_scalar']}x ({clip_name})")
                            continue

                        # 变速曲线：TimeEffect 的关键帧数据在 Resolve_OTIO metadata 中
                        if effect_schema.startswith("TimeEffect"):
                            kf_data = effect.get("metadata", {}).get("Resolve_OTIO", {}).get("Key Frames", [])
                            if kf_data:
                                props["speed_keyframes"] = kf_data
                                if debug:
                                    print(f"      -> [Info] Speed Ramp: {len(kf_data)} keyframes ({clip_name})")
                            continue

                        meta = effect.get("metadata", {}).get("Resolve_OTIO", {})
                        e_name = meta.get("Effect Name", "")
                        params = meta.get("Parameters", [])

                        if e_name == "Composite":
                            for p in params:
                                # 1. 获取参数 ID 并转为小写 (适配你的 snippet: "composite mode")
                                pid = p.get("Parameter ID", "").lower()
                                val = p.get("Parameter Value")

                                # 2. 精确匹配 "composite mode"
                                if "composite mode" in pid:
                                    try:
                                        # 直接读取数字 ID (例如 29)
                                        props["blend_mode"] = int(val)
                                    except: pass

                                if "opacity" in pid:
                                    try:
                                        props["opacity"] = float(val)
                                    except: pass


                        if e_name == "Cropping":
                            for p in params:
                                pid = p.get("Parameter ID", "").lower()
                                val = p.get("Parameter Value", 0.0)
                                if "cropleft" in pid: props["crop_left"] = float(val)
                                elif "cropright" in pid: props["crop_right"] = float(val)
                                elif "croptop" in pid: props["crop_top"] = float(val)
                                elif "cropbottom" in pid: props["crop_bottom"] = float(val)
                            if debug:
                                cl, cr, ct, cb = props["crop_left"], props["crop_right"], props["crop_top"], props["crop_bottom"]
                                if cl or cr or ct or cb:
                                    print(f"      -> [Info] Crop: L={cl} R={cr} T={ct} B={cb} ({clip_name})")

                        if e_name == "Lens Correction":
                            for p in params:
                                if p.get("Parameter ID", "") == "distortionParam":
                                    props["distortion"] = float(p.get("Parameter Value", 0.0))
                            if debug and abs(props["distortion"]) > 0.001:
                                print(f"      -> [Info] Lens Correction: {props['distortion']} ({clip_name})")

                        if e_name == "Dynamic Zoom":
                            # [FIX] 检查 Dynamic Zoom 是否启用
                            dz_enabled = meta.get("Enabled", True)
                            if dz_enabled is False:
                                if debug:
                                    print(f"      -> [Info] Dynamic Zoom disabled, skipping ({clip_name})")
                            else:
                                dz_kfs = {"scale": {}, "center": {}}
                                for p in params:
                                    pid = p.get("Parameter ID", "")
                                    kf_dict = p.get("Key Frames", {})
                                    if pid == "dynamicZoomScale":
                                        for frame_str, kf_data in kf_dict.items():
                                            frame = int(frame_str)
                                            dz_kfs["scale"][frame] = float(kf_data.get("Value", 1.0))
                                    elif pid == "dynamicZoomCenter":
                                        for frame_str, kf_data in kf_dict.items():
                                            frame = int(frame_str)
                                            val = kf_data.get("Value", [0.0, 0.0])
                                            dz_kfs["center"][frame] = [float(val[0]), float(val[1])]
                                if dz_kfs["scale"]:
                                    props["dynamic_zoom_keyframes"] = dz_kfs
                                    if debug:
                                        print(f"      -> [Info] Dynamic Zoom: {len(dz_kfs['scale'])} keyframes ({clip_name})")

                        if e_name == "Transform":
                            for p in params:
                                pid = p.get("Parameter ID", "")
                                val = p.get("Parameter Value")
                                pid_low = pid.lower()

                                is_true = (val is True) or (val == 1) or (str(val).lower() == "true")

                                if "zoomx" in pid_low: props["zoom_x"] = float(val)
                                if "zoomy" in pid_low: props["zoom_y"] = float(val)
                                if "pan" in pid_low: props["pan"] = float(val)
                                if "tilt" in pid_low: props["tilt"] = float(val)
                                if "rotationangle" in pid_low: props["rotation"] = float(val)
                                if "flipx" in pid_low and is_true:
                                    props["flip_x"] = True
                                    if debug: print(f"      -> [Info] Flip X ON: {clip_name}")

                                if "flipy" in pid_low and is_true:
                                    props["flip_y"] = True
                                    if debug: print(f"      -> [Info] Flip Y ON: {clip_name}")

                                if "anchorpoint" in pid_low and isinstance(val, list) and len(val) >= 2:
                                    props["anchor_x"] = float(val[0])
                                    props["anchor_y"] = float(val[1])
                    otio_exact_map[(current_v_track, global_start)] = props
                    otio_exact_map[(current_v_track, global_start - 1)] = props
                    otio_exact_map[(current_v_track, global_start + 1)] = props

                    otio_fallback_list.append({
                        "track": current_v_track,
                        "start": global_start,
                        "name": clip_name,
                        "props": props
                    })

                current_track_time_val += frames_duration
            current_v_track += 1

    except Exception as e:
        if debug: print(f"⚠️ OTIO Error: {e}")
    return otio_exact_map, otio_fallback_list

def find_props_dual_lock(t_idx, item_start, item_name, exact_map, fallback_list):
    if (t_idx, item_start) in exact_map:
        return exact_map[(t_idx, item_start)], "Exact"

    best_match = None
    min_dist = 99999

    n1 = item_name.lower().replace(".mp4", "").replace(".mov", "").strip()

    for entry in fallback_list:
        if entry["track"] != t_idx: continue
        n2 = entry["name"].lower().replace(".mp4", "").replace(".mov", "").strip()
        if (n1 in n2) or (n2 in n1):
            dist = abs(entry["start"] - item_start)
            if dist < 20:
                if dist < min_dist:
                    min_dist = dist
                    best_match = entry["props"]

    if best_match:
        return best_match, f"Fuzzy (Dist {min_dist})"

    return None, "Fail"

# ================= [4. 核心执行 (V27.0 Anchor Position Fix)] =================

SUPPORTED_COMMAND_TRIPLES = {
    ("auto", "auto", "mixed"),
    ("audio-only", "auto", "audio"),
    ("video-only", "auto", "video"),
    ("single", "single", "mixed"),
    ("video-range", "blue-range", "video"),
    ("mixed-range", "blue-range", "mixed"),
}


def _terminal_result(ok, code, mode, target_policy, media_policy, clip_count, message):
    return {
        "ok": ok,
        "code": code,
        "mode": mode,
        "target_policy": target_policy,
        "media_policy": media_policy,
        "clip_count": clip_count,
        "message": message,
    }


def process_and_send(
    resolve,
    project,
    ae_path,
    status_callback,
    config=None,
    mode="auto",
    target_policy="auto",
    media_policy="mixed",
):
    if config is None:
        config = load_config()
    if (mode, target_policy, media_policy) not in SUPPORTED_COMMAND_TRIPLES:
        raise ValueError(
            "Unsupported export triple: "
            f"mode={mode!r} target_policy={target_policy!r} media_policy={media_policy!r}"
        )

    ae_lut_dir = get_ae_lut_dir(ae_path)

    timeline = project.GetCurrentTimeline()
    if not timeline:
        message = "No Timeline"
        status_callback(f"❌ {message}")
        return _terminal_result(False, "no-timeline", mode, target_policy, media_policy, 0, message)

    status_callback("Analyzing...")
    try:
        scope_mode, target_clips, fps, content_type = get_target_clips_logic(
            timeline, target_policy, media_policy
        )
    except MissingMarkerError as error:
        status_callback(f"❌ {error}")
        return _terminal_result(False, "missing-marker", mode, target_policy, media_policy, 0, str(error))
    if not target_clips:
        message = "No Clips"
        status_callback(f"⚠️ {message}")
        return _terminal_result(False, "no-clips", mode, target_policy, media_policy, 0, message)

    timeline_name = timeline.GetName()
    tl_width = float(timeline.GetSetting("timelineResolutionWidth"))
    tl_height = float(timeline.GetSetting("timelineResolutionHeight"))

    tl_start = timeline.GetStartFrame()
    if tl_start is None: tl_start = 86400

    otio_exact_map = {}
    otio_fallback_list = []

    temp_dir = tempfile.gettempdir()
    timestamp = int(time.time())

    has_video = any(clip["track_type"] == "video" for clip in target_clips)
    if has_video:
        temp_otio_path = os.path.join(temp_dir, f"resolve_export_{timestamp}.otio")

        status_callback("Exporting OTIO...")
        if timeline.Export(temp_otio_path, resolve.EXPORT_OTIO, resolve.EXPORT_NONE):
            status_callback("Parsing Data...")
            otio_exact_map, otio_fallback_list = parse_otio_robust(temp_otio_path, tl_start, fps, debug=config.get('debug_mode', False))
            if config.get('debug_mode', False):
                print(f"[Debug] OTIO saved: {temp_otio_path}")
            else:
                try: os.remove(temp_otio_path)
                except: pass
        else:
            status_callback("Generating JSX...")

    # 从配置获取前缀
    prefix = config.get('prefix', 'Link')

    jsx = []
    jsx.append(f"// Resolve2AE V1.0.1")
    jsx.append(f"app.beginUndoGroup('Import Resolve Clips');")

    min_start = min([c['item'].GetStart() for c in target_clips])
    max_end = max([c['item'].GetEnd() for c in target_clips])
    comp_duration_sec = (max_end - min_start) / fps
    comp_name = f"{prefix}_{timeline_name}_{scope_mode}_{timestamp}"
    jsx.append(f"var comp = app.project.items.addComp('{comp_name}', {int(tl_width)}, {int(tl_height)}, 1, {comp_duration_sec}, {fps});")

    # 根据配置决定是否打开 Viewer
    jsx.append(f"comp.openInViewer();")

    global_start_frame = min_start

    # [V28.1] 排序：音频在前，视频在后（AE中后添加的在上，所以视频会显示在音频上方）
    sorted_clips = sorted(target_clips, key=lambda c: (0 if c.get('track_type') == 'audio' else 1, c['track_index']))

    if config.get('debug_mode', False):
        print(f"\n--- Matching Report ({len(sorted_clips)} clips) ---")

    def has_unmuted_source_audio(timeline_item):
        try:
            mapping_data = timeline_item.GetSourceAudioChannelMapping()
            if not mapping_data:
                return True

            mapping = mapping_data
            if isinstance(mapping_data, str):
                mapping = json.loads(mapping_data)
            if not isinstance(mapping, dict):
                return True

            track_mapping = mapping.get("track_mapping")
            if not isinstance(track_mapping, dict):
                return True

            for _, track_info in track_mapping.items():
                if isinstance(track_info, dict) and (not track_info.get("mute", False)):
                    return True
            return False
        except:
            return True

    for clip_data in sorted_clips:
        item = clip_data['item']
        t_idx = clip_data['track_index']
        item_start = item.GetStart()
        item_name = item.GetName()
        clip_track_type = clip_data.get('track_type', 'video')  # [V28.1] 获取片段轨道类型
        video_has_linked_audio = True  # [V28.7] 默认兼容旧行为
        if clip_track_type == "video":
            video_has_linked_audio = False
            try:
                linked_items = item.GetLinkedItems()
                if linked_items:
                    for linked_item in linked_items:
                        try:
                            linked_info = linked_item.GetTrackTypeAndIndex()
                            if not (linked_info and len(linked_info) >= 1 and linked_info[0] == "audio"):
                                continue

                            linked_track_index = linked_info[1] if len(linked_info) >= 2 else None
                            if linked_track_index is not None:
                                try:
                                    if not timeline.GetIsTrackEnabled("audio", int(linked_track_index)):
                                        continue
                                except:
                                    pass

                            try:
                                if not linked_item.GetClipEnabled():
                                    continue
                            except:
                                pass

                            if not has_unmuted_source_audio(linked_item):
                                continue

                            video_has_linked_audio = True
                            break
                        except:
                            pass
            except:
                # API 不可用或异常时，保持旧行为（不自动静音）
                video_has_linked_audio = True

        mp_item = item.GetMediaPoolItem()
        if not mp_item: continue
        file_path = mp_item.GetClipProperty("File Path")
        if not file_path: continue
        file_path_js = file_path.replace("\\", "\\\\")

        # [V28.5] 获取 LUT 路径并复制到 AE 目录
        lut_filename = None
        input_lut = mp_item.GetClipProperty("Input LUT")
        if input_lut:
            lut_path = find_lut_file(input_lut)
            if lut_path:
                lut_filename = copy_lut_to_ae(lut_path, ae_lut_dir)
                if config.get('debug_mode', False) and lut_filename:
                    print(f"  LUT: {lut_filename}")

        rel_start_time = (item.GetStart() - global_start_frame) / fps
        source_start_sec = item.GetLeftOffset() / fps
        duration_sec = item.GetDuration() / fps

        jsx.append(f"// Clip: {item_name}")
        jsx.append(f"var fileItem = null;")
        jsx.append(f"for (var k=1; k<=app.project.items.length; k++) {{ if (app.project.items[k].file && app.project.items[k].file.fsName == '{file_path_js}') {{ fileItem = app.project.items[k]; break; }} }}")
        jsx.append(f"if (!fileItem) {{ fileItem = app.project.importFile(new ImportOptions(File('{file_path_js}'))); }}")
        jsx.append(f"if (fileItem.mainSource && fileItem.mainSource.nativeFrameRate) {{ fileItem.mainSource.conformFrameRate = fileItem.mainSource.nativeFrameRate; }}")

        jsx.append(f"var layer = comp.layers.add(fileItem);")
        jsx.append(f"layer.name = '{item_name}';")

        # [V28.1] 根据片段轨道类型判断，而不是全局 content_type
        if clip_track_type == "audio":
            jsx.append(f"layer.enabled = false;")
            jsx.append(f"layer.audioEnabled = true;")
            jsx.append(f"layer.label = 11;")
            jsx.append(f"layer.name = '[Audio] ' + layer.name;")
        elif clip_track_type == "video" and (media_policy == "video" or not video_has_linked_audio):
            # [V28.7] 视频片段无关联音频时自动静音；纯视频导出强制静音每个视频层
            jsx.append(f"layer.audioEnabled = false;")

        # 提前获取 props 以读取 time_scalar（需在时间设置之前）
        props = None
        method = "N/A"
        if clip_track_type == "video":
            props, method = find_props_dual_lock(t_idx, item_start, item_name, otio_exact_map, otio_fallback_list)

        # 获取变速系数和变速曲线（仅视频片段有 props）
        time_scalar = 1.0
        speed_keyframes = None
        if clip_track_type == "video" and props:
            time_scalar = props.get("time_scalar", 1.0)
            speed_keyframes = props.get("speed_keyframes", None)

        if speed_keyframes:
            # 变速曲线模式：使用 Time Remapping
            # OTIO 关键帧时间基于源素材绝对时间（秒），需过滤到片段范围并转换坐标
            clip_in = source_start_sec
            clip_out = source_start_sec + duration_sec

            # 线性插值：在 kf[0] 坐标系中计算任意时刻 t 对应的 kf[1]
            def lerp_source(t, kfs):
                if t <= kfs[0][0]: return kfs[0][1]
                if t >= kfs[-1][0]: return kfs[-1][1]
                for i in range(len(kfs) - 1):
                    t0, s0 = kfs[i][0], kfs[i][1]
                    t1, s1 = kfs[i + 1][0], kfs[i + 1][1]
                    if t0 <= t <= t1:
                        frac = (t - t0) / (t1 - t0) if (t1 - t0) > 0 else 0
                        return s0 + frac * (s1 - s0)
                return kfs[-1][1]

            # 构建 AE 关键帧：[(相对片段时间, 源素材绝对时间), ...]
            ae_kfs = []
            for kf in speed_keyframes:
                ae_t = kf[0] - clip_in
                if -0.001 < ae_t < duration_sec + 0.001:
                    ae_kfs.append((max(0.0, min(ae_t, duration_sec)), kf[1]))

            # 补全起点
            if not ae_kfs or ae_kfs[0][0] > 0.001:
                ae_kfs.insert(0, (0.0, lerp_source(clip_in, speed_keyframes)))
            # 补全终点
            if ae_kfs[-1][0] < duration_sec - 0.001:
                ae_kfs.append((duration_sec, lerp_source(clip_out, speed_keyframes)))

            if config.get('debug_mode', False):
                print(f"  Speed Ramp: {len(ae_kfs)} AE keyframes (from {len(speed_keyframes)} OTIO)")
                for i, (t, v) in enumerate(ae_kfs):
                    print(f"    KF{i}: time={t:.3f}s  value={v:.4f}s")

            jsx.append(f"layer.startTime = {rel_start_time} - {source_start_sec};")
            jsx.append(f"layer.timeRemapEnabled = true;")
            jsx.append(f"var tr = layer.property('Time Remap');")
            jsx.append(f"var ourTimes = [];")
            for ae_t, src_t in ae_kfs:
                comp_time = rel_start_time + ae_t
                jsx.append(f"tr.setValueAtTime({comp_time}, {src_t});")
                jsx.append(f"ourTimes.push({comp_time});")
            # 反向遍历删除不属于我们的默认关键帧
            jsx.append(f"for (var k = tr.numKeys; k >= 1; k--) {{")
            jsx.append(f"  var kt = tr.keyTime(k); var keep = false;")
            jsx.append(f"  for (var j = 0; j < ourTimes.length; j++) {{ if (Math.abs(kt - ourTimes[j]) < 0.001) {{ keep = true; break; }} }}")
            jsx.append(f"  if (!keep) tr.removeKey(k);")
            jsx.append(f"}}")
        elif abs(time_scalar - 1.0) > 0.001:
            # 恒定变速模式
            stretch_val = (1.0 / time_scalar) * 100.0
            jsx.append(f"layer.stretch = {stretch_val};")
            jsx.append(f"layer.startTime = {rel_start_time} - {source_start_sec / time_scalar};")
        else:
            jsx.append(f"layer.startTime = {rel_start_time} - {source_start_sec};")

        jsx.append(f"layer.inPoint = {rel_start_time};")
        jsx.append(f"layer.outPoint = {rel_start_time + duration_sec};")

        # [V28.1] 只对视频片段应用变换属性
        if clip_track_type == "video":
            # 获取素材分辨率
            clip_w, clip_h = 0, 0
            res_str = mp_item.GetClipProperty("Resolution")
            if res_str:
                clip_w, clip_h = parse_resolution(res_str)

            # [V28.0] Scale full frame with crop 模式: s = max(W/w, H/h)
            base_fit_scale = 1.0
            if clip_w > 0 and clip_h > 0:
                fit_x = tl_width / clip_w
                fit_y = tl_height / clip_h
                base_fit_scale = max(fit_x, fit_y)

            if props:
                if config.get('debug_mode', False): print(f"Clip '{item_name}': {method} | Mode ID: {props['blend_mode']}")

                # 获取对应的 AE 枚举字符串
                b_mode = BLEND_MODE_MAP.get(props['blend_mode'], "BlendingMode.NORMAL")

                # [核心修复] 使用 try-catch 包裹赋值
                # 如果 b_mode (例如 BlendingMode.SILHOUETTE_ALPHA) 在你的 AE 版本中未定义
                # AE 会抛出错误，catch 块会捕获它，保持默认模式，脚本继续运行
                jsx.append(f"try {{ layer.blendingMode = {b_mode}; }} catch(e) {{}}")

                jsx.append(f"layer.opacity.setValue({props['opacity']});")

                # ========== [V28.0] 修正锚点和位置逻辑 ==========
                jsx.append(f"var compW = {tl_width};")
                jsx.append(f"var compH = {tl_height};")
                jsx.append(f"var srcW = layer.width;")
                jsx.append(f"var srcH = layer.height;")
                jsx.append(f"var s = {base_fit_scale};")

                # 1. 提取 Resolve 数据
                jsx.append(f"var r_pan = {props['pan']};")
                jsx.append(f"var r_tilt = {props['tilt']};")
                jsx.append(f"var r_ancX = {props['anchor_x']};")
                jsx.append(f"var r_ancY = {props['anchor_y']};")

                # 2. 归一化检测和转换 (OTIO 归一化基准是时间线尺寸)
                jsx.append(f"var isNormPan = (Math.abs(r_pan) <= 4.0);")
                jsx.append(f"var isNormTilt = (Math.abs(r_tilt) <= 4.0);")
                jsx.append(f"var isNormAncX = (Math.abs(r_ancX) <= 4.0);")
                jsx.append(f"var isNormAncY = (Math.abs(r_ancY) <= 4.0);")

                jsx.append(f"var panPx = isNormPan ? (r_pan * compW) : r_pan;")
                jsx.append(f"var tiltPx = isNormTilt ? (r_tilt * compH) : r_tilt;")
                jsx.append(f"var ancOffsetX = isNormAncX ? (r_ancX * compW) : r_ancX;")
                jsx.append(f"var ancOffsetY = isNormAncY ? (r_ancY * compH) : r_ancY;")

                # 3. 获取翻转状态
                flip_x = props['flip_x']
                flip_y = props['flip_y']
                flip_x_mult = -1 if flip_x else 1
                flip_y_mult = 1 if flip_y else -1

                # 4. AE 锚点 (翻转时偏移取反)
                jsx.append(f"var ae_ancX = (srcW / 2) + ({flip_x_mult}) * (ancOffsetX / s);")
                jsx.append(f"var ae_ancY = (srcH / 2) + ({flip_y_mult}) * (ancOffsetY / s);")
                jsx.append(f"layer.property('Anchor Point').setValue([ae_ancX, ae_ancY]);")

                # 5. AE 位置
                jsx.append(f"var ae_posX = (compW / 2) + panPx + ancOffsetX;")
                jsx.append(f"var ae_posY = (compH / 2) - tiltPx - ancOffsetY;")

                # 7. 缩放
                sx_dir = -1 if flip_x else 1
                sy_dir = -1 if flip_y else 1

                # 检查是否有 Dynamic Zoom 关键帧
                dz_kfs = props.get("dynamic_zoom_keyframes")

                # [FIX] 过滤无效的 Dynamic Zoom：如果所有 scale 值都接近 1.0 且 center 接近 (0,0)，则忽略
                if dz_kfs and dz_kfs.get("scale"):
                    scale_vals = list(dz_kfs["scale"].values())
                    center_vals = list(dz_kfs.get("center", {}).values())
                    all_scale_default = all(abs(v - 1.0) < 0.01 for v in scale_vals)
                    all_center_default = all(abs(c[0]) < 0.01 and abs(c[1]) < 0.01 for c in center_vals) if center_vals else True
                    if all_scale_default and all_center_default:
                        dz_kfs = None  # 忽略默认值的 Dynamic Zoom
                        if config.get('debug_mode', False):
                            print(f"      -> [Info] Dynamic Zoom ignored (default values)")

                if dz_kfs and dz_kfs.get("scale"):
                    # Dynamic Zoom 模式：使用 setValueAtTime
                    jsx.append(f"// Dynamic Zoom Keyframes")
                    jsx.append(f"var baseZoomX = {props['zoom_x']};")
                    jsx.append(f"var baseZoomY = {props['zoom_y']};")
                    jsx.append(f"var sxDir = {sx_dir};")
                    jsx.append(f"var syDir = {sy_dir};")

                    # 获取所有关键帧的帧号并排序
                    scale_frames = sorted(dz_kfs["scale"].keys())
                    center_dict = dz_kfs.get("center", {})

                    # Dynamic Zoom 动画逻辑：无论片段如何裁剪，动画总是从第一个关键帧播放到最后一个
                    # 将关键帧时间范围映射到片段时长
                    min_frame = scale_frames[0]
                    max_frame = scale_frames[-1]
                    frame_range = max_frame - min_frame

                    # 构建 AE 关键帧列表
                    ae_dz_kfs = []
                    for frame in scale_frames:
                        # 将帧号映射到片段时长：第一帧→0，最后帧→duration_sec
                        if frame_range > 0:
                            ae_t = (frame - min_frame) / frame_range * duration_sec
                        else:
                            ae_t = 0.0
                        scale_val = dz_kfs["scale"][frame]
                        center_val = center_dict.get(frame, [0.0, 0.0])
                        ae_dz_kfs.append((ae_t, scale_val, center_val))

                    if config.get('debug_mode', False):
                        print(f"  Dynamic Zoom: {len(ae_dz_kfs)} AE keyframes")
                        for i, (t, sc, ct) in enumerate(ae_dz_kfs):
                            print(f"    KF{i}: time={t:.3f}s  scale={sc:.4f}  center={ct}")

                    # 生成 Scale 关键帧
                    # Dynamic Zoom Scale 是"查看窗口"占源素材的比例，需要取倒数
                    # scale_val=0.5 表示显示50%区域，即放大2倍 → AE Scale = 1/0.5 = 2
                    for ae_t, scale_val, center_val in ae_dz_kfs:
                        comp_time = rel_start_time + ae_t
                        inv_scale = 1.0 / scale_val if scale_val > 0 else 1.0
                        jsx.append(f"layer.property('Scale').setValueAtTime({comp_time}, [baseZoomX * {inv_scale} * s * 100 * sxDir, baseZoomY * {inv_scale} * s * 100 * syDir]);")

                    # 生成 Position 关键帧（center 是归一化偏移，需要加到基础位置上）
                    for ae_t, scale_val, center_val in ae_dz_kfs:
                        comp_time = rel_start_time + ae_t
                        cx, cy = center_val[0], center_val[1]
                        # center 是归一化值，乘以 compW/compH 转为像素
                        jsx.append(f"layer.property('Position').setValueAtTime({comp_time}, [ae_posX + {cx} * compW, ae_posY - {cy} * compH]);")
                else:
                    # 静态模式
                    jsx.append(f"layer.property('Position').setValue([ae_posX, ae_posY]);")
                    final_scale_x_str = f"{props['zoom_x']} * s * 100 * {sx_dir}"
                    final_scale_y_str = f"{props['zoom_y']} * s * 100 * {sy_dir}"
                    jsx.append(f"layer.property('Scale').setValue([{final_scale_x_str}, {final_scale_y_str}]);")

                # 6. 旋转 [FIX] 所有情况都反号（Y轴方向相反）
                ae_rotation = -1 * props['rotation']
                jsx.append(f"layer.property('Rotation').setValue({ae_rotation});")

                # 8. 裁切 Mask（归一化值转源素材像素坐标）
                cl = props.get("crop_left", 0.0)
                cr = props.get("crop_right", 0.0)
                ct = props.get("crop_top", 0.0)
                cb = props.get("crop_bottom", 0.0)
                if cl > 0 or cr > 0 or ct > 0 or cb > 0:
                    jsx.append(f"// Crop Mask")
                    jsx.append(f"var hvw = compW / (2 * s);")
                    jsx.append(f"var hvh = compH / (2 * s);")
                    jsx.append(f"var cx = srcW / 2, cy = srcH / 2;")
                    jsx.append(f"var ml = cx - hvw + {cl} * compW / s;")
                    jsx.append(f"var mr = cx + hvw - {cr} * compW / s;")
                    jsx.append(f"var mt = cy - hvh + {ct} * compH / s;")
                    jsx.append(f"var mb = cy + hvh - {cb} * compH / s;")
                    jsx.append(f"var cropMask = layer.Masks.addProperty('Mask');")
                    jsx.append(f"cropMask.maskMode = MaskMode.ADD;")
                    jsx.append(f"var cropShape = new Shape();")
                    jsx.append(f"cropShape.vertices = [[ml,mt],[mr,mt],[mr,mb],[ml,mb]];")
                    jsx.append(f"cropShape.closed = true;")
                    jsx.append(f"cropMask.property('maskShape').setValue(cropShape);")

                # 9. 镜头矫正 → AE Optics Compensation（近似映射）
                dist = props.get("distortion", 0.0)
                if abs(dist) > 0.001:
                    fov = 83.0 * (1.0 - math.exp(-5.0 * abs(dist)))
                    reverse = "true" if dist > 0 else "false"
                    jsx.append(f"// Lens Correction -> Optics Compensation")
                    jsx.append(f"try {{")
                    jsx.append(f"  var optics = layer.Effects.addProperty('Optics Compensation');")
                    jsx.append(f"  optics(1).setValue({fov});")
                    jsx.append(f"  optics(2).setValue({reverse});")
                    jsx.append(f"}} catch(e) {{}}")

                # [V28.5] 应用 LUT 到 Lumetri Color (通过索引)
                if lut_filename:
                    lut_filename_js = lut_filename.replace("'", "\\'")
                    ae_lut_dir_js = ae_lut_dir.replace("\\", "\\\\")
                    jsx.append(f"// Apply LUT via Lumetri Color")
                    jsx.append(f"try {{")
                    jsx.append(f"  var lumetri = layer.Effects.addProperty('Lumetri Color');")
                    jsx.append(f"  if (lumetri) {{")
                    jsx.append(f"    var inputLUT = lumetri.property('ADBE Lumetri-0005');")
                    jsx.append(f"    var lutDir = new Folder('{ae_lut_dir_js}');")
                    jsx.append(f"    if (lutDir.exists) {{")
                    jsx.append(f"      var files = lutDir.getFiles();")
                    jsx.append(f"      var lutFiles = [];")
                    jsx.append(f"      for (var i = 0; i < files.length; i++) {{")
                    jsx.append(f"        if (files[i] instanceof File) {{")
                    jsx.append(f"          var ext = files[i].name.split('.').pop().toLowerCase();")
                    jsx.append(f"          if (ext == 'cube' || ext == '3dl' || ext == 'look') lutFiles.push(files[i].name);")
                    jsx.append(f"        }}")
                    jsx.append(f"      }}")
                    jsx.append(f"      lutFiles.sort(function(a,b) {{ return a.toLowerCase().localeCompare(b.toLowerCase()); }});")
                    jsx.append(f"      for (var i = 0; i < lutFiles.length; i++) {{")
                    jsx.append(f"        if (lutFiles[i] == '{lut_filename_js}') {{")
                    jsx.append(f"          inputLUT.setValue(i + 5);")
                    jsx.append(f"          break;")
                    jsx.append(f"        }}")
                    jsx.append(f"      }}")
                    jsx.append(f"    }}")
                    jsx.append(f"  }}")
                    jsx.append(f"}} catch(e) {{}}")

    if config.get('create1080pPreviewComp') is True:
        jsx.append("var previewComp = app.project.items.addComp(comp.name + '_Preview_1080p', 1920, 1080, 1, comp.duration, comp.frameRate);")
        jsx.append("var previewLayer = previewComp.layers.add(comp);")
        jsx.append("previewLayer.property('Position').setValue([previewComp.width / 2, previewComp.height / 2]);")
        jsx.append("var previewFitPercent = Math.min(previewComp.width / comp.width, previewComp.height / comp.height) * 100;")
        jsx.append("previewLayer.property('Scale').setValue([previewFitPercent, previewFitPercent]);")

    jsx.append(f"app.endUndoGroup();")
    # Host Electron writes this returned JSX into its desktop temp directory.
    if not config.get('debug_mode', False):
        jsx.append(f"var jsxFile = new File($.fileName);")
        jsx.append(f"if (jsxFile.exists) jsxFile.remove();")

    message = f"Sent {len(target_clips)} Clips"
    result = _terminal_result(
        True, "exported", mode, target_policy, media_policy, len(target_clips), message
    )
    result["__clacklyDesktopLaunch"] = {
        "type": "after-effects-jsx",
        "executable": ae_path,
        "args": ["-r", "$CLACKLY_JSX"],
        "jsx": "\n".join(jsx),
    }
    return result
