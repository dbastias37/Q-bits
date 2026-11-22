#!/usr/bin/env python3
"""Create the two-page Q-bits CPU balance after the final validation/merge.

This reads archived measurements; it never runs the game or a benchmark.
JSON and JSON.gz are supported. All chart values come from the three matched
cumulative cases, not from adding the percentages of individual PRs.

Example (replace the three release arguments with verified values):
  python docs/tools/render-cpu-balance.py --pr-number NUMBER \
      --merge-sha FULL_MERGE_SHA --tests PASSED_TESTS --output balance.pdf

ReportLab and fonts are loaded only when rendering. The caller must inspect
both pages after rendering, for example with pdftoppm -png -r 150.
"""

import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
import subprocess
from xml.sax.saxutils import escape


REPOSITORY = "https://github.com/dbastias37/Q-bits"
SERIES_BASE = "1a0425a250b7911a8c230eb5d8534c54e3a03953"
STARTUP_BASE = "4fc563cc8d27e653129fc11a14524a7cfc626a5e"
EVIDENCE = Path("docs/mediciones/presion-20261122")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_evidence(root, stem):
    """Return the decoded object and its actual repository-relative filename."""
    candidates = [root / (str(stem) + suffix) for suffix in (".json", ".json.gz")]
    existing = [path for path in candidates if path.is_file()]
    require(existing, f"Falta la evidencia: {stem}.json[.gz]")
    decoded = []
    for path in existing:
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rt", encoding="utf-8") as stream:
            decoded.append(json.load(stream))
    require(all(item == decoded[0] for item in decoded),
            f"Las versiones JSON y gzip discrepan: {stem}")
    return decoded[0], existing[0].relative_to(root).as_posix()


def finite_positive(value):
    return isinstance(value, (float, int)) and math.isfinite(value) and value > 0


def checked_case(report, configuration):
    pieces, hz = report["pieces"], report["hz"]
    label = f"{pieces} piezas / {hz} Hz"
    require(report["scenario"] == "independent" and report["phase"] == "settled",
            f"El caso no corresponde a piezas independientes en reposo: {label}")
    require(report.get("identicalFinalState") is True,
            f"No hay conservación exacta del estado: {label}")
    hashes = report.get("stateSha256", [])
    require(len(hashes) == 3 and len(set(hashes)) == 1,
            f"Estados finales incompletos o distintos entre repeticiones: {label}")
    runs = report["runs"]
    require(all(len(runs[arm]) == 3 for arm in ("baseline", "optimized")),
            f"Se requieren tres parejas completas: {label}")
    means = {"baseline": [], "optimized": []}
    samples = configuration["samples"]
    for index, (before, after) in enumerate(zip(runs["baseline"], runs["optimized"]), 1):
        require(before["repetition"] == after["repetition"] == index,
                f"Orden de repeticiones incorrecto: {label}")
        for key in ("clockBefore", "clockAfter", "clockDelta", "firstFrameInventory", "final"):
            require(before[key] == after[key], f"Diferencia en {key}: {label}, repetición {index}")
        for arm, run in (("baseline", before), ("optimized", after)):
            clock, inventory = run["clockDelta"], run["firstFrameInventory"]
            require(clock["physics"] == samples * hz / 60
                    and math.isclose(clock["simulatedSeconds"], samples / 60, abs_tol=1e-8)
                    and clock["droppedSeconds"] == 0,
                    f"Pasos, duración o tiempo descartado incorrectos: {label}")
            require(inventory["pieces"] == pieces and inventory["awakeBodies"] == 0
                    and inventory["contacts"] == 0 and inventory["activeMotors"] == 0,
                    f"La ventana no empieza en reposo: {label}")
            require(run["final"]["awakeBodies"] == 0 and run["final"]["contacts"] == 0,
                    f"La ventana no termina en reposo: {label}")
            summary, raw = run["processCpuMsPerSimulatedFrame"], run["cpuSamples"]
            require(summary["count"] == len(raw) == samples and all(finite_positive(x) for x in raw),
                    f"Muestras CPU incompletas: {label}, {arm}")
            require(finite_positive(summary["mean"])
                    and math.isclose(summary["mean"], statistics.mean(raw), rel_tol=1e-10, abs_tol=1e-9),
                    f"La media CPU no corresponde a las muestras: {label}, {arm}")
            means[arm].append(summary["mean"])
    baseline = statistics.median(means["baseline"])
    optimized = statistics.median(means["optimized"])
    return {"pieces": pieces, "hz": hz, "means": means,
            "baseline": baseline, "optimized": optimized,
            "saving": 100 * (baseline - optimized) / baseline}


def load_inputs(root, merge_sha, tests):
    datasets = []
    cases = []
    filenames = []
    for name, expected, hz in (("cumulative-500-1000-120", [500, 1000], 120),
                               ("cumulative-2000-60", [2000], 60)):
        data, filename = read_evidence(root, EVIDENCE / name)
        configuration = data["configuration"]
        require(data["referenceCommit"] == SERIES_BASE
                and data["sources"]["baseline"]["headCommit"] == SERIES_BASE,
                f"Referencia acumulada inesperada: {filename}")
        require(configuration["repetitions"] == 3 and configuration["samples"] == 30
                and configuration["warmup"] == 60 and configuration["phase"] == "settled"
                and configuration["instrumentation"] == "none"
                and configuration["order"].replace(" ", "") == "AB/BA/AB"
                and configuration["hz"] == hz,
                f"Configuración acumulada inesperada: {filename}")
        require([item["pieces"] for item in data["reports"]] == expected
                and all(item["hz"] == hz for item in data["reports"]),
                f"Escalas incompletas o no previstas: {filename}")
        cases.extend(checked_case(item, configuration) for item in data["reports"])
        datasets.append(data)
        filenames.append(filename)
    for field in ("gameSha256", "workshopSha256", "harnessSha256"):
        for arm in ("baseline", "optimized"):
            require(datasets[0]["sources"][arm][field] == datasets[1]["sources"][arm][field],
                    f"Los dos acumulados usaron fuentes diferentes: {arm}/{field}")
    require(datasets[0]["runtime"] == datasets[1]["runtime"], "Entornos de ejecución diferentes")

    # The published merge may have extra documentation, but the measured code
    # must be byte-identical. Inspect the object, not the working tree or HEAD.
    for filename, field in (("assets/js/game.js", "gameSha256"),
                            ("assets/js/workshop.js", "workshopSha256")):
        result = subprocess.run(["git", "show", f"{merge_sha}:{filename}"], cwd=root,
                                check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        digest = hashlib.sha256(result.stdout).hexdigest()
        require(digest == datasets[0]["sources"]["optimized"][field],
                f"{filename} en --merge-sha no coincide con la fuente medida")

    startup, startup_filename = read_evidence(root, Path("docs/mediciones/startup-20261122/cold-120"))
    require(startup["referenceCommit"] == STARTUP_BASE and startup.get("complete") is True,
            "La comparación histórica del PR #32 no tiene la referencia/completitud esperadas")
    config = startup["configuration"]
    require(config["frames"] == 4 and config["repetitions"] == 3 and config["warmup"] == 0
            and config["freshProcessPerArm"] is True and config["hz"] == 120,
            "Configuración fría del PR #32 inesperada")
    candidates = [item for item in startup["reports"]
                  if item["pieces"] == 2000 and item["hz"] == 120 and item["scenario"] == "independent"]
    require(len(candidates) == 1, "Falta el caso histórico de 2.000 piezas / 120 Hz")
    cold = candidates[0]
    require(cold.get("complete") is True and len(cold["comparisons"]) == 3
            and all(item["identicalFinalState"] and item["identicalFrameClocksAndInventories"]
                    for item in cold["comparisons"]), "PR #32: comparación incompleta o no equivalente")
    peaks = {}
    for arm in ("baseline", "optimized"):
        runs = cold["runs"][arm]
        require(len(runs) == 3 and all(run["complete"] and run["coldProcess"] and run["noWarmup"]
                                     for run in runs), "PR #32: faltan repeticiones frías completas")
        values = [run["statistics"]["wallMs"]["max"] for run in runs]
        require(all(finite_positive(value) for value in values), "PR #32: máximos no válidos")
        peaks[arm] = statistics.median(values) / 1000

    # --tests is intentionally mandatory: never infer a passing suite from
    # the number of test definitions. If the final manifest exists, verify it.
    validation_stem = EVIDENCE / "validation-summary"
    if any((root / (str(validation_stem) + suffix)).exists() for suffix in (".json", ".json.gz")):
        validation, _ = read_evidence(root, validation_stem)
        final = validation["tests"]["final"]
        require(final["tests"] == final["pass"] == tests
                and all(final.get(key, 0) == 0 for key in ("fail", "cancelled", "skipped", "todo")),
                "--tests no coincide con la validación final completa")
        if "optimizedGameSha256" in validation:
            require(validation["optimizedGameSha256"] == datasets[0]["sources"]["optimized"]["gameSha256"],
                    "La suite final y los acumulados corresponden a fuentes distintas")
    return {"cases": cases, "datasets": datasets, "files": filenames,
            "peaks": peaks, "startup_file": startup_filename}


def spanish(value, decimals=3):
    return f"{value:,.{decimals}f}".replace(",", "_").replace(".", ",").replace("_", ".")


def render_pdf(output, data, pr_number, merge_sha, tests):
    # No plotting engine is needed: ReportLab draws exact linear bars from
    # the decoded means. Fonts and PDF machinery are loaded only here.
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen.canvas import Canvas
    from reportlab.platypus import Paragraph

    font_pairs = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    ]
    pair = next((pair for pair in font_pairs if all(Path(item).is_file() for item in pair)), None)
    require(pair is not None, "Instala DejaVu Sans o Liberation Sans para incrustar una fuente legible")
    pdfmetrics.registerFont(TTFont("QBits", pair[0]))
    pdfmetrics.registerFont(TTFont("QBitsBold", pair[1]))
    pdfmetrics.registerFontFamily("QBits", normal="QBits", bold="QBitsBold")

    width, height = A4
    margin, usable = 42, width - 84
    ink, muted = colors.HexColor("#202C2B"), colors.HexColor("#5B6967")
    green, pale_green = colors.HexColor("#258361"), colors.HexColor("#EDF6F0")
    before_color, rule = colors.HexColor("#9AA6A2"), colors.HexColor("#E0E7E3")
    pale_gray = colors.HexColor("#F5F7F6")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".tmp")
    canvas = Canvas(str(temporary), pagesize=A4, pageCompression=1, invariant=1)
    canvas.setTitle("Q-bits - Balance de CPU - 22 de noviembre de 2026")
    canvas.setAuthor("Q-bits / dbastias37")
    canvas.setSubject(f"Comparación acumulada hasta PR #{pr_number}; integración {merge_sha}")

    def text(x, top, value, size=10, bold=False, color=ink, align="left"):
        canvas.setFillColor(color)
        canvas.setFont("QBitsBold" if bold else "QBits", size)
        method = {"left": canvas.drawString, "right": canvas.drawRightString,
                  "center": canvas.drawCentredString}[align]
        method(x, height - top - size, str(value))

    def paragraph(value, top, x=margin, box_width=usable, size=9.4, leading=13.1,
                  color=ink, max_height=None):
        style = ParagraphStyle("body", fontName="QBits", fontSize=size, leading=leading,
                               textColor=color, alignment=TA_LEFT)
        item = Paragraph(value, style)
        _, measured_height = item.wrap(box_width, height)
        require(max_height is None or measured_height <= max_height + 0.01,
                f"Texto demasiado largo para el diseño: {value[:95]}")
        item.drawOn(canvas, x, height - top - measured_height)
        return top + measured_height

    def line(x1, top1, x2, top2, color=rule, thickness=0.6):
        canvas.setStrokeColor(color)
        canvas.setLineWidth(thickness)
        canvas.line(x1, height - top1, x2, height - top2)

    def box(x, top, box_width, box_height, color):
        canvas.setFillColor(color)
        canvas.roundRect(x, height - top - box_height, box_width, box_height, 7, stroke=0, fill=1)

    def link(label, url, x, top, size=8.8, bold=False):
        text(x, top, label, size, bold, green)
        length = pdfmetrics.stringWidth(label, "QBitsBold" if bold else "QBits", size)
        canvas.linkURL(url, (x, height - top - size - 2, x + length, height - top + 2), relative=0)

    def source_url(path):
        return f"{REPOSITORY}/blob/{merge_sha}/{path}"

    def chrome(page, label):
        text(margin, 31, "Q-bits", 19, True, green)
        text(width - margin, 39, label, 8.6, color=muted, align="right")
        line(margin, 64, width - margin, 64)
        line(margin, 804, width - margin, 804)
        text(margin, 814, f"22 noviembre 2026  |  PR #{pr_number}  |  {merge_sha[:7]}", 8, color=muted)
        text(width - margin, 814, f"{page} / 2", 8, color=muted, align="right")

    try:
        chrome(1, "BALANCE DE LA SERIE")
        text(margin, 80, "Menos trabajo repetido,", 24, True)
        text(margin, 110, "la misma simulación", 24, True)
        paragraph(f"Desde antes del PR #26 hasta el PR #{pr_number}. Comparación acumulada "
                  "de tres escenas con cuerpos independientes <b>en reposo</b>, a igual duración simulada.",
                  151, size=10.1, leading=14, max_height=32)
        savings = [case["saving"] for case in data["cases"]]
        box(margin, 195, usable, 70, pale_green)
        paragraph(f"<b>Entre {spanish(min(savings), 1)} % y {spanish(max(savings), 1)} % menos tiempo "
                  "de CPU</b> en estos ensayos. El porcentaje describe el ahorro del mismo caso; "
                  "no el uso total del procesador ni cualquier partida.",
                  208, x=margin + 14, box_width=usable - 28, size=11.1, leading=15,
                  color=ink, max_height=46)
        text(margin, 285, "CPU de proceso por fotograma simulado", 13, True)
        paragraph("Milisegundos; menor es mejor. Mediana de las medias de 3 repeticiones, "
                  "con 30 frames medidos por repetición.", 307, size=9.1, leading=12.7, max_height=27)
        box(margin, 343, 10, 8, before_color)
        text(margin + 16, 339, "Antes de #26", 8.8, color=muted)
        box(margin + 124, 343, 10, 8, green)
        text(margin + 140, 339, f"Tras #{pr_number}", 8.8, color=muted)
        text(width - margin, 339, "Línea fina: rango de las 3 medias", 8.2, color=muted, align="right")

        axis_max = math.ceil(max(max(values) for case in data["cases"]
                                 for values in case["means"].values()) / 10) * 10
        plot_x, plot_width = margin + 44, usable - 129
        scale = plot_width / axis_max
        for index, case in enumerate(data["cases"]):
            top = 370 + index * 84
            text(margin, top, f"{spanish(case['pieces'], 0)} piezas  |  {case['hz']} Hz", 10.3, True)
            text(width - margin, top, f"{spanish(case['saving'], 1)} % menos", 10.3, True, green, "right")
            for tick in range(0, int(axis_max) + 1, 10):
                line(plot_x + tick * scale, top + 23, plot_x + tick * scale, top + 56,
                     thickness=0.4)
            for offset, arm, label, color in ((24, "baseline", "Antes", before_color),
                                               (43, "optimized", "Ahora", green)):
                bar_top = top + offset
                text(margin, bar_top - 1, label, 8.5, color=muted)
                canvas.setFillColor(color)
                canvas.rect(plot_x, height - bar_top - 11, case[arm] * scale, 11, stroke=0, fill=1)
                low, high = min(case["means"][arm]), max(case["means"][arm])
                center = bar_top + 5.5
                line(plot_x + low * scale, center, plot_x + high * scale, center, ink, 0.8)
                for value in (low, high):
                    line(plot_x + value * scale, center - 3, plot_x + value * scale, center + 3, ink, 0.8)
                text(width - margin, bar_top - 1, f"{spanish(case[arm])} ms", 9.3, True, align="right")
        line(plot_x, 610, plot_x + plot_width, 610)
        for tick in range(0, int(axis_max) + 1, 10):
            text(plot_x + tick * scale, 616, str(tick), 8.5, color=muted, align="center")

        box(margin, 646, usable, 96, pale_gray)
        text(margin + 13, 657, "Comparación equivalente", 10, True)
        paragraph("3 parejas AB/BA/AB; 60 frames de calentamiento y 30 medidos "
                  "(0,5 s simulados). Estados completos, inventarios y relojes idénticos. "
                  "60 pasos físicos a 120 Hz y 30 a 60 Hz; cero tiempo descartado.",
                  678, x=margin + 13, box_width=usable - 26, size=9.1, leading=12.7, max_height=39)
        text(margin + 13, 721, f"Base: {SERIES_BASE[:7]} (antes de #26). Final: {merge_sha[:7]} (#{pr_number}).",
             8.7, color=muted)
        runtime = data["datasets"][0]["runtime"]
        paragraph(f"Node {escape(runtime['node'])}, Cannon real, DOM/GPU simulados. CPU de proceso "
                  "(usuario + sistema, incluidos hilos auxiliares); no FPS, GPU ni porcentaje de uso.",
                  753, size=8.7, leading=11.7, color=muted, max_height=25)
        link("Datos: 500 / 1.000 piezas, 120 Hz", source_url(data["files"][0]), margin, 783, 8.4)
        link("Datos: 2.000 piezas, 60 Hz", source_url(data["files"][1]), margin + 286, 783, 8.4)
        canvas.showPage()

        chrome(2, "CAMBIOS, VALIDACIÓN Y LÍMITES")
        text(margin, 81, "Qué cambió y qué queda", 23, True)
        paragraph("Cambios pequeños y revisables, manteniendo JavaScript estático y Cannon. "
                  "Cada PR tiene su propia referencia y evidencia.",
                  118, size=10, leading=14, max_height=29)
        changes = [
            (26, "Apuntado, guía Ctrl, sensores y baterías",
             "Comparte consultas e índices y evita reconstruir geometría en cada actualización.",
             "AUDITORIA_CPU_2026-11-22.md"),
            (27, "Guardado repetido",
             "Reutiliza validación de la partida anterior; el guardado grande sigue siendo síncrono.",
             "AUDITORIA_GUARDADO_2026-11-22.md"),
            (28, "Producción 20: corrección funcional",
             "Corrige el apoyo para completar el lote; añade CPU y no se cuenta como ahorro.",
             "CORRECCION_PRODUCCION20_2026-11-22.md"),
            (29, "Contornos de cajas",
             "Reutiliza la geometría de los 12 bordes y evita generar y subir buffers repetidos.",
             "RENDIMIENTO_CONTORNOS_CAJAS_2026-11-22.md"),
            (30, "Parejas pasivas de SAP",
             "Evita candidatos rechazables, manteniendo las parejas admitidas y su orden.",
             "RENDIMIENTO_SAP_2026-11-22.md"),
            (31, "Mantenimiento de matrices de contactos",
             "Limpia posiciones registradas, con ruta nativa para matrices pequeñas o densas.",
             "RENDIMIENTO_MATRIZ_CONTACTOS_2026-11-22.md"),
            (32, "Arranque de escenas grandes",
             "Amplía la longitud antes de escribir contactos lejanos; conserva entradas y eventos.",
             "RENDIMIENTO_ARRANQUE_2026-11-22.md"),
            (pr_number, "Consultas de presión",
             "Sin botones, evita calcular límites; con botones, conserva la consulta de apoyo.",
             "RENDIMIENTO_CONSULTAS_PRESION_2026-11-22.md"),
        ]
        for index, (number, title, description, report) in enumerate(changes):
            top = 162 + index * 36
            box(margin, top, 41, 24, pale_green)
            link(f"#{number}", f"{REPOSITORY}/pull/{number}", margin + 8, top + 5, 10, True)
            text(margin + 54, top, title, 9.7, True)
            link("Informe", source_url("docs/" + report), width - margin - 34, top + 1, 8.2)
            paragraph(description, top + 15, x=margin + 54, box_width=usable - 54,
                      size=8.5, leading=11.2, color=muted, max_height=12)

        box(margin, 465, usable, 85, pale_green)
        text(margin + 13, 476,
             f"Arranque del PR #32: {spanish(data['peaks']['baseline'], 2)} s a "
             f"{spanish(data['peaks']['optimized'], 2)} s", 14, True, green)
        paragraph("Mediana del máximo de los 4 primeros frames; 2.000 piezas a 120 Hz, "
                  "3 parejas con proceso nuevo. Comparación propia frente a "
                  f"<b>{STARTUP_BASE[:7]} (PR #31)</b>; no es un ahorro nuevo del PR de presión.",
                  502, x=margin + 13, box_width=usable - 26, size=9.1, leading=12.5, max_height=39)

        text(margin, 569, "Validación y límites", 12.4, True)
        paragraph(f"<b>Suite final: {spanish(tests, 0)}/{spanish(tests, 0)} pruebas aprobadas.</b> "
                  "Los tres casos acumulados conservan estados completos y relojes exactos. "
                  f"El código medido coincide con la integración <b>{merge_sha[:7]}</b>.",
                  592, size=9.3, leading=13.1, max_height=40)
        paragraph("El ahorro depende de la escena y del equipo. Los controles pequeños y los "
                  "mecanismos activos incluyen resultados desfavorables. Los porcentajes de "
                  "subsistemas no se suman para prometer una mejora global.",
                  643, size=9.2, leading=13.1, max_height=40)
        paragraph("Siguen pendientes el solver, el asentamiento y consultas frías costosas. "
                  "Sin botones puede evitarse un precalentamiento incidental: la primera consulta "
                  "geométrica necesaria aún prepara sus cachés. Navegador real, FPS y GPU no se midieron.",
                  694, size=9.2, leading=13.1, max_height=53)
        link("Balance completo", source_url("docs/BALANCE_CPU_2026-11-22.md"), margin, 765, 8.6)
        link("Informe del último PR", source_url("docs/RENDIMIENTO_CONSULTAS_PRESION_2026-11-22.md"),
             margin + 145, 765, 8.6)
        link("Datos del arranque #32", source_url(data["startup_file"]), margin + 326, 765, 8.6)
        text(margin, 784, "Enlaces activos a los PR, informes técnicos y datos reproducibles.", 8.2, color=muted)
        canvas.showPage()
        canvas.save()
        temporary.replace(output)
    finally:
        if temporary.exists():
            temporary.unlink()


def positive_integer(value):
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("Debe ser un entero positivo")
    return parsed


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pr-number", type=positive_integer, required=True, help="PR de presión ya publicado")
    parser.add_argument("--merge-sha", required=True, help="SHA completo de la integración verificada")
    parser.add_argument("--tests", type=positive_integer, required=True, help="Pruebas aprobadas en la suite final")
    parser.add_argument("--output", type=Path, required=True, help="PDF de salida (dos páginas A4)")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    try:
        require(args.pr_number > 32, "El PR de presión debe seguir al PR #32")
        require(re.fullmatch(r"[0-9a-f]{40}", args.merge_sha), "--merge-sha debe ser un SHA Git de 40 caracteres")
        require(args.output.suffix.lower() == ".pdf", "--output debe terminar en .pdf")
        data = load_inputs(args.repo_root.resolve(), args.merge_sha, args.tests)
        render_pdf(args.output.resolve(), data, args.pr_number, args.merge_sha, args.tests)
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"No se creó el PDF: {error}\n")
    print(args.output.resolve())


if __name__ == "__main__":
    main()
