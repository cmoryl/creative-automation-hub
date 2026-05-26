// One-shot script: rename placed items in all master templates to match manifest keys.
// Run via the normal AppleScript bridge. Logs results to outputs/logs/rename_placed_items.txt
var engineRoot = /*__ENGINE_ROOT__*/;
var sharedRoot = /*__SHARED_ROOT__*/;

function writeLog(filePath, lines) {
  var f = new File(filePath);
  f.encoding = "UTF-8";
  f.open("w");
  f.write(lines.join("\n"));
  f.close();
}

function setLayerLocked(layer, locked) {
  try { layer.locked = locked; } catch(e) {}
  try { for (var i=0;i<layer.layers.length;i++) setLayerLocked(layer.layers[i], locked); } catch(e) {}
}

function unlockAll(doc) {
  for (var l=0;l<doc.layers.length;l++) setLayerLocked(doc.layers[l], false);
}

// Collect ALL placed items recursively through layers and groups
function collectPlacedItems(container, results) {
  var items; try { items = container.pageItems; } catch(e) { return; }
  for (var i=0;i<items.length;i++) {
    var item=items[i];
    var tn; try { tn=item.typename; } catch(e) { continue; }
    if (tn==="PlacedItem") results.push(item);
    else if (tn==="GroupItem"||tn==="Layer") collectPlacedItems(item, results);
  }
}

function getAllPlacedItems(doc) {
  var results = [];
  // doc.placedItems is document-wide but may miss items inside locked layers
  for (var l=0;l<doc.layers.length;l++) collectPlacedItems(doc.layers[l], results);
  // Deduplicate by object reference isn't easy in ExtendScript, so also sweep doc.placedItems
  var seen = {};
  var unique = [];
  for (var i=0;i<results.length;i++) {
    var n; try { n=results[i].name+"_"+results[i].geometricBounds[1]; } catch(e) { n=i; }
    if (!seen[n]) { seen[n]=true; unique.push(results[i]); }
  }
  return unique;
}

var TEMPLATES = [
  "CASE_STUDY_LETTER_MASTER_v001",
  "CASE_STUDY_A4_MASTER_v001"
];

// Desired rename map: keys are what we WANT names to be.
// Assignment: sort placed items top-to-bottom (by geometricBounds[1] descending — Illustrator Y is top-down),
// first = IMAGE_HERO, second = IMAGE_RESULTS.
var TARGET_KEYS = ["IMAGE_HERO", "IMAGE_RESULTS"];

var log = ["RENAME PLACED ITEMS", "Date: "+new Date(), ""];

for (var t=0;t<TEMPLATES.length;t++) {
  var templateName = TEMPLATES[t];
  var templateFile = new File(engineRoot+"/templates/"+templateName+".ai");
  log.push("=== "+templateName+" ===");

  if (!templateFile.exists) {
    log.push("  SKIP: file not found at "+templateFile.fsName);
    log.push("");
    continue;
  }

  var doc = null;
  try {
    doc = app.open(templateFile);
    unlockAll(doc);

    var allPlaced = getAllPlacedItems(doc);
    log.push("  PlacedItems found: "+allPlaced.length);

    if (allPlaced.length === 0) {
      log.push("  WARN: No placed items found — hero background may be embedded or a native shape.");
      log.push("        To fix: in Illustrator, File > Place the hero image as a linked file,");
      log.push("        then name it IMAGE_HERO in the Layers panel.");
      log.push("");
      doc.close(SaveOptions.DONOTSAVECHANGES);
      doc = null;
      continue;
    }

    // Log existing names and positions before renaming
    log.push("  Before rename:");
    for (var p=0;p<allPlaced.length;p++) {
      var pn=""; try { pn=allPlaced[p].name; } catch(e) {}
      var py=0; try { py=allPlaced[p].geometricBounds[1]; } catch(e) {}
      var pf=""; try { pf=allPlaced[p].file?allPlaced[p].file.name:"(embedded)"; } catch(e) {}
      log.push("    ["+p+"] name='"+pn+"'  y="+Math.round(py)+"  file="+pf);
    }

    // Skip renaming any items that already have a TARGET_KEY name (already fixed)
    var alreadyNamed = {};
    for (var p=0;p<allPlaced.length;p++) {
      var pn2; try { pn2=allPlaced[p].name; } catch(e) { pn2=""; }
      for (var k=0;k<TARGET_KEYS.length;k++) {
        if (pn2===TARGET_KEYS[k]) alreadyNamed[TARGET_KEYS[k]]=true;
      }
    }

    // Sort by Y position descending (topmost item has the highest Y value in Illustrator's coordinate system)
    var toRename = [];
    for (var p=0;p<allPlaced.length;p++) {
      var pn3; try { pn3=allPlaced[p].name; } catch(e) { pn3=""; }
      // Skip items that already have the right name
      var skip=false;
      for (var k=0;k<TARGET_KEYS.length;k++) { if (pn3===TARGET_KEYS[k]) { skip=true; break; } }
      if (!skip) toRename.push(allPlaced[p]);
    }

    // Sort top-to-bottom: in Illustrator, geometricBounds[1] is the TOP edge in pts from bottom of artboard
    // Higher value = higher on the page
    toRename.sort(function(a,b) {
      var ay=0,by=0;
      try { ay=a.geometricBounds[1]; } catch(e) {}
      try { by=b.geometricBounds[1]; } catch(e) {}
      return by-ay; // descending: topmost first
    });

    var renamedCount = 0;
    for (var k=0;k<TARGET_KEYS.length;k++) {
      if (alreadyNamed[TARGET_KEYS[k]]) {
        log.push("  SKIP: '"+TARGET_KEYS[k]+"' already correctly named.");
        continue;
      }
      if (k < toRename.length) {
        var oldName; try { oldName=toRename[k].name; } catch(e) { oldName="(unnamed)"; }
        try {
          toRename[k].locked = false;
          toRename[k].name = TARGET_KEYS[k];
          log.push("  RENAMED: '"+oldName+"' → '"+TARGET_KEYS[k]+"'");
          renamedCount++;
        } catch(renErr) {
          log.push("  ERROR renaming '"+oldName+"': "+renErr.message);
        }
      } else {
        log.push("  WARN: Not enough placed items to assign '"+TARGET_KEYS[k]+"' (only "+toRename.length+" un-named items)");
      }
    }

    if (renamedCount > 0) {
      doc.save();
      log.push("  SAVED: "+renamedCount+" item(s) renamed and template saved.");
    } else {
      log.push("  NO CHANGES: all target keys already assigned.");
      doc.close(SaveOptions.DONOTSAVECHANGES);
      doc = null;
      log.push("");
      continue;
    }

    // Log final state
    var finalPlaced = getAllPlacedItems(doc);
    log.push("  After rename:");
    for (var p=0;p<finalPlaced.length;p++) {
      var fn=""; try { fn=finalPlaced[p].name; } catch(e) {}
      var ff=""; try { ff=finalPlaced[p].file?finalPlaced[p].file.name:"(embedded)"; } catch(e) {}
      log.push("    ["+p+"] name='"+fn+"'  file="+ff);
    }

    doc.close(SaveOptions.DONOTSAVECHANGES);
    doc = null;

  } catch(err) {
    log.push("  ERROR: "+err.message);
    if (doc) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(e) {} doc=null; }
  }
  log.push("");
}

log.push("Done.");

var logDir = new Folder(sharedRoot+"/outputs/logs");
if (!logDir.exists) logDir.create();
writeLog(new File(sharedRoot+"/outputs/logs/rename_placed_items.txt"), log);
