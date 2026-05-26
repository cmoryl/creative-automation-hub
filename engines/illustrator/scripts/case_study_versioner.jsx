var job = /*__JOB_JSON__*/;
var engineRoot = /*__ENGINE_ROOT__*/;
var sharedRoot = /*__SHARED_ROOT__*/;

function cleanName(name){return String(name||"creative_output").replace(/[^a-zA-Z0-9_-]/g,"_").substring(0,120);}
function writeLog(filePath,lines){var f=new File(filePath);f.encoding="UTF-8";f.open("w");f.write(lines.join("\n"));f.close();}

// ── Field alias map ────────────────────────────────────────────────────────────
// Maps manifest/job field names → actual text frame names in the .ai template.
// Applies to ALL templates; per-template aliases can also be declared in the
// manifest under "frame_aliases" and are merged in at runtime (see below).
var FRAME_ALIASES = {
  // Master / Healthcare / Technology template frames
  "TEXT_CHALLENGE":   "TEXT_CHALLENGE_BODY",
  "TEXT_SOLUTION":    "TEXT_SOLUTION_BODY",
  "TEXT_RESULTS":     "TEXT_RESULTS_BODY",
  "TEXT_TESTIMONIAL": "TEXT_TESTIMONIAL_QUOTE",
  // Baxter / Life Sciences template frames
  "TEXT_SERVICES":    "TEXT_SERVICES_BODY"
};

// Section header frames present in the template but not in the manifest.
// Auto-populated with defaults unless the job content already provides them.
var HEADER_DEFAULTS = {
  "TEXT_CHALLENGE_HEADER": "The Challenge",
  "TEXT_SOLUTION_HEADER":  "The Solution",
  "TEXT_RESULTS_HEADER":   "The Results",
  "TEXT_SERVICES_HEADER":  "Services"
};

// Merge per-template frame_aliases from the manifest (if present)
if (job && job.frame_aliases && typeof job.frame_aliases === "object") {
  for (var k in job.frame_aliases) {
    if (job.frame_aliases.hasOwnProperty(k)) FRAME_ALIASES[k] = job.frame_aliases[k];
  }
}

function resolveFrameName(name) {
  return FRAME_ALIASES[name] || name;
}

// ── Layer helpers ──────────────────────────────────────────────────────────────

function setLayerLocked(layer, locked) {
  try { layer.locked = locked; } catch(e) {}
  try { for (var i=0;i<layer.layers.length;i++) setLayerLocked(layer.layers[i], locked); } catch(e) {}
}

function unlockAllLayers(doc) {
  var snapshot = [];
  for (var l=0;l<doc.layers.length;l++) {
    snapshot.push({ layer: doc.layers[l], locked: doc.layers[l].locked });
    setLayerLocked(doc.layers[l], false);
  }
  return snapshot;
}

function restoreLayers(snapshot) {
  for (var i=0;i<snapshot.length;i++) {
    try { snapshot[i].layer.locked = snapshot[i].locked; } catch(e) {}
  }
}

// ── Deep text-frame search ─────────────────────────────────────────────────────

function collectTextFrames(container, results) {
  var items; try { items = container.pageItems; } catch(e) { return; }
  for (var i=0;i<items.length;i++) {
    var item=items[i]; if(!item) continue;
    var tn; try { tn=item.typename; } catch(e) { continue; }
    if (tn==="TextFrame") results.push(item);
    else if (tn==="GroupItem"||tn==="Layer") collectTextFrames(item, results);
  }
}

function getAllTextFrames(doc) {
  var results=[];
  for (var i=0;i<doc.textFrames.length;i++) results.push(doc.textFrames[i]);
  for (var l=0;l<doc.layers.length;l++) collectTextFrames(doc.layers[l], results);
  var seen={}, unique=[];
  for (var j=0;j<results.length;j++) {
    var n; try { n=results[j].name; } catch(e) { n=""; }
    if (!seen[n]) { seen[n]=true; unique.push(results[j]); }
  }
  return unique;
}

function findTextFrameByName(frames, name) {
  for (var i=0;i<frames.length;i++) {
    try { if (frames[i].name===name) return frames[i]; } catch(e) {}
  }
  return null;
}

function setText(frames, fieldName, value, log) {
  var resolved = resolveFrameName(fieldName);
  var item = findTextFrameByName(frames, resolved);
  if (!item) {
    if (resolved !== fieldName) log.push("MISSING: "+fieldName+" (looked for '"+resolved+"')");
    else log.push("MISSING: "+fieldName);
    return;
  }
  try {
    try { item.locked=false; } catch(e) {}
    item.contents = value;
    log.push("UPDATED: "+fieldName+(resolved!==fieldName?" → '"+resolved+"'":"")+" ("+String(value).substring(0,40)+(String(value).length>40?"…":"")+")");
  } catch(setErr) {
    log.push("ERROR_SET: "+fieldName+" — "+setErr.message);
  }
}

// ── Placed image replacement ───────────────────────────────────────────────────

// Walk pageItems recursively to find the first PlacedItem inside a container.
function getFirstPlacedItem(container) {
  var items; try { items = container.pageItems; } catch(e) { return null; }
  for (var i=0;i<items.length;i++) {
    var tn; try { tn=items[i].typename; } catch(e) { continue; }
    if (tn==="PlacedItem") return items[i];
    if (tn==="GroupItem") { var found=getFirstPlacedItem(items[i]); if(found) return found; }
  }
  return null;
}

// Recursively search layers/groups for a container named 'name', return first PlacedItem inside it.
function findPlacedItemInContainer(container, name) {
  var items; try { items = container.pageItems; } catch(e) { return null; }
  for (var i=0;i<items.length;i++) {
    var item=items[i];
    var tn; try { tn=item.typename; } catch(e) { continue; }
    if ((tn==="GroupItem"||tn==="Layer") && item.name===name) {
      var hit=getFirstPlacedItem(item);
      if (hit) return hit;
    }
    if (tn==="GroupItem"||tn==="Layer") {
      var nested=findPlacedItemInContainer(item, name);
      if (nested) return nested;
    }
  }
  return null;
}

function findPlacedItemByName(doc, name) {
  // Pass 1: exact name match on the placed item itself (fastest, works if item is named in Layers panel)
  for (var i=0;i<doc.placedItems.length;i++) {
    try { if (doc.placedItems[i].name===name) return doc.placedItems[i]; } catch(e) {}
  }
  // Pass 2: find a layer or group named 'name' and return the first PlacedItem inside it
  for (var l=0;l<doc.layers.length;l++) {
    if (doc.layers[l].name===name) {
      var hit=getFirstPlacedItem(doc.layers[l]);
      if (hit) return hit;
    }
    var deep=findPlacedItemInContainer(doc.layers[l], name);
    if (deep) return deep;
  }
  return null;
}

function replaceImage(doc, name, filePath, log) {
  var item = findPlacedItemByName(doc, name);
  if (!item) {
    // Diagnostic: list what placed items and their names actually exist
    var names=[];
    for (var i=0;i<doc.placedItems.length;i++) { try { names.push('"'+doc.placedItems[i].name+'"'); } catch(e) {} }
    log.push("SKIP_IMG: "+name+" — no PlacedItem or layer/group with that name found. Existing placedItems: ["+names.join(", ")+"]");
    log.push("FIX: In Illustrator's Layers panel, rename the placed image to '"+name+"', or rename its containing layer/group to '"+name+"'.");
    return;
  }
  var f = new File(filePath);
  if (!f.exists) { log.push("MISSING_IMG: "+filePath); return; }
  try { try { item.locked=false; } catch(e) {} item.file=f; log.push("IMG_REPLACED: "+name+" → "+filePath); }
  catch(imgErr) { log.push("ERROR_IMG: "+name+" — "+imgErr.message); }
}

// ── Main ───────────────────────────────────────────────────────────────────────

var doc = null;
var layerSnapshot = [];
var safeName = cleanName(job.output_name);
var log = ["ILLUSTRATOR AUTOMATION RUN","Date: "+new Date(),"Output: "+safeName,"Template: "+(job.template||"CASE_STUDY_LETTER_MASTER_v001"),""];

try {
    var templateName = job.template||"CASE_STUDY_LETTER_MASTER_v001";
    var templateFile = new File(engineRoot+"/templates/"+templateName+".ai");
    if (!templateFile.exists) throw new Error("Missing template file: "+templateFile.fsName);

    doc = app.open(templateFile);
    log.push("Opened template. Frames: "+doc.textFrames.length);

    layerSnapshot = unlockAllLayers(doc);
    log.push("Layers unlocked.");

    var allFrames = getAllTextFrames(doc);
    log.push("Text frames (deep): "+allFrames.length);
    log.push("");

    // Apply job content fields
    log.push("--- Text updates ---");
    for (var key in job.content) {
        if (job.content.hasOwnProperty(key)) {
            setText(allFrames, key, job.content[key], log);
        }
    }

    // Auto-populate section header frames with defaults if not in job content
    // Only set headers that actually exist in this template (avoids MISSING noise on templates without them)
    log.push("");
    log.push("--- Section headers ---");
    var headerApplied = 0;
    for (var hKey in HEADER_DEFAULTS) {
        if (!job.content || !job.content[hKey]) {
            var resolvedHKey = resolveFrameName(hKey);
            if (findTextFrameByName(allFrames, resolvedHKey) !== null) {
                setText(allFrames, hKey, HEADER_DEFAULTS[hKey], log);
                headerApplied++;
            }
        }
    }
    if (headerApplied === 0) log.push("(no header frames in this template)");

    // Image replacements
    if (job.images) {
        log.push("");
        log.push("--- Image replacements ---");
        for (var imgKey in job.images) {
            if (job.images.hasOwnProperty(imgKey) && job.images[imgKey]) {
                replaceImage(doc, imgKey, job.images[imgKey], log);
            }
        }
    }

    restoreLayers(layerSnapshot);
    layerSnapshot = [];
    log.push("");
    log.push("--- Export ---");

    // Use organised subfolder passed by the job runner (engine/template/YYYY-MM-DD).
    // Fall back to legacy flat path so old jobs / unit tests still work.
    var outputSubdir = (job && job.output_subdir) ? job.output_subdir : "outputs/ai";
    var outDir = new Folder(sharedRoot+"/"+outputSubdir);
    if (!outDir.exists) outDir.create();

    var aiFile       = new File(sharedRoot+"/"+outputSubdir+"/"+safeName+".ai");
    var pdfWebFile   = new File(sharedRoot+"/"+outputSubdir+"/"+safeName+"_web.pdf");
    var pdfPrintFile = new File(sharedRoot+"/"+outputSubdir+"/"+safeName+"_print.pdf");
    var pngFile      = new File(sharedRoot+"/"+outputSubdir+"/"+safeName+"_preview.png");

    var aiSaveOpts = new IllustratorSaveOptions();
    aiSaveOpts.compatibility = Compatibility.ILLUSTRATOR17; // CS6 — avoids interactive compatibility dialog
    aiSaveOpts.saveMultipleArtboards = false;
    doc.saveAs(aiFile, aiSaveOpts);
    log.push("AI saved → "+aiFile.fsName);

    // PDF (web) — screen-optimised, no marks
    var pdfWebOpts = new PDFSaveOptions();
    pdfWebOpts.preserveEditability = false;
    pdfWebOpts.generateThumbnails  = true;
    doc.saveAs(pdfWebFile, pdfWebOpts);
    log.push("PDF (web) saved → "+pdfWebFile.fsName);

    // PDF (print) — trim marks + 0.125 in bleed
    // Wrapped in try/catch: a bad pref value must never kill the AI + web-PDF + PNG outputs.
    try {
        var pdfPrintOpts = new PDFSaveOptions();
        pdfPrintOpts.preserveEditability  = false;
        pdfPrintOpts.generateThumbnails   = false;
        pdfPrintOpts.trimMarks            = true;   // Illustrator API: trimMarks, not addBleedMarks
        pdfPrintOpts.registrationMarks    = true;
        pdfPrintOpts.colorBars            = false;
        pdfPrintOpts.pageInformation      = false;
        pdfPrintOpts.trimMarkWeight       = PDFTrimMarkWeight.TRIMMARKWEIGHT0125; // 0.125 pt
        pdfPrintOpts.bleedOffsetTop       = 9;  // 9pt = 0.125 in
        pdfPrintOpts.bleedOffsetBottom    = 9;
        pdfPrintOpts.bleedOffsetLeft      = 9;
        pdfPrintOpts.bleedOffsetRight     = 9;
        pdfPrintOpts.offset               = 18;
        doc.saveAs(pdfPrintFile, pdfPrintOpts);
        log.push("PDF (print) saved → "+pdfPrintFile.fsName);
    } catch (printErr) {
        log.push("WARN: PDF (print) skipped — " + printErr.message + ". AI, web-PDF, and PNG were still exported.");
    }

    var pngOpts = new ExportOptionsPNG24();
    pngOpts.antiAliasing     = true;
    pngOpts.transparency     = false;
    pngOpts.artBoardClipping = true;
    doc.exportFile(pngFile, ExportType.PNG24, pngOpts);
    log.push("PNG exported → "+pngFile.fsName);

    log.push("");
    log.push(aiFile.exists       ? "PASS: AI file exists"        : "FAIL: AI file not found");
    log.push(pdfWebFile.exists   ? "PASS: PDF (web) exists"      : "FAIL: PDF (web) not found");
    log.push(pdfPrintFile.exists ? "PASS: PDF (print) exists"    : "FAIL: PDF (print) not found");
    log.push(pngFile.exists      ? "PASS: PNG file exists"       : "FAIL: PNG file not found");

} catch (err) {
    if (layerSnapshot.length>0) try { restoreLayers(layerSnapshot); } catch(e) {}
    log.push("");
    log.push("ERROR: "+err.message);
    throw err;
} finally {
    var logFile = new File(sharedRoot+"/outputs/logs/"+safeName+"_changelog.txt");
    writeLog(logFile, log);
    if (doc!==null) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(e) {} }
}
