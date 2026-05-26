var job = /*__JOB_JSON__*/;
var engineRoot = /*__ENGINE_ROOT__*/;
var sharedRoot = /*__SHARED_ROOT__*/;

function cleanName(name) { return String(name || "indesign_output").replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 120); }

function writeLog(filePath, lines) {
    var f = new File(filePath); f.encoding = "UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close();
}

// ── Layer helpers ──────────────────────────────────────────────────────────────

function unlockAllLayers(doc) {
    var snapshot = [];
    for (var l = 0; l < doc.layers.length; l++) {
        snapshot.push({ layer: doc.layers[l], locked: doc.layers[l].locked });
        doc.layers[l].locked = false;
    }
    return snapshot;
}
function restoreLayers(snapshot) {
    for (var i = 0; i < snapshot.length; i++) {
        try { snapshot[i].layer.locked = snapshot[i].locked; } catch(e) {}
    }
}

// ── Text & image helpers ───────────────────────────────────────────────────────

function setText(doc, name, value, log) {
    try {
        var frame = doc.textFrames.itemByName(name);
        if (!frame || !frame.isValid) {
            // Fallback: walk allPageItems
            var found = false;
            var items = doc.allPageItems;
            for (var i = 0; i < items.length; i++) {
                if (items[i].constructor && items[i].constructor.name === "TextFrame" && items[i].name === name) {
                    frame = items[i]; found = true; break;
                }
            }
            if (!found) { log.push("MISSING: " + name); return; }
        }
        try { frame.locked = false; } catch(e) {}
        frame.contents = value;
        log.push("UPDATED: " + name + " (" + String(value).substring(0, 40) + (String(value).length > 40 ? "…" : "") + ")");
    } catch (e) {
        log.push("ERROR_SET: " + name + " — " + e.message);
    }
}

function replaceImage(doc, name, filePath, log) {
    try {
        // Try rectangles first, then allPageItems
        var frame = doc.rectangles.itemByName(name);
        if (!frame || !frame.isValid) {
            var items = doc.allPageItems;
            for (var i = 0; i < items.length; i++) {
                if (items[i].name === name) { frame = items[i]; break; }
            }
        }
        if (!frame || !frame.isValid) { log.push("SKIP_IMG: " + name + " (frame not found)"); return; }
        var f = new File(filePath);
        if (!f.exists) { log.push("MISSING_IMG: " + filePath); return; }
        try { frame.locked = false; } catch(e) {}
        frame.place(f);
        log.push("IMG_PLACED: " + name);
    } catch (e) {
        log.push("ERROR_IMG: " + name + " — " + e.message);
    }
}

// ── Main ───────────────────────────────────────────────────────────────────────

var doc = null;
var layerSnapshot = [];
var safeName = cleanName(job.output_name);
var log = ["INDESIGN AUTOMATION RUN", "Date: " + new Date(), "Output: " + safeName, "Template: " + (job.template || "WHITEPAPER_LETTER_MASTER_v001"), ""];

try {
    var templateName = job.template || "WHITEPAPER_LETTER_MASTER_v001";
    var templateFile = new File(engineRoot + "/templates/" + templateName + ".indd");
    if (!templateFile.exists) throw new Error("Missing template file: " + templateFile.fsName);

    doc = app.open(templateFile);
    log.push("Opened template. Pages: " + doc.pages.length);

    // Unlock all layers so content frames are editable regardless of lock state
    layerSnapshot = unlockAllLayers(doc);
    log.push("Layers unlocked for editing.");
    log.push("");

    log.push("--- Text updates ---");
    for (var key in job.content) {
        if (job.content.hasOwnProperty(key)) {
            setText(doc, key, job.content[key], log);
        }
    }

    if (job.images) {
        log.push("");
        log.push("--- Image replacements ---");
        for (var imgKey in job.images) {
            if (job.images.hasOwnProperty(imgKey) && job.images[imgKey]) {
                replaceImage(doc, imgKey, job.images[imgKey], log);
            }
        }
    }

    // Restore layer locks before export
    restoreLayers(layerSnapshot);
    layerSnapshot = [];
    log.push("");
    log.push("--- Export ---");

    // Use organised subfolder passed by the job runner (engine/template/YYYY-MM-DD).
    // Fall back to legacy flat path so old jobs / unit tests still work.
    var outputSubdir = (job && job.output_subdir) ? job.output_subdir : "outputs/indesign";
    var outDir = new Folder(sharedRoot + "/" + outputSubdir);
    if (!outDir.exists) outDir.create();

    // IDML (editable archive)
    var idmlFile = new File(sharedRoot + "/" + outputSubdir + "/" + safeName + ".idml");
    doc.exportFile(ExportFormat.INDESIGN_MARKUP, idmlFile, false);
    log.push(idmlFile.exists ? "PASS: IDML saved → " + idmlFile.fsName : "FAIL: IDML missing");

    // PDF — set explicit image quality so output is always full-res regardless of app preset
    var pdfFile = new File(sharedRoot + "/" + outputSubdir + "/" + safeName + "_web.pdf");
    try {
        app.pdfExportPreferences.pageRange                        = PageRange.ALL_PAGES;
        app.pdfExportPreferences.acrobatCompatibility             = AcrobatCompatibility.ACROBAT_7;
        app.pdfExportPreferences.generateThumbnails               = true;
        app.pdfExportPreferences.exportGuidesAndGrids             = false;
        app.pdfExportPreferences.exportNonprintingObjects         = false;
        // Color images: downsample to 300 dpi (trigger at 450), ZIP compression
        app.pdfExportPreferences.colorBitmapSampling              = Sampling.DOWNSAMPLE;
        app.pdfExportPreferences.colorBitmapSamplingDPI           = 300;
        app.pdfExportPreferences.colorBitmapSamplingImageDPI      = 450;
        app.pdfExportPreferences.colorBitmapCompression           = BitmapCompression.AUTO_COMPRESSION;
        // Grayscale images: same treatment
        app.pdfExportPreferences.grayscaleBitmapSampling          = Sampling.DOWNSAMPLE;
        app.pdfExportPreferences.grayscaleBitmapSamplingDPI       = 300;
        app.pdfExportPreferences.grayscaleBitmapSamplingImageDPI  = 450;
        app.pdfExportPreferences.grayscaleBitmapCompression       = BitmapCompression.AUTO_COMPRESSION;
    } catch (prefErr) {
        log.push("WARN: Could not set PDF prefs — " + prefErr.message + ". Exporting with current app preset.");
    }
    doc.exportFile(ExportFormat.PDF_TYPE, pdfFile, false);
    log.push(pdfFile.exists ? "PASS: PDF (web) exported → " + pdfFile.fsName : "FAIL: PDF (web) missing");

    // PDF (print) — trim marks + 0.125 in bleed, high-res images
    var pdfPrintFile = new File(sharedRoot + "/" + outputSubdir + "/" + safeName + "_print.pdf");
    try {
        app.pdfExportPreferences.pageRange              = PageRange.ALL_PAGES;
        app.pdfExportPreferences.acrobatCompatibility   = AcrobatCompatibility.ACROBAT_7;
        app.pdfExportPreferences.generateThumbnails     = false;
        app.pdfExportPreferences.exportGuidesAndGrids   = false;
        app.pdfExportPreferences.exportNonprintingObjects = false;
        app.pdfExportPreferences.cropMarks              = true;
        app.pdfExportPreferences.registrationMarks      = true;
        app.pdfExportPreferences.colorBars              = false;
        app.pdfExportPreferences.pageInformationMarks   = false;
        app.pdfExportPreferences.useDocumentBleedWithPDF = false;
        app.pdfExportPreferences.bleedTop               = "0p9";   // 9pt = 0.125 in
        app.pdfExportPreferences.bleedBottom            = "0p9";
        app.pdfExportPreferences.bleedInside            = "0p9";
        app.pdfExportPreferences.bleedOutside           = "0p9";
        app.pdfExportPreferences.colorBitmapSampling    = Sampling.DOWNSAMPLE;
        app.pdfExportPreferences.colorBitmapSamplingDPI = 300;
        app.pdfExportPreferences.colorBitmapSamplingImageDPI = 450;
        app.pdfExportPreferences.colorBitmapCompression = BitmapCompression.AUTO_COMPRESSION;
        app.pdfExportPreferences.grayscaleBitmapSampling = Sampling.DOWNSAMPLE;
        app.pdfExportPreferences.grayscaleBitmapSamplingDPI = 300;
        app.pdfExportPreferences.grayscaleBitmapSamplingImageDPI = 450;
        app.pdfExportPreferences.grayscaleBitmapCompression = BitmapCompression.AUTO_COMPRESSION;
    } catch (printPrefErr) {
        log.push("WARN: Could not set print PDF prefs — " + printPrefErr.message + ". Exporting with current prefs.");
    }
    doc.exportFile(ExportFormat.PDF_TYPE, pdfPrintFile, false);
    log.push(pdfPrintFile.exists ? "PASS: PDF (print) exported → " + pdfPrintFile.fsName : "FAIL: PDF (print) missing");

    // JPEG preview (first page) — goes in same folder as the IDML and PDF
    var jpegFile = new File(sharedRoot + "/" + outputSubdir + "/" + safeName + "_preview.jpg");
    app.jpegExportPreferences.exportResolution = 150;
    app.jpegExportPreferences.jpegQuality = JPEGOptionsQuality.HIGH;
    app.jpegExportPreferences.jpegExportRange = ExportRangeOrAllPages.EXPORT_RANGE;
    app.jpegExportPreferences.pageString = "1";
    doc.exportFile(ExportFormat.JPG, jpegFile, false);
    log.push(jpegFile.exists ? "PASS: JPEG preview exported" : "FAIL: JPEG preview missing");

} catch (err) {
    if (layerSnapshot.length > 0) try { restoreLayers(layerSnapshot); } catch(e) {}
    log.push("");
    log.push("ERROR: " + err.message);
    log.push("RECOVERY: Check macOS permissions, InDesign dialogs, template existence, and named text frames.");
    throw err;
} finally {
    var logFile = new File(sharedRoot + "/outputs/logs/" + safeName + "_changelog.txt");
    writeLog(logFile, log);
    if (doc !== null) { try { doc.close(SaveOptions.NO); } catch(e) {} }
}
