// Inspection script: dumps full layer tree + page items with bounds
var engineRoot = /*__ENGINE_ROOT__*/;
var sharedRoot = /*__SHARED_ROOT__*/;

function writeLog(p, lines) { var f=new File(p); f.encoding="UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close(); }

function boundsStr(item) {
  try { var b=item.geometricBounds; return "x="+Math.round(b[0])+" y="+Math.round(b[1])+" r="+Math.round(b[2])+" bot="+Math.round(b[3]); } catch(e) { return "?"; }
}

function dumpContainer(container, indent, log) {
  var items; try { items=container.pageItems; } catch(e) { return; }
  for (var i=0;i<items.length;i++) {
    var item=items[i]; var tn; try { tn=item.typename; } catch(e) { continue; }
    var nm; try { nm=item.name||"(unnamed)"; } catch(e) { nm="(unnamed)"; }
    var vis; try { vis=item.hidden?"HIDDEN":"visible"; } catch(e) { vis="?"; }
    if (tn==="PlacedItem") {
      var fn; try { fn=item.file?item.file.name:"(embedded)"; } catch(e) { fn="?"; }
      log.push(indent+"PLACED  name='"+nm+"'  file="+fn+"  "+boundsStr(item)+"  ["+vis+"]");
    } else if (tn==="TextFrame") {
      log.push(indent+"TEXT    name='"+nm+"'  "+boundsStr(item));
    } else if (tn==="GroupItem") {
      log.push(indent+"GROUP   name='"+nm+"'  "+boundsStr(item)+"  ["+vis+"]");
      dumpContainer(item, indent+"  ", log);
    } else {
      log.push(indent+tn+"  name='"+nm+"'  "+boundsStr(item)+"  ["+vis+"]");
    }
  }
}

var log = ["TEMPLATE INSPECTION","Date: "+new Date(),""];
var templates = ["CASE_STUDY_LETTER_MASTER_v001","CASE_STUDY_A4_MASTER_v001"];

for (var t=0;t<templates.length;t++) {
  var tName=templates[t];
  var tFile=new File(engineRoot+"/templates/"+tName+".ai");
  log.push("=== "+tName+" ===");
  if (!tFile.exists) { log.push("  NOT FOUND"); continue; }
  var doc=null;
  try {
    doc=app.open(tFile);
    var ab=doc.artboards[0].artboardRect;
    log.push("  Artboard: x="+Math.round(ab[0])+" y="+Math.round(ab[1])+" r="+Math.round(ab[2])+" bot="+Math.round(ab[3]));
    log.push("  Layers ("+doc.layers.length+"):");
    for (var l=0;l<doc.layers.length;l++) {
      var layer=doc.layers[l];
      var lv; try { lv=layer.visible?"visible":"HIDDEN"; } catch(e) { lv="?"; }
      var lk; try { lk=layer.locked?"LOCKED":"unlocked"; } catch(e) { lk="?"; }
      log.push("  LAYER '"+layer.name+"' ["+lv+"/"+lk+"]");
      dumpContainer(layer, "    ", log);
    }
    doc.close(SaveOptions.DONOTSAVECHANGES); doc=null;
  } catch(err) {
    log.push("  ERROR: "+err.message);
    if (doc) { try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(e) {} }
  }
  log.push("");
}

var logDir=new Folder(sharedRoot+"/outputs/logs"); if(!logDir.exists) logDir.create();
writeLog(sharedRoot+"/outputs/logs/template_inspection.txt", log);
