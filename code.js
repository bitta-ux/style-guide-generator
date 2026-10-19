// Style Guide Generator by Bitta.ux — v4.1

figma.showUI(__html__, { width: 380, height: 620, title: 'Style Guide Generator' });

var WRAP_W = 1312;
var WRAP_PAD = 32;
var WRAP_GAP = 40;
var CONTENT_W = WRAP_W - WRAP_PAD * 2; // 1248

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'scan') await doScan();
  if (msg.type === 'generate') await doGenerate(msg.selected);
};

// ─── SCAN ─────────────────────────────────────────────────────────────────────
async function doScan() {
  try {
    if (!figma.variables) {
      figma.ui.postMessage({ type: 'error', message: 'Variables API not available. Use Figma Desktop.' });
      return;
    }
    var vars = await figma.variables.getLocalVariablesAsync();
    var styles = await figma.getLocalTextStylesAsync();
    var colorVars = vars.filter(function(v){ return v.resolvedType === 'COLOR'; });
    var floatVars = vars.filter(function(v){ return v.resolvedType === 'FLOAT'; });

    var groups = {};
    colorVars.forEach(function(v){
      var parts = v.name.split('/');
      var g = parts.length > 1 ? parts.slice(0,-1).join('/') : 'Colors';
      groups[g] = true;
    });

    var floatGroups = {};
    floatVars.forEach(function(v) {
      var parts = v.name.split('/');
      floatGroups[parts[0]] = true;
    });

    figma.ui.postMessage({ type: 'scan-result', data: {
      colorCount: colorVars.length,
      colorGroupCount: Object.keys(groups).length,
      spacingCount: floatVars.length,
      spacingGroupCount: Object.keys(floatGroups).length,
      textStyleCount: styles.length,
    }});
  } catch(e) {
    figma.ui.postMessage({ type: 'error', message: (e && e.message) ? e.message : String(e) });
  }
}

// ─── GENERATE ─────────────────────────────────────────────────────────────────
async function doGenerate(selected) {
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    prog(5, 'Fonts loaded');

    var vars = figma.variables ? await figma.variables.getLocalVariablesAsync() : [];
    var styles = await figma.getLocalTextStylesAsync();
    var collections = figma.variables ? await figma.variables.getLocalVariableCollectionsAsync() : [];
    var colorVars = vars.filter(function(v){ return v.resolvedType === 'COLOR'; });
    var floatVars = vars.filter(function(v){ return v.resolvedType === 'FLOAT'; });

    // dynamic-page: work within the current page only
    var page = figma.currentPage;
    // Remove only frames this plugin generated: tagged via plugin data, or
    // the exact legacy names from versions that predate tagging.
    var existing = page.children.filter(isGeneratedFrame);
    existing.forEach(function(n) { n.remove(); });

    var cx = 80;

    if (selected.colors && colorVars.length > 0) {
      prog(15, 'Building colors...');
      var cf = await buildColors(colorVars, collections);
      tagGenerated(cf);
      cf.x = cx; cf.y = 80;
      page.appendChild(cf);
      cx += cf.width + 120;
      prog(50, 'Colors done');
    }

    if (selected.typography && styles.length > 0) {
      prog(55, 'Building typography...');
      var tf = await buildTypography(styles);
      tagGenerated(tf);
      tf.x = cx; tf.y = 80;
      page.appendChild(tf);
      cx += tf.width + 120;
      prog(87, 'Typography done');
    }

    if (selected.sizing && floatVars.length > 0) {
      prog(90, 'Building sizing & spacing...');
      var sf = await buildSizing(floatVars, collections);
      tagGenerated(sf);
      sf.x = cx; sf.y = 80;
      page.appendChild(sf);
      cx += sf.width + 120;
      prog(97, 'Sizing done');
    }

    if (page.children.length > 0) figma.viewport.scrollAndZoomIntoView(page.children);
    figma.ui.postMessage({ type: 'complete' });

  } catch(e) {
    figma.ui.postMessage({ type: 'error', message: (e && e.message) ? e.message : String(e) });
  }
}

function prog(pct, label) { figma.ui.postMessage({ type: 'progress', pct: pct, label: label }); }

var PLUGIN_DATA_KEY = 'styleGuideGenerator';
var LEGACY_FRAME_NAMES = ['//PRIMITIVE COLORS', '//TYPOGRAPHY', '//SIZING & SPACING'];

function tagGenerated(node) {
  try { node.setPluginData(PLUGIN_DATA_KEY, 'generated'); } catch(e) {}
}

function isGeneratedFrame(node) {
  try { if (node.getPluginData(PLUGIN_DATA_KEY) === 'generated') return true; } catch(e) {}
  return LEGACY_FRAME_NAMES.indexOf(node.name) !== -1;
}

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────

function fr(name, x, y, w, h, bg, radius) {
  var f = figma.createFrame();
  f.name = name; f.x = x; f.y = y; f.resize(w, h);
  f.fills = bg ? [{ type:'SOLID', color: { r:bg.r, g:bg.g, b:bg.b } }] : [];
  if (radius) f.cornerRadius = radius;
  f.clipsContent = false;
  return f;
}

function rc(name, x, y, w, h, color, radius) {
  var r = figma.createRectangle();
  r.name = name; r.x = x; r.y = y; r.resize(w, h);
  r.fills = color ? [{ type:'SOLID', color: { r:color.r, g:color.g, b:color.b } }] : [];
  if (radius) r.cornerRadius = radius;
  return r;
}

// Bind a color variable to a frame/shape fill
function bindFill(node, variable, fallbackColor) {
  var c = fallbackColor || {r:0,g:0,b:0};
  var paint = { type: 'SOLID', color: { r:c.r, g:c.g, b:c.b } };
  if (typeof c.a === 'number' && c.a < 1) paint.opacity = c.a;
  try {
    var bound = figma.variables.setBoundVariableForPaint(paint, 'color', variable);
    node.fills = [bound];
  } catch(e) {
    node.fills = [paint];
  }
}

async function tx(str, x, y, size, font, color, maxW) {
  var t = figma.createText();
  try { await figma.loadFontAsync(font); }
  catch(e) { font = {family:'Inter',style:'Regular'}; try { await figma.loadFontAsync(font); } catch(e2){} }
  t.fontName = font; t.fontSize = size;
  t.characters = String(str);
  t.fills = [{ type:'SOLID', color: color }];
  if (maxW) { t.textAutoResize = 'HEIGHT'; t.resize(maxW, 50); }
  else { t.textAutoResize = 'WIDTH_AND_HEIGHT'; }
  t.x = x; t.y = y;
  return t;
}

// 6-digit hex, or 8-digit (RRGGBBAA) when the color is translucent
function hexOf(r,g,b,a) {
  function h(v){ return Math.round(v*255).toString(16).padStart(2,'0'); }
  var hex = '#'+h(r)+h(g)+h(b);
  if (typeof a === 'number' && a < 1) hex += h(a);
  return hex.toUpperCase();
}

// Numeric shade names sort ascending and come first; everything else sorts alphabetically after
function compareShades(a, b) {
  var na = /^\d+(\.\d+)?$/.test(a), nb = /^\d+(\.\d+)?$/.test(b);
  if (na && nb) return parseFloat(a) - parseFloat(b);
  if (na) return -1;
  if (nb) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function lum(r,g,b){ return 0.2126*r + 0.7152*g + 0.0722*b; }

function addStroke(f, color, weight) {
  f.strokes = [{ type:'SOLID', color: color }];
  f.strokeWeight = weight || 1;
  f.strokeAlign = 'INSIDE';
}

// ─── HERO ─────────────────────────────────────────────────────────────────────
async function buildHero(title, w) {
  var H = 320;
  var f = fr('Hero', 0, 0, w, H, {r:0.93,g:0.93,b:0.93}, 24);
  f.clipsContent = true;
  var g = figma.createRectangle();
  g.name = 'Gradient'; g.x=0; g.y=0; g.resize(w, H);
  g.fills = [{ type:'GRADIENT_LINEAR',
    gradientTransform: [[1,0,0],[0,1,0]],
    gradientStops: [
      {position:0,   color:{r:0.83,g:0.91,b:0.99,a:1}},
      {position:0.35,color:{r:0.95,g:0.86,b:0.97,a:1}},
      {position:0.65,color:{r:0.99,g:0.94,b:0.84,a:1}},
      {position:1,   color:{r:0.84,g:0.96,b:0.91,a:1}},
    ]
  }];
  f.appendChild(g);
  var t = await tx('//' + title.toUpperCase(), 0, 0, 52, {family:'Inter',style:'Bold'}, {r:0.79,g:0.02,b:0.08}, w-80);
  t.x = Math.round((w - t.width) / 2);
  t.y = Math.round((H - t.height) / 2);
  f.appendChild(t);
  return f;
}

// ═════════════════════════════════════════════════════════════════════════════
// COLORS
// ═════════════════════════════════════════════════════════════════════════════
async function buildColors(colorVars, collections) {
  var SWATCH_COLOR_H = 96, SWATCH_LABEL_H = 60, SWATCH_H = SWATCH_COLOR_H + SWATCH_LABEL_H;
  var BADGE_H = 39;
  var INNER_PAD = 20, INNER_GAP = 12, STRIP_GAP = 12;
  var CARD_PAD = 16;

  // Group variables: collectionId+groupName → { collection, modes[], shades[] }
  // Each shade stores its value per mode
  var groups = {};

  for (var ci = 0; ci < colorVars.length; ci++) {
    var v = colorVars[ci];
    var col = collections.find(function(c){ return c.id === v.variableCollectionId; });
    if (!col) continue;
    var parts = v.name.split('/');
    var shade = parts[parts.length - 1];
    var groupName = parts.length > 1 ? parts.slice(0, -1).join('/') : 'Colors';
    var key = col.id + '||' + groupName;

    if (!groups[key]) {
      groups[key] = {
        name: groupName,
        collection: col,
        shades: []
      };
    }

    // Build per-mode color values
    var modeValues = [];
    for (var mi0 = 0; mi0 < col.modes.length; mi0++) {
      var mode0 = col.modes[mi0];
      var val = v.valuesByMode[mode0.modeId];
      var resolved = await resolveColorValue(val, collections, mode0.modeId);
      modeValues.push({
        modeId: mode0.modeId,
        modeName: mode0.name,
        color: resolved || { r:0.8, g:0.8, b:0.8, a:1 }
      });
    }

    groups[key].shades.push({
      shade: shade,
      variable: v,
      modeValues: modeValues
    });
  }

  // Sort shades: numeric names ascending first (50, 100, 200…), then the rest alphabetically
  Object.values(groups).forEach(function(g) {
    g.shades.sort(function(a, b) { return compareShades(a.shade, b.shade); });
  });

  var groupList = Object.values(groups);

  // Each card has: badge + one strip per mode
  // Card inner height depends on number of modes
  function getCardInnerH(numModes) {
    var labelSpace = numModes > 1 ? numModes * 22 : 0; // 22px per mode label
    return INNER_PAD + BADGE_H + INNER_GAP + labelSpace + numModes * SWATCH_H + (numModes - 1) * STRIP_GAP + INNER_PAD;
  }

  // Calculate total wrapper height
  var totalH = WRAP_PAD + 320 + WRAP_GAP;
  groupList.forEach(function(g) {
    var numModes = g.collection.modes.length;
    totalH += CARD_PAD * 2 + getCardInnerH(numModes) + 16;
  });
  totalH += WRAP_PAD;

  var wrap = fr('//PRIMITIVE COLORS', 0, 0, WRAP_W, totalH, {r:1,g:1,b:1}, 32);
  addStroke(wrap, {r:0.86,g:0.85,b:0.86}, 1);
  wrap.clipsContent = true;

  var hero = await buildHero('Primitive Colors', CONTENT_W);
  hero.x = WRAP_PAD; hero.y = WRAP_PAD;
  wrap.appendChild(hero);

  var cardY = WRAP_PAD + 320 + WRAP_GAP;

  for (var gi = 0; gi < groupList.length; gi++) {
    var g = groupList[gi];
    var shades = g.shades;
    var modes = g.collection.modes;
    var numModes = modes.length;
    var count = shades.length;

    var innerW = CONTENT_W - CARD_PAD * 2;
    var availW = innerW - INNER_PAD * 2;
    var swatchW = count > 0 ? Math.floor(availW / count) : 80;
    var stripW = swatchW * count;

    // Use default mode mid color for badge/tint
    var defaultModeId = g.collection.defaultModeId;
    var mid = shades[Math.floor(shades.length / 2)] || shades[0];
    var midModeVal = mid ? mid.modeValues.find(function(mv){ return mv.modeId === defaultModeId; }) : null;
    var mc = midModeVal ? midModeVal.color : { r:0.5, g:0.5, b:0.5 };
    var tint = { r:mc.r+(1-mc.r)*0.88, g:mc.g+(1-mc.g)*0.88, b:mc.b+(1-mc.b)*0.88 };

    var INNER_H = getCardInnerH(numModes);
    var CARD_H = CARD_PAD * 2 + INNER_H;

    var card = fr('Group: ' + g.name, WRAP_PAD, cardY, CONTENT_W, CARD_H, tint, 24);
    var inner = fr('Inner', CARD_PAD, CARD_PAD, innerW, INNER_H, {r:1,g:1,b:1}, 20);
    card.appendChild(inner);

    // Badge
    var badgeTxt = await tx(
      g.name.split('/').pop().toUpperCase(),
      0, 0, 12, {family:'Inter', style:'Semi Bold'},
      lum(mc.r, mc.g, mc.b) > 0.35 ? {r:0.1,g:0.1,b:0.1} : {r:1,g:1,b:1}
    );
    var bW = badgeTxt.width + 24;
    var badge = fr('Badge', INNER_PAD, INNER_PAD, bW, BADGE_H, mc, 24);
    bindFill(badge, mid.variable, mc);
    addStroke(badge, {r:Math.max(0,mc.r-0.15),g:Math.max(0,mc.g-0.15),b:Math.max(0,mc.b-0.15)}, 1);
    badgeTxt.x = 12;
    badgeTxt.y = Math.round((BADGE_H - badgeTxt.height) / 2);
    badge.appendChild(badgeTxt);
    inner.appendChild(badge);

    // One strip per mode
    var stripY = INNER_PAD + BADGE_H + INNER_GAP + (numModes > 1 ? 22 : 0);

    for (var mi = 0; mi < numModes; mi++) {
      var mode = modes[mi];
      var isDark = mode.name.toLowerCase().indexOf('dark') !== -1;

      // For dark mode, reverse the shade order visually
      var displayShades = isDark ? shades.slice().reverse() : shades;

      // Mode label (only if more than one mode)
      if (numModes > 1) {
        var modeLabel = await tx(
          mode.name,
          INNER_PAD, stripY - 18,
          10, {family:'Inter', style:'Regular'},
          {r:0.6, g:0.6, b:0.6}
        );
        inner.appendChild(modeLabel);
      }

      var strip = fr('Strip: ' + mode.name, INNER_PAD, stripY, stripW, SWATCH_H, null, 8);
      strip.clipsContent = true;
      addStroke(strip, {r:0.84,g:0.83,b:0.83}, 1);

      for (var si = 0; si < displayShades.length; si++) {
        var s = displayShades[si];
        var sx = si * swatchW;
        var modeVal = s.modeValues.find(function(mv){ return mv.modeId === mode.modeId; });
        var swatchColor = modeVal ? modeVal.color : {r:0.8,g:0.8,b:0.8};

        // Color rect — bound to variable (Figma will use current mode's value at runtime)
        var colorRect = rc('fill', sx, 0, swatchW, SWATCH_COLOR_H, swatchColor, 0);
        bindFill(colorRect, s.variable, swatchColor);
        strip.appendChild(colorRect);

        // Label bg
        strip.appendChild(rc('label-bg', sx, SWATCH_COLOR_H, swatchW, SWATCH_LABEL_H, {r:1,g:1,b:1}, 0));

        // Shade label
        var shadeTxt = await tx(
          s.shade,
          sx + 8, SWATCH_COLOR_H + 8,
          11, {family:'Inter', style:'Medium'},
          {r:0.15, g:0.15, b:0.14}
        );
        strip.appendChild(shadeTxt);

        // Hex value for this specific mode
        var hexTxt = await tx(
          hexOf(swatchColor.r, swatchColor.g, swatchColor.b, swatchColor.a),
          sx + 8, SWATCH_COLOR_H + 24,
          10, {family:'Inter', style:'Regular'},
          {r:0.32, g:0.32, b:0.32}
        );
        strip.appendChild(hexTxt);
      }

      inner.appendChild(strip);
      stripY += SWATCH_H + STRIP_GAP + (numModes > 1 ? 22 : 0);
    }

    wrap.appendChild(card);
    cardY += CARD_H + 16;
  }

  wrap.resize(WRAP_W, cardY + WRAP_PAD);
  return wrap;
}

// Recursively resolve a color variable value for a specific mode
// Uses getVariableByIdAsync — the sync variant is unavailable under "dynamic-page" document access.
async function resolveColorValue(val, collections, modeId, depth) {
  depth = depth || 0;
  if (!val || depth > 20) return null;
  if (typeof val === 'object' && 'r' in val) {
    return { r:val.r, g:val.g, b:val.b, a: (typeof val.a === 'number' ? val.a : 1) };
  }
  if (val.type === 'VARIABLE_ALIAS') {
    try {
      var aliasVar = await figma.variables.getVariableByIdAsync(val.id);
      if (!aliasVar) return null;
      var aliasColl = collections.find(function(c){ return c.id === aliasVar.variableCollectionId; });
      // Use the passed modeId if this collection has it, otherwise fall back to default
      var resolvedModeId = modeId;
      if (aliasColl) {
        var modeExists = aliasColl.modes.some(function(m){ return m.modeId === modeId; });
        if (!modeExists) resolvedModeId = aliasColl.defaultModeId;
      }
      return await resolveColorValue(aliasVar.valuesByMode[resolvedModeId], collections, resolvedModeId, depth + 1);
    } catch(e) { return null; }
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// TYPOGRAPHY
// ═════════════════════════════════════════════════════════════════════════════
async function buildTypography(textStyles) {

  // ── Outer wrapper: vertical autolayout, hugs height ──────────────────────
  var wrap = figma.createFrame();
  wrap.name = '//TYPOGRAPHY';
  wrap.layoutMode = 'VERTICAL';
  wrap.primaryAxisSizingMode = 'AUTO';        // hugs height
  wrap.counterAxisSizingMode = 'FIXED';
  wrap.resize(WRAP_W, 100);
  wrap.paddingTop = WRAP_PAD;
  wrap.paddingBottom = WRAP_PAD;
  wrap.paddingLeft = WRAP_PAD;
  wrap.paddingRight = WRAP_PAD;
  wrap.itemSpacing = WRAP_GAP;
  wrap.fills = [{ type:'SOLID', color:{r:1,g:1,b:1} }];
  wrap.cornerRadius = 32;
  wrap.clipsContent = false;
  addStroke(wrap, {r:0.86,g:0.85,b:0.86}, 1);

  // Hero — fixed width, add to wrapper
  var hero = await buildHero('Typography', CONTENT_W);
  wrap.appendChild(hero);

  // ── One card per text style ───────────────────────────────────────────────
  for (var i = 0; i < textStyles.length; i++) {
    var style = textStyles[i];
    var capSize = Math.min(style.fontSize, 56);

    // Card: vertical autolayout, hugs height, full content width
    var card = figma.createFrame();
    card.name = 'Style: ' + style.name;
    card.layoutMode = 'VERTICAL';
    card.primaryAxisSizingMode = 'AUTO';
    card.counterAxisSizingMode = 'FIXED';
    card.resize(CONTENT_W, 100);
    card.paddingTop = 20;
    card.paddingBottom = 20;
    card.paddingLeft = 20;
    card.paddingRight = 20;
    card.itemSpacing = 16;
    card.fills = [{ type:'SOLID', color:{r:1,g:1,b:1} }];
    card.cornerRadius = 20;
    card.clipsContent = false;
    addStroke(card, {r:0.86,g:0.86,b:0.86}, 1);
    // Make card stretch to fill wrapper width
    card.layoutAlign = 'STRETCH';

    // ── Style name label ────────────────────────────────────────────────────
    var nameTxt = figma.createText();
    nameTxt.name = 'StyleName';
    nameTxt.fontName = { family:'Inter', style:'Medium' };
    nameTxt.fontSize = 13;
    nameTxt.characters = style.name;
    nameTxt.fills = [{ type:'SOLID', color:{r:0.64,g:0.64,b:0.64} }];
    nameTxt.textAutoResize = 'WIDTH_AND_HEIGHT';
    nameTxt.layoutAlign = 'STRETCH';
    card.appendChild(nameTxt);

    // ── Specimen text ───────────────────────────────────────────────────────
    // Correct linking order required by Figma API:
    // 1. Load font so the node can accept characters
    // 2. Append node to document tree (textStyleId is rejected off-tree)
    // 3. Set textStyleId — Figma applies font/size/lh/ls from the style
    // 4. Set characters AFTER style is applied so they inherit the style's font
    // 5. Apply overrides (fontSize cap, fills, layout) last
    var specimen = figma.createText();
    specimen.name = 'Specimen';

    // Pre-load style font so Figma can accept the style assignment
    var specFont = style.fontName;
    try {
      await figma.loadFontAsync(specFont);
    } catch(e) {
      specFont = { family:'Inter', style:'Regular' };
      try { await figma.loadFontAsync(specFont); } catch(e2) {}
    }

    // Must be in the tree before textStyleId is accepted
    card.appendChild(specimen);

    // Apply the text style link — sets font, size, line-height, letter-spacing
    var styleLinked = false;
    try {
      specimen.textStyleId = style.id;
      styleLinked = true;
    } catch(e) {
      // Cross-file style or other edge case — fall back to manual font properties
      specimen.fontName = specFont;
      specimen.fontSize = capSize;
    }

    // Set characters AFTER style is applied so they use the style's font
    specimen.characters = 'The quick brown fox jumps over the lazy dog';

    // Apply overrides after characters are set
    if (styleLinked && style.fontSize > 56) {
      specimen.fontSize = capSize; // cap very large sizes while keeping the style link
    }
    specimen.fills = [{ type:'SOLID', color:{r:0.15,g:0.15,b:0.14} }];
    specimen.textAutoResize = 'HEIGHT';
    specimen.layoutAlign = 'STRETCH';

    // ── Divider + meta row (HorizontalBorder) ───────────────────────────────
    // Outer container for divider: vertical AL, top border acts as divider
    var metaSection = figma.createFrame();
    metaSection.name = 'HorizontalBorder';
    metaSection.layoutMode = 'HORIZONTAL';
    metaSection.primaryAxisSizingMode = 'FIXED';   // fill container width
    metaSection.counterAxisSizingMode = 'AUTO';    // hug height
    metaSection.paddingTop = 17;
    metaSection.itemSpacing = 16;
    metaSection.fills = [];
    metaSection.clipsContent = false;
    metaSection.layoutAlign = 'STRETCH';           // fill card width
    // Top stroke as divider
    metaSection.strokes = [{ type:'SOLID', color:{r:0.86,g:0.86,b:0.86} }];
    metaSection.strokeWeight = 1;
    metaSection.strokeAlign = 'OUTSIDE';
    metaSection.strokeTopWeight = 1;
    metaSection.strokeBottomWeight = 0;
    metaSection.strokeLeftWeight = 0;
    metaSection.strokeRightWeight = 0;

    // ── 5 meta columns, each flex-grow ──────────────────────────────────────
    var metas = getTypoMeta(style);
    for (var mi = 0; mi < metas.length; mi++) {
      var col = figma.createFrame();
      col.name = 'MetaCol';
      col.layoutMode = 'VERTICAL';
      col.primaryAxisSizingMode = 'AUTO';          // hug height
      col.counterAxisSizingMode = 'FIXED';         // fill (set by layoutGrow)
      col.itemSpacing = 4;
      col.fills = [];
      col.clipsContent = false;
      col.layoutAlign = 'STRETCH';                 // fill vertical axis of parent
      col.layoutGrow = 1;                          // grow equally across 5 cols

      // Label (subtle)
      var lbl = figma.createText();
      lbl.name = 'Label';
      lbl.fontName = { family:'Inter', style:'Regular' };
      lbl.fontSize = 10;
      lbl.characters = metas[mi].label;
      lbl.fills = [{ type:'SOLID', color:{r:0.6,g:0.6,b:0.6} }];
      lbl.textAutoResize = 'WIDTH_AND_HEIGHT';
      col.appendChild(lbl);

      // Value (medium weight)
      var val = figma.createText();
      val.name = 'Value';
      val.fontName = { family:'Inter', style:'Medium' };
      val.fontSize = 11;
      val.characters = metas[mi].value;
      val.fills = [{ type:'SOLID', color:{r:0.15,g:0.15,b:0.14} }];
      val.textAutoResize = 'WIDTH_AND_HEIGHT';
      col.appendChild(val);

      metaSection.appendChild(col);
    }

    card.appendChild(metaSection);
    wrap.appendChild(card);
  }

  return wrap;
}

// ═════════════════════════════════════════════════════════════════════════════
// SIZING & SPACING
// ═════════════════════════════════════════════════════════════════════════════
async function buildSizing(floatVars, collections) {
  var ROW_H = 48;
  var BAR_H = 24;
  var BAR_TRACK_W = 360;
  var BAR_MAX_W = 320;
  var COL_NAME_X = 20;
  var COL_BAR_X = 280;
  var COL_VAL_X = 660;
  var COL_ALIAS_X = 780;
  var BADGE_H = 39;
  var INNER_PAD = 20;
  var CARD_PAD = 16;
  var HDR_H = 32;

  var ACCENTS = [
    {r:0.25, g:0.55, b:0.95},
    {r:0.15, g:0.72, b:0.60},
    {r:0.93, g:0.42, b:0.16},
    {r:0.60, g:0.35, b:0.95},
    {r:0.18, g:0.78, b:0.45},
    {r:0.95, g:0.26, b:0.45},
  ];

  // Group by collection + top-level prefix
  var groups = {};
  floatVars.forEach(function(v) {
    var col = collections.find(function(c){ return c.id === v.variableCollectionId; });
    if (!col) return;
    var parts = v.name.split('/');
    var groupName = parts.length > 1 ? parts[0] : 'General';
    var key = col.id + '||' + groupName;
    if (!groups[key]) groups[key] = { name: groupName, collection: col, vars: [] };
    groups[key].vars.push(v);
  });

  // Sort each group by resolved default-mode value ascending
  var groupList = Object.values(groups);
  for (var sgi = 0; sgi < groupList.length; sgi++) {
    var sg = groupList[sgi];
    var sDefModeId = sg.collection.defaultModeId;
    var sortVals = {};
    for (var svi = 0; svi < sg.vars.length; svi++) {
      var sv = sg.vars[svi];
      sortVals[sv.id] = await resolveFloatValue(sv.valuesByMode[sDefModeId], collections, sDefModeId);
    }
    sg.vars.sort(function(a, b) { return sortVals[a.id] - sortVals[b.id]; });
  }

  var wrap = fr('//SIZING & SPACING', 0, 0, WRAP_W, 100, {r:1,g:1,b:1}, 32);
  addStroke(wrap, {r:0.86,g:0.85,b:0.86}, 1);
  wrap.clipsContent = true;

  var hero = await buildHero('Sizing & Spacing', CONTENT_W);
  hero.x = WRAP_PAD; hero.y = WRAP_PAD;
  wrap.appendChild(hero);

  var cardY = WRAP_PAD + 320 + WRAP_GAP;

  for (var gi = 0; gi < groupList.length; gi++) {
    var g = groupList[gi];
    var accent = ACCENTS[gi % ACCENTS.length];
    var tint = { r:accent.r+(1-accent.r)*0.91, g:accent.g+(1-accent.g)*0.91, b:accent.b+(1-accent.b)*0.91 };
    var modes = g.collection.modes;
    var numModes = modes.length;
    var defModeId = g.collection.defaultModeId;

    var innerW = CONTENT_W - CARD_PAD * 2;
    var rowW = innerW - INNER_PAD * 2;

    // Card height: badge + header row + (rows per mode + mode labels) for each mode
    var rowsPerMode = g.vars.length;
    var modeLabelH = numModes > 1 ? 20 : 0;
    var totalRowsH = numModes * (rowsPerMode * ROW_H + (rowsPerMode - 1) * 1 + modeLabelH);
    var INNER_H = INNER_PAD + BADGE_H + 16 + HDR_H + 8 + totalRowsH + INNER_PAD;
    var CARD_H = CARD_PAD * 2 + INNER_H;

    var card = fr('Group: ' + g.name, WRAP_PAD, cardY, CONTENT_W, CARD_H, tint, 24);
    var inner = fr('Inner', CARD_PAD, CARD_PAD, innerW, INNER_H, {r:1,g:1,b:1}, 20);
    card.appendChild(inner);

    // Badge
    var badgeTextColor = lum(accent.r, accent.g, accent.b) > 0.35 ? {r:0.1,g:0.1,b:0.1} : {r:1,g:1,b:1};
    var badgeLabelTxt = await tx(g.name.toUpperCase(), 0, 0, 12, {family:'Inter',style:'Semi Bold'}, badgeTextColor);
    var bW = badgeLabelTxt.width + 24;
    var badge = fr('Badge', INNER_PAD, INNER_PAD, bW, BADGE_H, accent, 24);
    badgeLabelTxt.x = 12;
    badgeLabelTxt.y = Math.round((BADGE_H - badgeLabelTxt.height) / 2);
    badge.appendChild(badgeLabelTxt);
    inner.appendChild(badge);

    // Column header row
    var hdrY = INNER_PAD + BADGE_H + 16;
    var hdrColor = {r:0.6,g:0.6,b:0.6};
    var hdrFont = {family:'Inter',style:'Regular'};
    var hdrVY = Math.round((HDR_H - 12) / 2);
    inner.appendChild(await tx('TOKEN', COL_NAME_X, hdrY + hdrVY, 10, hdrFont, hdrColor));
    inner.appendChild(await tx('VISUAL', COL_BAR_X, hdrY + hdrVY, 10, hdrFont, hdrColor));
    inner.appendChild(await tx('VALUE', COL_VAL_X, hdrY + hdrVY, 10, hdrFont, hdrColor));
    inner.appendChild(await tx('ALIAS', COL_ALIAS_X, hdrY + hdrVY, 10, hdrFont, hdrColor));

    var contentY = hdrY + HDR_H + 8;

    for (var mi = 0; mi < numModes; mi++) {
      var mode = modes[mi];
      var modeId = mode.modeId;

      if (numModes > 1) {
        var modeLabel = await tx(mode.name, COL_NAME_X, contentY, 10, {family:'Inter',style:'Regular'}, {r:0.6,g:0.6,b:0.6});
        inner.appendChild(modeLabel);
        contentY += modeLabelH;
      }

      for (var vi = 0; vi < g.vars.length; vi++) {
        var v = g.vars[vi];
        var rawVal = v.valuesByMode[modeId] !== undefined ? v.valuesByMode[modeId] : v.valuesByMode[defModeId];
        var resolvedVal = await resolveFloatValue(rawVal, collections, modeId);
        var barW = Math.max(1, Math.min(Math.round(resolvedVal), BAR_MAX_W));
        var rowY = contentY + vi * (ROW_H + 1);
        var nameParts = v.name.split('/');
        var leafName = nameParts[nameParts.length - 1];

        // Row bg (alternating subtle)
        if (vi % 2 === 1) {
          inner.appendChild(rc('row-bg', CARD_PAD, rowY, rowW, ROW_H, {r:0.97,g:0.97,b:0.97}, 0));
        }

        // Token name
        var barVY = rowY + Math.round((ROW_H - BAR_H) / 2);
        var nameVY = rowY + Math.round((ROW_H - 13) / 2);
        inner.appendChild(await tx(leafName, COL_NAME_X, nameVY, 12, {family:'Inter',style:'Medium'}, {r:0.15,g:0.15,b:0.14}));

        // Bar track
        inner.appendChild(rc('track', COL_BAR_X, barVY, BAR_TRACK_W, BAR_H, {r:0.94,g:0.94,b:0.94}, 6));

        // Bar fill
        var bar = rc('bar', COL_BAR_X, barVY, barW, BAR_H, accent, 6);
        // Best-effort variable binding to width dimension
        try { bar.setBoundVariable('width', v); } catch(e) {}
        inner.appendChild(bar);

        // Value label
        var displayVal = Number.isInteger(resolvedVal) ? resolvedVal + 'px' : resolvedVal.toFixed(1) + 'px';
        inner.appendChild(await tx(displayVal, COL_VAL_X, nameVY, 11, {family:'Inter',style:'Regular'}, {r:0.32,g:0.32,b:0.32}));

        // Alias label (if this variable references another)
        if (rawVal && typeof rawVal === 'object' && rawVal.type === 'VARIABLE_ALIAS') {
          try {
            var aliasVar = await figma.variables.getVariableByIdAsync(rawVal.id);
            if (aliasVar) {
              var aliasParts = aliasVar.name.split('/');
              inner.appendChild(await tx(aliasParts[aliasParts.length - 1], COL_ALIAS_X, nameVY, 10, {family:'Inter',style:'Regular'}, {r:0.6,g:0.6,b:0.6}));
            }
          } catch(e) {}
        }

        // Row divider
        if (vi < g.vars.length - 1) {
          inner.appendChild(rc('divider', CARD_PAD, rowY + ROW_H, rowW, 1, {r:0.92,g:0.92,b:0.92}, 0));
        }
      }

      contentY += rowsPerMode * ROW_H + (rowsPerMode - 1) * 1 + (mi < numModes - 1 ? modeLabelH + 8 : 0);
    }

    wrap.appendChild(card);
    cardY += CARD_H + 16;
  }

  wrap.resize(WRAP_W, cardY + WRAP_PAD);
  return wrap;
}

async function resolveFloatValue(val, collections, modeId, depth) {
  depth = depth || 0;
  if (val === null || val === undefined || depth > 20) return 0;
  if (typeof val === 'number') return val;
  if (val.type === 'VARIABLE_ALIAS') {
    try {
      var aliasVar = await figma.variables.getVariableByIdAsync(val.id);
      if (!aliasVar) return 0;
      var aliasColl = collections.find(function(c){ return c.id === aliasVar.variableCollectionId; });
      var resolvedModeId = modeId;
      if (aliasColl) {
        var modeExists = aliasColl.modes.some(function(m){ return m.modeId === modeId; });
        if (!modeExists) resolvedModeId = aliasColl.defaultModeId;
      }
      return await resolveFloatValue(aliasVar.valuesByMode[resolvedModeId], collections, resolvedModeId, depth + 1);
    } catch(e) { return 0; }
  }
  return 0;
}

function getTypoMeta(style) {
  var wm = {thin:'100',extralight:'200','extra light':'200',light:'300',
    regular:'400',normal:'400',medium:'500',semibold:'600',
    'semi bold':'600',bold:'700',extrabold:'800','extra bold':'800',
    black:'900',heavy:'900'};
  var s = (style.fontName.style||'R').toLowerCase();
  var wn = '400';
  for (var k in wm) { if (s.indexOf(k) !== -1) { wn = wm[k]; break; } }

  var lh = '—';
  try {
    if (style.lineHeight.unit==='PIXELS') lh = style.lineHeight.value+'px';
    else if (style.lineHeight.unit==='PERCENT') lh = style.lineHeight.value+'%';
    else if (style.lineHeight.unit==='AUTO') lh = 'Auto';
  } catch(e){}

  var ls = '0px';
  try {
    if (style.letterSpacing.unit==='PIXELS') ls = style.letterSpacing.value+'px';
    else if (style.letterSpacing.unit==='PERCENT') ls = style.letterSpacing.value+'%';
  } catch(e){}

  return [
    {label:'Font Family',    value: style.fontName.family},
    {label:'Font Weight',    value: style.fontName.style+' ('+wn+')'},
    {label:'Font Size',      value: style.fontSize+'px'},
    {label:'Line Height',    value: lh},
    {label:'Letter Spacing', value: ls},
  ];
}