var job=/*__JOB_JSON__*/;
var engineRoot=/*__ENGINE_ROOT__*/;
var sharedRoot=/*__SHARED_ROOT__*/;

function writeLog(filePath,lines){var f=new File(filePath);f.encoding="UTF-8";f.open("w");f.write(lines.join("\n"));f.close();}

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
    if(!seen[n]){ seen[n]=true; unique.push(results[j]); }
  }
  return unique;
}

function hasTextFrame(frames, name) {
  for (var i=0;i<frames.length;i++) { try { if(frames[i].name===name) return true; } catch(e) {} }
  return false;
}

// ── Manifest helpers ───────────────────────────────────────────────────────────

/** Read required/optional ACTUAL frame names from the template's manifest.json.
 *  Applies frame_aliases so manifest keys are resolved to real AI frame names.
 *  Returns { required: [...], optional: [...] } or null if manifest not found/invalid. */
function readManifestFrameSets(templateId) {
  try {
    var manifestFile = new File(engineRoot + "/references/" + templateId + ".manifest.json");
    if (!manifestFile.exists) return null;
    manifestFile.encoding = "UTF-8";
    manifestFile.open("r");
    var raw = manifestFile.read();
    manifestFile.close();
    // Basic JSON parse using eval (safe — file is ours)
    var m = eval("(" + raw + ")");
    if (!m || !m.editable_objects || typeof m.editable_objects !== "object") return null;
    // Build alias map: manifest key → actual frame name (from frame_aliases, or key itself)
    var aliases = (m.frame_aliases && typeof m.frame_aliases === "object") ? m.frame_aliases : {};
    var req = [], opt = [];
    for (var k in m.editable_objects) {
      if (!m.editable_objects.hasOwnProperty(k)) continue;
      var def = m.editable_objects[k];
      if (!def || def.type !== "text") continue;
      // Resolve manifest key → actual frame name via aliases
      var frameName = aliases[k] || k;
      if (def.required === true) req.push(frameName);
      else opt.push(frameName);
    }
    return { required: req.length > 0 ? req : null, optional: opt };
  } catch(e) { return null; }
}

// ── Main ───────────────────────────────────────────────────────────────────────

var doc=null;
var layerSnapshot=[];
var templateName=job.template||"CASE_STUDY_LETTER_MASTER_v001";

// Derive required/optional from manifest; fall back to master-template defaults
var frameSets = readManifestFrameSets(templateName);
var required = (frameSets && frameSets.required) || ["TEXT_TITLE","TEXT_CHALLENGE","TEXT_SOLUTION","TEXT_RESULTS"];
var optional  = (frameSets && frameSets.optional)  || ["TEXT_OVERVIEW","TEXT_STAT_01","TEXT_STAT_02","TEXT_TESTIMONIAL"];
var log=["ILLUSTRATOR PREFLIGHT","Date: "+new Date(),"Template: "+templateName,""];

try {
    var templateFile=new File(engineRoot+"/templates/"+templateName+".ai");
    log.push("Path: "+templateFile.fsName);
    if(!templateFile.exists) throw new Error("Template file missing: "+templateFile.fsName);

    doc=app.open(templateFile);
    log.push("Opened successfully.");

    // Unlock all layers so deep search can enumerate grouped frames
    layerSnapshot = unlockAllLayers(doc);

    var allFrames=getAllTextFrames(doc);
    log.push("Text frames found (deep): "+allFrames.length);
    log.push("");

    // Dump every named frame — useful for diagnosing name mismatches
    log.push("--- All named text frames in template ---");
    for (var i=0;i<allFrames.length;i++) {
      var fn=""; try { fn=allFrames[i].name; } catch(e) {}
      if (fn) log.push("  FRAME: "+fn);
    }
    log.push("");

    // Dump all placed items and their names — critical for IMAGE_HERO / IMAGE_RESULTS replacement
    log.push("--- Placed images in template (doc.placedItems) ---");
    if (doc.placedItems.length===0) {
      log.push("  (none found)");
    } else {
      for (var p=0;p<doc.placedItems.length;p++) {
        var pn="", pf="";
        try { pn=doc.placedItems[p].name; } catch(e) {}
        try { pf=doc.placedItems[p].file ? doc.placedItems[p].file.name : "(embedded)"; } catch(e) { pf="(unknown)"; }
        log.push("  PLACED: name='"+pn+"'  file="+pf);
      }
    }
    log.push("");
    log.push("NOTE: For image replacement to work, each placed image must be named to match");
    log.push("      its manifest key (e.g. 'IMAGE_HERO'), OR placed inside a layer/group with that name.");
    log.push("");

    // Check required fields
    log.push("--- Required fields ---");
    var allPass=true;
    for(var r=0;r<required.length;r++){
        var found=hasTextFrame(allFrames,required[r]);
        log.push((found?"PASS: Found ":"FAIL: Missing ")+required[r]);
        if(!found) allPass=false;
    }
    log.push("");

    // Check optional fields
    log.push("--- Optional fields ---");
    for(var o=0;o<optional.length;o++){
        var found2=hasTextFrame(allFrames,optional[o]);
        log.push((found2?"PASS: Found ":"INFO: Not present ")+optional[o]);
    }
    log.push("");
    log.push(allPass?"RESULT: PASS — all required frames found":"RESULT: FAIL — one or more required frames missing. Check frame names above.");

    restoreLayers(layerSnapshot);
    layerSnapshot=[];
} catch(err) {
    if(layerSnapshot.length>0) try { restoreLayers(layerSnapshot); } catch(e) {}
    log.push("ERROR: "+err.message);
    log.push("RECOVERY: Check macOS permissions, Illustrator dialogs, template existence, and named text objects.");
    throw err;
} finally {
    var logFile=new File(sharedRoot+"/outputs/logs/illustrator_preflight_report.txt");
    writeLog(logFile,log);
    if(doc!==null){ try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(e) {} }
}
