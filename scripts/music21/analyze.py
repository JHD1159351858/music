"""Bounded, in-memory MusicXML analysis. JSON enters stdin and leaves stdout."""

import base64
import binascii
from collections import Counter, defaultdict
from contextlib import redirect_stdout
import io
import json
import math
from pathlib import PurePosixPath
import stat
import sys
import warnings
import xml.etree.ElementTree as ElementTree
import zipfile


MAX_BYTES = 8 * 1024 * 1024
MAX_BASE64 = ((MAX_BYTES + 2) // 3) * 4
MAX_PITCHES = 10000
MAX_CHORDS = 5000
MAX_SIMULTANEOUS_PITCHES = 128
MAX_ZIP_ENTRIES = 128


class AnalysisError(Exception):
    def __init__(self, message, code="invalid"):
        super().__init__(message)
        self.code = code


def reject(message, code="invalid"):
    raise AnalysisError(message, code)


def xml_tree(data):
    try:
        from defusedxml.ElementTree import fromstring
        from defusedxml.common import DefusedXmlException
    except ImportError:
        reject("music21 解析环境未安装完整，请安装独立 Python 依赖。", "unavailable")
    try:
        # Public MusicXML DOCTYPEs are permitted; entities and external references
        # are forbidden. Serializing this tree removes the DTD before music21.
        root = fromstring(data, forbid_dtd=False, forbid_entities=True, forbid_external=True)
    except (ElementTree.ParseError, DefusedXmlException, ValueError):
        reject("XML 无效，或包含不允许的自定义实体／外部实体。")
    for element in root.iter():
        if isinstance(element.tag, str):
            element.tag = element.tag.rsplit("}", 1)[-1]
    return root


def safe_zip_name(name):
    path = PurePosixPath(name)
    return (bool(name) and not path.is_absolute() and "\\" not in name
            and ":" not in name and "\x00" not in name and ".." not in path.parts
            and not any(part == "" for part in name.rstrip("/").split("/")))


def musicxml_bytes(data, extension):
    if extension != "mxl":
        return data
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ZIP_ENTRIES:
                reject("MXL 包含过多文件。", "too-large")
            names = set()
            total = 0
            for entry in entries:
                if (not safe_zip_name(entry.filename) or entry.flag_bits & 1
                        or stat.S_ISLNK(entry.external_attr >> 16)):
                    reject("MXL 不允许加密文件、符号链接或不安全的文件路径。")
                if entry.filename in names:
                    reject("MXL 包含重复文件路径。")
                names.add(entry.filename)
                total += entry.file_size
                if (total > MAX_BYTES or entry.file_size > MAX_BYTES
                        or (entry.file_size > 65536
                            and entry.file_size > max(entry.compress_size, 1) * 200)):
                    reject("MXL 解压大小或压缩展开比例超过限制。", "too-large")
                if entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                    reject("MXL 仅支持 ZIP 的普通存储或 Deflate 压缩。")
            if "META-INF/container.xml" not in names:
                reject("MXL 缺少 META-INF/container.xml，无法确定谱面文件。")
            if archive.getinfo("META-INF/container.xml").file_size > 65536:
                reject("MXL 容器描述文件过大。", "too-large")
            container = xml_tree(archive.read("META-INF/container.xml"))
            if container.tag != "container":
                reject("MXL 容器描述格式无效。")
            roots = [element for element in container.findall("./rootfiles/rootfile")
                     if element.get("media-type") in (None, "application/vnd.recordare.musicxml+xml")]
            if len(roots) != 1:
                reject("MXL 必须明确声明一个 MusicXML 主谱面。")
            name = roots[0].get("full-path", "")
            if (not safe_zip_name(name) or name not in names
                    or PurePosixPath(name).suffix.lower() not in (".xml", ".musicxml")):
                reject("MXL 声明的 MusicXML 主谱面不存在或路径无效。")
            with archive.open(name) as source:
                content = source.read(MAX_BYTES + 1)
            if len(content) > MAX_BYTES:
                reject("解压后的 MusicXML 超过 8 MiB。", "too-large")
            return content
    except (zipfile.BadZipFile, OSError, RuntimeError, KeyError, NotImplementedError):
        reject("MXL 压缩包无效或无法安全读取。")


def number(value):
    result = float(value)
    if not math.isfinite(result):
        return None
    return int(result) if result.is_integer() else round(result, 8)


def beat_of(element):
    try:
        return number(element.beat)
    except Exception:
        return None


def measure_of(element, stream):
    measure = element.getContextByClass(stream.Measure)
    return measure.number if measure is not None and isinstance(measure.number, int) else None


def key_label(value):
    tonic = value.tonic.unicodeName
    if value.mode == "major":
        return f"{tonic}大调"
    if value.mode == "minor":
        return f"{tonic.lower()}小调"
    return f"{tonic} {value.mode}"


def metadata_text(root, path):
    value = root.findtext(path)
    return value.strip()[:1600] if value and value.strip() else None


def analyze(name, content):
    extension = name.rsplit(".", 1)[-1].lower()
    xml = musicxml_bytes(content, extension)
    if len(xml) > MAX_BYTES:
        reject("MusicXML 超过 8 MiB。", "too-large")
    root = xml_tree(xml)
    if root.tag not in ("score-partwise", "score-timewise"):
        reject("请上传 MusicXML 乐谱文件。")
    try:
        import music21
        from music21 import chord, converter, key, meter, note, roman, stream, tempo
    except ImportError:
        reject("music21 解析环境不可用，请安装独立 Python 依赖。", "unavailable")
    # parseData consumes a verified XML string; no path, URL, corpus or pickle API.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        score = converter.parseData(ElementTree.tostring(root, encoding="unicode"), format="musicxml")
    result_warnings = ["按谱面实际音符统计，和弦各音分别计数，休止符不计入；反复段落不展开。",
                       "音高走向按实际起始时间、声部顺序排列，多声部不代表单一旋律。"]
    rest_count = len(list(score.recurse().getElementsByClass(note.Rest)))
    unpitched_count = len(root.findall(".//note/unpitched"))
    if unpitched_count:
        result_warnings.append(f"另读取到 {unpitched_count} 个无固定音高的打击乐音符，不参与音高、音域和和声统计。")
    if root.find(".//tie") is not None or root.find(".//notations/tied") is not None:
        result_warnings.append("延音线连接的音符保留谱面各片段，分别计数，不合并为一个音符。")
    declared_objects = []
    declared_labels = []
    for value in score.recurse().getElementsByClass(key.Key):
        label = key_label(value)
        if label not in declared_labels:
            declared_objects.append(value)
            declared_labels.append(label)
    parts = list(score.parts)
    events = []
    intervals = defaultdict(int)
    grace_pitches = defaultdict(int)
    measure_starts = []
    truncated_labels = False
    for part_index, part in enumerate(parts):
        part_name = (part.partName or "").strip() or f"声部{part_index + 1}"
        truncated_labels = truncated_labels or len(part_name) > 80
        part_name = part_name[:80]
        measure_starts.append({measure.getOffsetInHierarchy(score)
                               for measure in part.getElementsByClass(stream.Measure)})
        for order, element in enumerate(part.recurse().notes):
            offset = element.getOffsetInHierarchy(score)
            duration = element.duration.quarterLength
            pitches = element.pitches
            if duration > 0:
                intervals[offset] += len(pitches)
                intervals[offset + duration] -= len(pitches)
            else:
                grace_pitches[offset] += len(pitches)
            voice = element.getContextByClass(stream.Voice)
            voice_name = str(voice.id) if voice is not None else None
            if voice_name is not None:
                truncated_labels = truncated_labels or len(voice_name) > 40
                voice_name = voice_name[:40]
            for pitch_order, pitch in enumerate(pitches):
                if len(events) >= MAX_PITCHES:
                    reject("谱面超过 10000 个有音高音符的分析上限。", "too-large")
                events.append({"index": 0, "midi": number(pitch.ps), "note": pitch.unicodeNameWithOctave,
                               "part": part_name, "measure": measure_of(element, stream),
                               "beat": beat_of(element), "offset": number(offset), "duration": number(duration),
                               "voice": voice_name, "_sort": (offset, part_index, order, pitch_order), "_step": pitch.step})
    if truncated_labels:
        result_warnings.append("声部名称或声部编号过长，已截断显示（名称最多80字符，声部编号最多40字符）。")
    # Count nonempty temporal slices before chordify / harmonic analysis.
    active = 0
    chord_event_count = 0
    boundaries = sorted(set(intervals) | set(grace_pitches))
    for index, offset in enumerate(boundaries):
        active += intervals[offset]
        if active + grace_pitches[offset] > MAX_SIMULTANEOUS_PITCHES:
            reject("谱面同时发声音高超过 128 个的分析上限。", "too-large")
        if active and index + 1 < len(boundaries) and boundaries[index + 1] > offset:
            chord_event_count += 1
            if chord_event_count > MAX_CHORDS:
                reject("谱面超过 5000 个和弦时间切片的分析上限。", "too-large")
    events.sort(key=lambda item: item["_sort"])
    histogram = dict.fromkeys("CDEFGAB", 0)
    for index, event in enumerate(events, 1):
        event["index"] = index
        histogram[event.pop("_step")] += 1
        event.pop("_sort")
    if measure_starts and all(starts == measure_starts[0] for starts in measure_starts):
        measure_count = len(measure_starts[0])
    else:
        measure_count = max((len(starts) for starts in measure_starts), default=0)
        result_warnings.append("各声部小节时间起点不一致，小节数按声部最大小节数近似统计。")
    estimated = None
    estimated_object = None
    if events:
        try:
            estimated_object = score.analyze("key")
            estimated = {"name": estimated_object.name,
                         "correlation": number(estimated_object.correlationCoefficient)
                         if estimated_object.correlationCoefficient is not None else None}
        except Exception:
            result_warnings.append("谱面不足以可靠推断整体调性，推断调性留空。")
    if estimated is not None:
        result_warnings.append("推断调性来自 music21 音高与时值分析，与谱面明确标注的调号分开展示。")
    derived_chords = []
    chord_types = Counter()
    if events:
        try:
            harmonies = score.chordify()
        except Exception:
            harmonies = None
            result_warnings.append("当前谱面无法生成和声分析，已保留其他解析结果。")
        for harmony in harmonies.recurse().getElementsByClass(chord.Chord) if harmonies is not None else []:
            if not harmony.pitches:
                continue
            if len(harmony.pitches) > MAX_SIMULTANEOUS_PITCHES:
                reject("和弦时间切片超过 128 个音高的分析上限。", "too-large")
            if len(derived_chords) >= MAX_CHORDS:
                reject("谱面超过 5000 个和弦时间切片的分析上限。", "too-large")
            local_key = harmony.getContextByClass(key.Key)
            if local_key is None or local_key.name not in {item.name for item in declared_objects}:
                local_key = declared_objects[0] if len(declared_objects) == 1 else estimated_object
            numeral = None
            if local_key is not None and len(set(harmony.pitchClasses)) >= 3:
                try:
                    numeral = roman.romanNumeralFromChord(harmony, local_key).figure
                except Exception:
                    pass
            derived_chords.append({"measure": measure_of(harmony, stream), "beat": beat_of(harmony),
                                   "offset": number(harmony.getOffsetInHierarchy(harmonies)),
                                   "notes": [pitch.unicodeNameWithOctave for pitch in harmony.pitches],
                                   "name": harmony.pitchedCommonName, "romanNumeral": numeral})
            if len(set(harmony.pitchClasses)) >= 3:
                chord_types[harmony.commonName] += 1
    if derived_chords:
        result_warnings.append("和弦由同时发声音高的时间切片生成；和弦名称与罗马数字为 music21 推断，并非原谱标注。")
    range_text = None
    if events:
        low = min(events, key=lambda item: item["midi"])
        high = max(events, key=lambda item: item["midi"])
        span = number(high["midi"] - low["midi"])
        range_text = f'{low["note"]} — {high["note"]}（{span}半音）'
    creators = [element.text.strip()[:1600] for element in root.findall("./identification/creator")
                if element.get("type") == "composer" and element.text and element.text.strip()]
    tempos = []
    for mark in score.recurse().getElementsByClass(tempo.MetronomeMark):
        bpm = mark.getQuarterBPM()
        if bpm is not None and math.isfinite(float(bpm)) and bpm > 0:
            value = number(bpm)
            if value not in tempos:
                tempos.append(value)
    signatures = list(dict.fromkeys(item.ratioString for item in score.recurse().getElementsByClass(meter.TimeSignature)))
    return {"title": metadata_text(root, "./work/work-title") or metadata_text(root, "movement-title"),
            "composer": "、".join(dict.fromkeys(creators))[:1600] if creators else None,
            "key": " → ".join(declared_labels) or None, "range": range_text, "noteCount": len(events),
            "chordColor": "同时发声音高切片中：" + "；".join(f"{name} {count}次" for name, count in chord_types.most_common(4)) if chord_types else None,
            "pitchHistogram": histogram,
            "pitchSequence": [{field: event[field] for field in ("index", "midi", "note")} for event in events],
            "summary": f"从 MusicXML 实际读取 {len(events)} 个有音高的谱面音符，{len(parts)} 个声部，{measure_count} 个小节；休止符不计入音符总数，反复不展开。",
            "background": None, "workBackground": None, "composerBackground": None,
            "creationYear": None, "period": None, "melody": None,
            "provenance": "musicxml", "warnings": result_warnings,
            "music21": {"version": music21.__version__, "partCount": len(parts), "measureCount": measure_count,
                        "restCount": rest_count, "timeSignatures": signatures, "tempos": tempos,
                        "declaredKeys": declared_labels, "estimatedKey": estimated, "notes": events, "chords": derived_chords}}


def serialize_result(result):
    output = json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    if len(output.encode("utf-8")) > MAX_BYTES:
        reject("分析结果超过 8 MiB 输出上限，请缩小谱面后重试。", "too-large")
    return output


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        raw = sys.stdin.buffer.read(MAX_BASE64 + 65537)
        if len(raw) > MAX_BASE64 + 65536:
            reject("输入超过 8 MiB 文件的请求大小上限。", "too-large")
        try:
            payload = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            reject("请求必须是有效 JSON。")
        if not isinstance(payload, dict):
            reject("请求必须包含文件名和 Base64 文件内容。")
        name = payload.get("name")
        encoded = payload.get("contentBase64")
        if (not isinstance(name, str) or not name or len(name) > 512 or any(mark in name for mark in ("/", "\\", "\x00"))
                or "." not in name or name.rsplit(".", 1)[-1].lower() not in {"xml", "musicxml", "mxl"}):
            reject("只接受 .xml、.musicxml 或 .mxl 谱面文件名。")
        if not isinstance(encoded, str) or not encoded:
            reject("缺少 Base64 文件内容。")
        if len(encoded) > MAX_BASE64:
            reject("文件超过 8 MiB。", "too-large")
        try:
            content = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError):
            reject("文件内容不是有效 Base64。")
        if len(content) > MAX_BYTES:
            reject("文件超过 8 MiB。", "too-large")
        with redirect_stdout(io.StringIO()):
            result = analyze(name, content)
        print(serialize_result(result))
        return 0
    except AnalysisError as error:
        print(json.dumps({"error": str(error), "code": error.code}, ensure_ascii=False))
        return 1
    except Exception:
        print(json.dumps({"error": "MusicXML 无法完整解析，请检查谱面音符、节奏与声部结构。", "code": "invalid"}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
