// Removes the IMAGE_RESULTS group added in error from both master templates.
var engineRoot = /*__ENGINE_ROOT__*/;
var sharedRoot = /*__SHARED_ROOT__*/;

function writeLog(p, lines) { var f=new File(p); f.encoding="UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close(); }

function setLayerLocked(layer, locked) {
  try { layer.locked = locked; } catch(e) {}
  try { for (var i=0;i<layer.layers.length;i++) setLayerLocked(layer.layers[i], locked); } catch(e) {}
}

function findGroupNamed(container, name) {
  var items; try { items=container.pageItems; } catch(e) { return null; }
  for (var i=0;i<items.length;i++) {
    var tn; try { tn=items[i].typename; } catch(e) { continue; }
    var nm; try { nm=items[i].name; } catch(e) { nm=""; }
    if (tn==="GroupItem" && nm===name) return items[i];
    if (tn==="GroupItem"||tn==="Layer") { var f=findGroupNamed(items[i],name); if(f) return f; }
  }
  return null;
}

var templates = ["CASE_STUDY_LETTER_MASTER_v001", "CASE_STUDY_A4_MASTER_v001"];
var log = ["REMOVE IMAGE_RESULTS FROM TEMPLATES", "Date: "+new Date(), ""];

for (var t=0;t<templates.length;t++) {
  var tName = templates[t];
  log.push("=== "+tName+" ===");
  var tFile = new File(engineRoot+"/templates/"+tName+".ai");
  if (!tFile.exists) { log.push("  SKIP: not found"); log.push(""); continue; }
  var doc = null;
  try {
    doc = app.open(tFile);
    for (var l=0;l<doc.layers.length;l++) setLayerLocked(doc.layers[l], false);

    var grp = findGroupNamed(doc, "IMAGE_RESULTS");
    if (!grp) {
      log.push("  SKIP: IMAGE_RESULTS group not present.");
    } else {
      grp.remove();
      doc.save();
      log.push("  REMOVED IMAGE_RESULTS group and saved.");
    }
    doc.close(SaveOptions.DONOTSAVECHANGES); doc=null;
  } catch(err) {
    log.push("  ERROR: "+err.message);
    if (doc) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(e) {} doc=null; }
  }
  log.push("");
}

log.push("Done.");
var logDir=new Folder(sharedRoot+"/outputs/logs"); if(!logDir.exists) logDir.create();
writeLog(sharedRoot+"/outputs/logs/remove_image_results.txt", log);
