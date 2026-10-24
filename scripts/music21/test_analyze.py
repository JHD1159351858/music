"""Real MusicXML/MXL regression tests; run with the isolated music21 Python."""

import base64
import io
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
import zipfile


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).with_name("analyze.py")
EXAMPLE = ROOT / "public/examples/music21-demo.musicxml"


def pitch(step="C", octave="4", duration="1", extra=""):
    return (f"<note>{extra}<pitch><step>{step}</step><octave>{octave}</octave>"
            f"</pitch><duration>{duration}</duration><type>quarter</type></note>")


def score(notes=None, attributes="", second_part=""):
    content = pitch() if notes is None else notes
    return ("<?xml version='1.0' encoding='UTF-8'?>"
            "<score-partwise version='4.0'><part-list>"
            "<score-part id='P1'><part-name>高音</part-name></score-part>"
            + ("<score-part id='P2'><part-name>低音</part-name></score-part>" if second_part else "")
            + "</part-list><part id='P1'><measure number='1'><attributes>"
            "<divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>"
            + attributes + "</attributes>" + content + "</measure></part>"
            + ("<part id='P2'><measure number='1'><attributes><divisions>1</divisions>"
               "<time><beats>4</beats><beat-type>4</beat-type></time></attributes>"
               + second_part + "</measure></part>" if second_part else "")
            + "</score-partwise>").encode()


def mxl(xml, root_name="scores/main.musicxml", extras=None):
    target = io.BytesIO()
    container = ("<?xml version='1.0'?><container version='1.0' "
                 "xmlns='urn:oasis:names:tc:opendocument:xmlns:container'><rootfiles>"
                 f"<rootfile full-path='{root_name}' media-type='application/vnd.recordare.musicxml+xml'/>"
                 "</rootfiles></container>").encode()
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("META-INF/container.xml", container)
        archive.writestr(root_name, xml)
        for name, data in (extras or {}).items():
            archive.writestr(name, data)
    return target.getvalue()


class AnalyzeTests(unittest.TestCase):
    def call(self, data, name="score.musicxml", success=True):
        if not SCRIPT.is_file():
            self.fail("music21 analyzer CLI is not implemented yet")
        payload = {"name": name, "contentBase64": base64.b64encode(data).decode()}
        process = subprocess.run([sys.executable, str(SCRIPT)], input=json.dumps(payload),
                                 text=True, encoding="utf-8", capture_output=True, timeout=35)
        try:
            result = json.loads(process.stdout)
        except json.JSONDecodeError:
            self.fail(f"Expected one JSON response, got {process.stdout!r}, stderr={process.stderr!r}")
        self.assertEqual(process.returncode == 0, success, result)
        if success:
            self.assertNotIn("error", result)
            self.assertEqual(result["provenance"], "musicxml")
        else:
            self.assertIn(result["code"], ["invalid", "too-large", "unavailable"])
            self.assertIsInstance(result["error"], str)
        return result

    def test_cli_reads_real_musicxml_and_counts_chord_members(self):
        xml = score(pitch() + pitch("E", extra="<chord/>") + pitch("G", extra="<chord/>")
                    + "<note><rest/><duration>3</duration><type>half</type><dot/></note>",
                    "<key><fifths>0</fifths><mode>major</mode></key>")
        result = self.call(xml)
        self.assertEqual(result["noteCount"], 3)
        self.assertEqual(result["pitchHistogram"], {"C": 1, "D": 0, "E": 1, "F": 0, "G": 1, "A": 0, "B": 0})
        self.assertEqual([item["midi"] for item in result["pitchSequence"]], [60, 64, 67])
        self.assertEqual(result["range"], "C4 — G4（7半音）")
        self.assertEqual(result["key"], "C大调")
        details = result["music21"]
        self.assertEqual(details["version"], "10.5.1")
        self.assertEqual(details["partCount"], 1)
        self.assertEqual(details["measureCount"], 1)
        self.assertEqual(details["restCount"], 1)
        self.assertEqual(details["timeSignatures"], ["4/4"])
        self.assertEqual(details["declaredKeys"], ["C大调"])
        self.assertEqual(details["chords"][0]["notes"], ["C4", "E4", "G4"])
        self.assertIn("major", details["chords"][0]["name"])
        self.assertEqual(details["chords"][0]["romanNumeral"], "I")
        self.assertEqual(set(details), {"version", "partCount", "measureCount", "restCount", "timeSignatures", "tempos", "declaredKeys", "estimatedKey", "notes", "chords"})

    def test_polyphony_orders_notes_by_offset_then_part(self):
        result = self.call(score(pitch("C", duration="2") + pitch("D", duration="2"),
                                 second_part=pitch("G", "2", "4")))
        notes = result["music21"]["notes"]
        self.assertEqual([item["note"] for item in notes], ["C4", "G2", "D4"])
        self.assertEqual([item["offset"] for item in notes], [0, 0, 2])
        self.assertEqual([item["part"] for item in notes], ["高音", "低音", "高音"])
        self.assertEqual([item["beat"] for item in notes], [1, 1, 3])
        self.assertEqual([item["duration"] for item in notes], [2, 4, 2])
        self.assertEqual(result["music21"]["measureCount"], 1)

    def test_unpitched_percussion_does_not_block_pitched_analysis(self):
        drum = "<note><unpitched><display-step>E</display-step><display-octave>5</display-octave></unpitched><duration>1</duration><type>quarter</type></note>"
        result = self.call(score(pitch("C") + pitch("E"), second_part=drum))
        self.assertEqual(result["noteCount"], 2)
        self.assertEqual([item["midi"] for item in result["pitchSequence"]], [60, 64])
        self.assertEqual(result["music21"]["partCount"], 2)
        self.assertTrue(any("1" in warning and "无固定音高" in warning for warning in result["warnings"]))

    def test_music21_readable_defaults_are_not_rejected_by_preflight(self):
        result = self.call(score().replace(b"<divisions>1</divisions>", b""))
        self.assertEqual(result["noteCount"], 1)

    def test_music21_supported_accidentals_are_not_restricted_to_two_semitones(self):
        result = self.call(score(pitch().replace("</octave>", "</octave><alter>3</alter>")))
        self.assertEqual(result["pitchSequence"][0]["midi"], 63)

    def test_voice_backup_and_grace_notes_keep_actual_timing(self):
        notes = (pitch("C", extra="<voice>1</voice>")
                 + "<backup><duration>1</duration></backup>"
                 + pitch("E", extra="<voice>2</voice>")
                 + "<note><grace/><pitch><step>D</step><octave>4</octave></pitch><voice>2</voice><type>eighth</type></note>"
                 + pitch("F", extra="<voice>2</voice>"))
        result = self.call(score(notes))
        events = result["music21"]["notes"]
        self.assertEqual([item["offset"] for item in events], [0, 0, 1, 1])
        self.assertEqual([item["voice"] for item in events], ["1", "2", "2", "2"])
        self.assertEqual(events[2]["duration"], 0)
        self.assertTrue(all(item["duration"] >= 0 for item in events))

    def test_explicit_key_requires_mode_and_estimation_is_separate(self):
        result = self.call(score(pitch() + pitch("E") + pitch("G"), "<key><fifths>0</fifths></key>"))
        self.assertIsNone(result["key"])
        self.assertEqual(result["music21"]["declaredKeys"], [])
        self.assertIsNotNone(result["music21"]["estimatedKey"])
        for name in ["background", "workBackground", "composerBackground", "creationYear", "period", "melody"]:
            self.assertIsNone(result[name])
        self.assertTrue(any("推断" in warning for warning in result["warnings"]))

    def test_declared_changes_are_preserved(self):
        xml = score(pitch(), "<key><fifths>0</fifths><mode>major</mode></key>")
        xml = xml.replace(b"</measure></part>", b"</measure><measure number='2'><attributes><key><fifths>1</fifths><mode>major</mode></key><time><beats>3</beats><beat-type>4</beat-type></time></attributes>" + pitch("G", duration="3").encode() + b"</measure></part>")
        result = self.call(xml)
        self.assertEqual(result["music21"]["declaredKeys"], ["C大调", "G大调"])
        self.assertEqual(result["music21"]["timeSignatures"], ["4/4", "3/4"])
        self.assertEqual(result["key"], "C大调 → G大调")

    def test_rests_only_are_zero_notes_and_no_invented_key(self):
        result = self.call(score("<note><rest/><duration>4</duration><type>whole</type></note>"))
        self.assertEqual(result["noteCount"], 0)
        self.assertEqual(result["pitchSequence"], [])
        self.assertIsNone(result["range"])
        self.assertIsNone(result["music21"]["estimatedKey"])
        self.assertEqual(result["music21"]["chords"], [])

    def test_single_notes_and_incomplete_harmonies_have_no_roman_numeral(self):
        for notes in [pitch(), pitch("C", "3") + pitch(extra="<chord/>") + pitch("G", extra="<chord/>")]:
            with self.subTest(notes=notes):
                result = self.call(score(notes, "<key><fifths>0</fifths><mode>major</mode></key>"))
                self.assertIsNone(result["music21"]["chords"][0]["romanNumeral"])
                self.assertIsNone(result["chordColor"])

    def test_example_has_four_measures_and_twenty_written_pitches(self):
        self.assertTrue(EXAMPLE.is_file(), "Authored example has not been added")
        result = self.call(EXAMPLE.read_bytes())
        self.assertEqual(result["noteCount"], 20)
        self.assertEqual(result["music21"]["measureCount"], 4)
        self.assertEqual(result["music21"]["partCount"], 2)
        self.assertEqual(result["music21"]["restCount"], 3)
        self.assertEqual(result["music21"]["tempos"], [96])
        self.assertEqual(result["range"], "G2 — G5（36半音）")
        self.assertTrue(result["title"])
        self.assertTrue(result["composer"])
        self.assertTrue(any("延音" in warning for warning in result["warnings"]))

    def test_mxl_reads_declared_root_only(self):
        result = self.call(mxl(score(), extras={"unrelated.xml": b"not MusicXML"}), "score.mxl")
        self.assertEqual(result["noteCount"], 1)

    def test_standard_public_doctype_is_accepted_without_fetching(self):
        xml = score().replace(b"<score-partwise", b'<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise', 1)
        self.assertEqual(self.call(xml)["noteCount"], 1)

    def test_malformed_and_unsupported_xml_are_rejected(self):
        for content in [b"<score-partwise>", b"<score-timewise/>", b"<html/>"]:
            with self.subTest(content=content):
                self.assertEqual(self.call(content, success=False)["code"], "invalid")

    def test_empty_but_readable_musicxml_returns_empty_analysis(self):
        result = self.call(b"<score-partwise/>")
        self.assertEqual(result["noteCount"], 0)
        self.assertIsNone(result["range"])

    def test_custom_dtd_entities_are_rejected(self):
        xml = score().replace(b"<score-partwise", b'<!DOCTYPE score-partwise [<!ENTITY dangerous SYSTEM "file:///etc/passwd">]><score-partwise', 1)
        self.assertEqual(self.call(xml, success=False)["code"], "invalid")

    def test_zip_traversal_and_undeclared_roots_are_rejected(self):
        for content in [mxl(score(), "../score.xml"), mxl(score(), "/score.xml"),
                        mxl(score(), extras={"../outside.txt": b"bad"})]:
            with self.subTest(size=len(content)):
                self.assertEqual(self.call(content, "score.mxl", success=False)["code"], "invalid")
        missing = io.BytesIO()
        with zipfile.ZipFile(missing, "w") as archive:
            archive.writestr("score.xml", score())
        self.assertEqual(self.call(missing.getvalue(), "score.mxl", success=False)["code"], "invalid")

    def test_compression_expansion_is_rejected(self):
        result = self.call(mxl(score(), extras={"inflated.txt": b" " * (8 * 1024 * 1024 + 1)}), "score.mxl", success=False)
        self.assertEqual(result["code"], "too-large")

    def test_excessive_zip_entries_are_rejected(self):
        content = mxl(score(), extras={f"entry-{index}.txt": b"x" for index in range(128)})
        self.assertEqual(self.call(content, "score.mxl", success=False)["code"], "too-large")

    def test_unsupported_extensions_are_rejected(self):
        self.assertEqual(self.call(score(), "score.abc", success=False)["code"], "invalid")

    def test_pitch_limit_is_checked_before_analysis(self):
        self.assertEqual(self.call(score(pitch() * 10001), success=False)["code"], "too-large")

    def test_chord_event_limit_is_checked_before_chordify(self):
        self.assertEqual(self.call(score(pitch() * 5001), success=False)["code"], "too-large")

    def test_input_size_is_bounded(self):
        self.assertEqual(self.call(b" " * (8 * 1024 * 1024 + 1), success=False)["code"], "too-large")

    def test_repeated_part_and_voice_labels_are_bounded_with_one_warning(self):
        voice = "长声部编号" * 30
        notes = (pitch(extra=f"<voice>{voice}</voice>")
                 + "<backup><duration>1</duration></backup>"
                 + pitch("E", extra=f"<voice>{voice}另一个</voice>"))
        xml = score(notes).replace("高音".encode(), ("长声部名称" * 320).encode())
        result = self.call(xml)
        self.assertTrue(all(len(note["part"]) <= 80 for note in result["music21"]["notes"]))
        self.assertTrue(all(note["voice"] is not None and len(note["voice"]) <= 40
                            for note in result["music21"]["notes"]))
        self.assertEqual(sum("截断" in warning for warning in result["warnings"]), 1)

    def test_written_chords_over_128_pitches_are_rejected(self):
        notes = pitch() + pitch(extra="<chord/>") * 139
        self.assertEqual(self.call(score(notes), success=False)["code"], "too-large")

    def test_polyphonic_slices_over_128_pitches_are_rejected(self):
        upper = pitch() + pitch(extra="<chord/>") * 64
        lower = pitch("C", "3") + pitch("C", "3", extra="<chord/>") * 63
        self.assertEqual(self.call(score(upper, second_part=lower), success=False)["code"], "too-large")

    def test_serialized_output_is_utf8_and_bounded_before_writing(self):
        specification = importlib.util.spec_from_file_location("music21_analyzer", SCRIPT)
        module = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(module)
        self.assertTrue(hasattr(module, "serialize_result"), "Bounded result serialization is not implemented")
        self.assertIn("中文", module.serialize_result({"text": "中文"}))
        with self.assertRaises(module.AnalysisError) as caught:
            module.serialize_result({"text": "中" * (8 * 1024 * 1024 // 3 + 1)})
        self.assertEqual(caught.exception.code, "too-large")


if __name__ == "__main__":
    unittest.main()
