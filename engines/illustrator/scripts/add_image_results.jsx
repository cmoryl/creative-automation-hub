// Adds IMAGE_RESULTS placed item to both master templates.
// Duplicates the IMAGE_HERO group, renames it, repositions it to the top of the results panel.
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
    if ((tn==="GroupItem") && nm===name) return items[i];
    if (tn==="GroupItem"||tn==="Layer") {
      var found=findGroupNamed(items[i], name);
      if (found) return found;
    }
  }
  return null;
}

function findLayerNamed(doc, name) {
  for (var l=0;l<doc.layers.length;l++) {
    if (doc.layers[l].name===name) return doc.layers[l];
  }
  return null;
}

// Per-template config: where to place IMAGE_RESULTS
// Coordinates derived from template inspection:
//   LETTER artboard: 678,0 → 1290,-792. Results panel: left=998 top=-249 r=1267 bot=-716
//   A4     artboard: 0,1100 → 850,0.   Results panel: left=444 top=763  r=825  bot=101
var CONFIGS = [
  {
    name: "CASE_STUDY_LETTER_MASTER_v001",
    layer: "02_IMAGES",
    // Fill the top of the results panel (full width, 140pt tall)
    left: 998, top: -249, width: 269, height: 140
  },
  {
    name: "CASE_STUDY_A4_MASTER_v001",
    layer: null,  // single layer doc — place in same layer as IMAGE_HERO
    left: 444, top: 763, width: 381, height: 140
  }
];

var log = ["ADD IMAGE_RESULTS TO TEMPLATES", "Date: "+new Date(), ""];

for (var t=0;t<CONFIGS.length;t++) {
  var cfg = CONFIGS[t];
  log.push("=== "+cfg.name+" ===");

  var tFile = new File(engineRoot+"/templates/"+cfg.name+".ai");
  if (!tFile.exists) { log.push("  SKIP: file not found"); log.push(""); continue; }

  var doc = null;
  try {
    doc = app.open(tFile);

    // Unlock everything
    for (var l=0;l<doc.layers.length;l++) setLayerLocked(doc.layers[l], false);

    // Check IMAGE_RESULTS doesn't already exist
    var existing = findGroupNamed(doc, "IMAGE_RESULTS");
    if (existing) {
      log.push("  SKIP: IMAGE_RESULTS group already exists at x="+Math.round(existing.left)+" y="+Math.round(existing.top));
      doc.close(SaveOptions.DONOTSAVECHANGES); doc=null;
      log.push(""); continue;
    }

    // Find the IMAGE_HERO group to duplicate
    var heroGroup = findGroupNamed(doc, "IMAGE_HERO");
    if (!heroGroup) {
      log.push("  ERROR: IMAGE_HERO group not found — run rename_placed_items first");
      doc.close(SaveOptions.DONOTSAVECHANGES); doc=null;
      log.push(""); continue;
    }

    log.push("  Found IMAGE_HERO at x="+Math.round(heroGroup.left)+" y="+Math.round(heroGroup.top)+" w="+Math.round(heroGroup.width)+" h="+Math.round(heroGroup.height));

    // Duplicate the group
    var resultsGroup = heroGroup.duplicate();
    resultsGroup.name = "IMAGE_RESULTS";
    log.push("  Duplicated IMAGE_HERO → IMAGE_RESULTS");

    // Rename the PlacedItem inside the duplicated group
    var renamedPlaced = false;
    for (var i=0;i<resultsGroup.pageItems.length;i++) {
      try {
        if (resultsGroup.pageItems[i].typename==="PlacedItem") {
          resultsGroup.pageItems[i].name = "IMAGE_RESULTS";
          renamedPlaced = true;
          log.push("  Renamed inner PlacedItem to IMAGE_RESULTS");
          break;
        }
      } catch(e) {}
    }
    if (!renamedPlaced) log.push("  WARN: Could not find PlacedItem inside duplicated group");

    // Reposition and resize to the results panel area
    try {
      resultsGroup.left   = cfg.left;
      resultsGroup.top    = cfg.top;
      resultsGroup.width  = cfg.width;
      resultsGroup.height = cfg.height;
      log.push("  Positioned: left="+cfg.left+" top="+cfg.top+" w="+cfg.width+" h="+cfg.height);
    } catch(posErr) {
      log.push("  WARN: Could not reposition group — "+posErr.message);
    }

    // Move the group to the correct layer if specified
    if (cfg.layer) {
      var targetLayer = findLayerNamed(doc, cfg.layer);
      if (targetLayer) {
        try {
          resultsGroup.move(targetLayer, ElementPlacement.PLACEATBEGINNING);
          log.push("  Moved to layer '"+cfg.layer+"'");
        } catch(mvErr) {
          log.push("  WARN: Could not move to layer '"+cfg.layer+"': "+mvErr.message);
        }
      } else {
        log.push("  WARN: Target layer '"+cfg.layer+"' not found, left in current position");
      }
    }

    doc.save();
    log.push("  SAVED.");

    doc.close(SaveOptions.DONOTSAVECHANGES); doc=null;

  } catch(err) {
    log.push("  ERROR: "+err.message);
    if (doc) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(e) {} doc=null; }
  }
  log.push("");
}

log.push("Done.");
var logDir=new Folder(sharedRoot+"/outputs/logs"); if(!logDir.exists) logDir.create();
writeLog(sharedRoot+"/outputs/logs/add_image_results.txt", log);
