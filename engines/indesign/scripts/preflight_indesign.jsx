var job = /*__JOB_JSON__*/;
var engineRoot = /*__ENGINE_ROOT__*/;
var sharedRoot = /*__SHARED_ROOT__*/;

function writeLog(filePath, lines) {
    var f = new File(filePath); f.encoding = "UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close();
}

// InDesign: unlock all layers so we can inspect locked frames
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

// InDesign textFrames.itemByName() is reliable — also search story text frames
function hasTextFrame(doc, name) {
    try { var f = doc.textFrames.itemByName(name); if (f.isValid) return true; } catch(e) {}
    // Fallback: walk all page items
    try {
        var items = doc.allPageItems;
        for (var i = 0; i < items.length; i++) {
            if (items[i].constructor && items[i].constructor.name === "TextFrame" && items[i].name === name) return true;
        }
    } catch(e) {}
    return false;
}

// Collect all named text frames from allPageItems
function getAllNamedTextFrames(doc) {
    var names = [];
    try {
        var items = doc.allPageItems;
        for (var i = 0; i < items.length; i++) {
            try {
                var item = items[i];
                if (item.constructor && item.constructor.name === "TextFrame" && item.name && item.name !== "") {
                    names.push(item.name);
                }
            } catch(e) {}
        }
    } catch(e) {}
    return names;
}

var doc = null;
var layerSnapshot = [];
var required = ["DOC_TITLE", "SECTION_EXECUTIVE_SUMMARY", "SECTION_BODY"];
var optional = ["DOC_SUBTITLE", "DOC_AUTHOR", "DOC_DATE", "SECTION_CONCLUSION", "SECTION_CTA", "STAT_01", "STAT_02", "STAT_03"];
var templateName = job.template || "WHITEPAPER_LETTER_MASTER_v001";
var log = ["INDESIGN PREFLIGHT", "Date: " + new Date(), "Template: " + templateName, ""];

try {
    var templateFile = new File(engineRoot + "/templates/" + templateName + ".indd");
    log.push("Template path: " + templateFile.fsName);
    if (!templateFile.exists) throw new Error("Template file missing: " + templateFile.fsName);

    doc = app.open(templateFile);
    log.push("Opened successfully. Pages: " + doc.pages.length);

    layerSnapshot = unlockAllLayers(doc);

    var allFrameNames = getAllNamedTextFrames(doc);
    log.push("Named text frames found: " + allFrameNames.length);
    log.push("");

    log.push("--- All named text frames in template ---");
    for (var n = 0; n < allFrameNames.length; n++) {
        log.push("  FRAME: " + allFrameNames[n]);
    }
    log.push("");

    log.push("--- Required fields ---");
    var allPass = true;
    for (var i = 0; i < required.length; i++) {
        var found = hasTextFrame(doc, required[i]);
        log.push((found ? "PASS: Found " : "FAIL: Missing ") + required[i]);
        if (!found) allPass = false;
    }
    log.push("");

    log.push("--- Optional fields ---");
    for (var j = 0; j < optional.length; j++) {
        var found2 = hasTextFrame(doc, optional[j]);
        log.push((found2 ? "OK: Found " : "NOTE: Not present ") + optional[j]);
    }
    log.push("");
    log.push("Page count: " + doc.pages.length);
    log.push("Text frame count (total): " + doc.textFrames.length);
    log.push("");
    log.push(allPass ? "RESULT: PASS — all required frames found" : "RESULT: FAIL — one or more required frames missing. See frame list above for actual names.");

    restoreLayers(layerSnapshot);
    layerSnapshot = [];
} catch (err) {
    if (layerSnapshot.length > 0) try { restoreLayers(layerSnapshot); } catch(e) {}
    log.push("ERROR: " + err.message);
    log.push("RECOVERY: Check macOS permissions, InDesign dialogs, template existence, and named text frames.");
    throw err;
} finally {
    var logFile = new File(sharedRoot + "/outputs/logs/indesign_preflight_report.txt");
    writeLog(logFile, log);
    if (doc !== null) { try { doc.close(SaveOptions.NO); } catch(e) {} }
}
