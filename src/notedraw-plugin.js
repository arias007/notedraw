/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- NoteDraw is a plain JavaScript Obsidian plugin that validates dynamic DOM, vault, and drawing data at runtime. */
import {
  FuzzySuggestModal,
  MarkdownRenderer,
  MarkdownView,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  normalizePath,
  requestUrl,
  setIcon
} from "obsidian";
import SUPPORT_CODE_ALIPAY_DATA_URL from "../extras/code-1.jpg";
import SUPPORT_CODE_BINANCE_DATA_URL from "../extras/code-2.png";
import {
  calculateCanvasBackingStore,
  calculateCanvasWindow,
  calculateQualityWindowLimit,
  calculateZoomAwareWindowFloor,
  measureCanvasExtent,
  shouldClearStaleReadingVirtualMinHeight
} from "./canvas-sizing.mjs";
import { coalesceDrawingSaveRequest, materializeDrawingSaveRequest } from "./drawing-persistence.mjs";
import {
  RESPONSIVE_POINT_BASIS,
  constrainWideContentFrame,
  createResponsivePoint,
  mapClientPointToCanvas,
  mapResizeClientDeltaToPoint,
  normalizeContentFrame,
  normalizeResponsiveAnchor,
  projectResponsivePoint
} from "./layout-coordinates.mjs";
import {
  ELEMENT_LAYOUT_BASIS,
  createElementLayout,
  elementLayoutExceedsTarget,
  elementLayoutNeedsRepair,
  estimateStableElementLayoutExtent,
  normalizeElementLayout,
  projectElementLayout,
  projectElementPoints,
  scaleElementMetrics,
  settleProjectedElementTransition,
  stabilizeProjectedElementBox
} from "./element-layout.mjs";
import {
  createMarkdownSourceIndex,
  findRenderedMarkdownSourceTargets,
  matchRenderedTextToMarkdown,
  resolveRenderedMarkdownSourceTarget
} from "./markdown-anchors.mjs";
import {
  clientPointInRect,
  markdownClientRectsOverlap,
  markdownBlockPresentationMinHeight,
  normalizeMarkdownBlockMinHeight,
  normalizeMarkdownFloatBox,
  resizeMarkdownBlockMinHeight,
  resolveDragDropHorizontalIntent,
  resolveSelectionResizeScales,
  resolveVerticalMarkdownDropTarget,
  trimMarkdownClientRect
} from "./markdown-block-layout.mjs";
import { buildVirtualMarkdownSectionAnchors } from "./markdown-section-anchors.mjs";
import {
  SELECTED_DRAW_GESTURE_DRAW_OR_DESELECT,
  SELECTED_DRAW_GESTURE_MANIPULATE,
  resolveSelectedDrawGesture
} from "./selection-draw-gesture.mjs";
import {
  SELECTION_FILTER_ALL,
  SELECTION_FILTER_FLOATING,
  SELECTION_FILTER_MARKDOWN,
  createSelectionFilterSnapshot,
  nextSelectionFilterMode,
  selectionForFilterMode,
  selectionMatchesFilterMode
} from "./selection-filter.mjs";
import {
  computeTextLayout,
  placeFloatingTextEditor
} from "./text-layout.mjs";
import {
  calculatePinchPanScroll,
  calculateReadingZoomMargin,
  calculateVisualZoomLogicalWindow,
  resolveMultiTouchGestureMode
} from "./viewport-gesture.mjs";
import {
  captureInitialReadingLayout,
  waitForStableReadingLayout
} from "./reading-layout.mjs";
import {
  beginReadingTouch,
  createReadingTouchGuardState,
  finishReadingTouch,
  moveReadingTouch,
  recordReadingTouchScroll,
  shouldSuppressReadingClick
} from "./reading-touch-guard.mjs";
import {
  frozenNoteFlowLayoutSignature,
  hasExactNoteFlowPlacement,
  hasStableNoteFlowAnchor,
  noteFlowAvoidanceReference,
  noteFlowRowReservation,
  noteFlowReservedRowTop,
  noteFlowSurfaceRepairLimits,
  normalizeFrozenNoteFlowLayout,
  noteFlowNeedsActivationRepair,
  preserveAbsoluteNoteFlowPoints,
  projectNoteFlowDocumentPoint,
  projectStableNoteFlowBox,
  reflowNoteFlowRectangles,
  selectOwnedBlankSpaceCandidate,
  selectNoteFlowAvoidanceCandidate,
  createNoteFlowDropIndex,
  selectNoteFlowDropPlacementFromIndex,
  selectExactNoteFlowPositionAnchor,
  selectNoteFlowInsertionPlacement,
  selectNoteFlowPositionAnchor,
  selectStoredNoteFlowAnchorCandidate,
  shouldPlaceStrokeBelowMarkdown,
  shouldRenderStrokeOnSurface,
  stabilizeNoteFlowPointProjection,
  stabilizeNoteFlowBounds
} from "./note-flow-layout.mjs";
import { pickRootPreview, shouldMountRootPreview, shouldRecoverEmptyRootPreview, shouldResetDormantRootPreview } from "./preview-lifecycle.mjs";
import { buildSnappedConnectorPoints, connectorSnapThreshold } from "./connector-binding.mjs";
import {
  buildFountainPenSegments,
  straightenWatercolorPoints
} from "./stroke-dynamics.mjs";
import { pickTextHighlightLine } from "./text-highlight.mjs";
import { layoutMindMap, parseMarkdownMindMap, replaceMarkdownMindMapNodeText } from "./mind-map.mjs";
import { createAsyncCommitBarrier, hoistPlainTextMarker } from "./text-edit-utils.mjs";
import {
  DRAWING_STORAGE_CONFIG,
  DRAWING_STORAGE_EMBEDDED,
  DRAWING_STORAGE_NOTE_FOLDER,
  DRAWING_STORAGE_NOTE_SUBFOLDER,
  appendEncodedNotedrawDataBlock,
  appendNotedrawDataBlock,
  decodeNotedrawDataBlock,
  encodeNotedrawDataBlock,
  normalizeDrawingStorageMode,
  resolveDrawingStoragePath,
  stripNotedrawDataBlocks
} from "./portable-notedraw.mjs";
const activeDocument = window.activeWindow?.document || window.document;
var PLUGIN_ID = "notedraw";
var DRAWING_DIR = `${PLUGIN_ID}/drawings`;
var ASSET_DIR = `${PLUGIN_ID}/assets`;
var PORTABLE_RESOURCE_CACHE_LIMIT = 48;
var PORTABLE_RESOURCE_PREFIX = "notedraw-portable";
var WEBVIEW_DRAWING_PREFIX = "webviews";
var WORKSPACE_DRAWING_PREFIX = "workspaces";
var REGISTERED_SURFACE_PREFIX = "registered-surfaces";
var LEGACY_PLUGIN_ID = "note-doodle-preview";
var LEGACY_DRAWING_DIR = `${LEGACY_PLUGIN_ID}/doodles`;
var DEBUG_LOG_FILE = "debug-log.jsonl";
var DEBUG_LOG_LIMIT = 150;
var TEXT_SAVE_DELAY_MS = 160;
var SETTINGS_SAVE_DELAY_MS = 260;
var LONG_PRESS_MS = 550;
var SELECT_TAP_DISTANCE = 6;
var SELECT_STROKE_PADDING = 8;
var SELECTED_STROKE_ALPHA = 0.38;
var SELECT_RESIZE_HANDLE_SIZE = 11;
var SELECT_RESIZE_HANDLE_HIT_RADIUS = 22;
var SNAP_GRID_PX = 8;
var SNAP_THRESHOLD_PX = 7;
var DRAWING_INTERPOLATION_STEP_PX = 3;
var DRAWING_MIN_POINT_DISTANCE_PX = 0.55;
var DRAWING_COMPACT_DISTANCE_PX = 1.1;
var MAX_PEN_COUNT = 5;
var MIN_BRUSH_WIDTH = 0.25;
var MAX_BRUSH_WIDTH = 96;
var DEFAULT_PEN_OPACITY = 1;
var MIN_LONG_PRESS_MS = 250;
var MAX_LONG_PRESS_MS = 1200;
var MIN_SELECT_TAP_DISTANCE = 3;
var MAX_SELECT_TAP_DISTANCE = 18;
var MIN_SELECT_STROKE_PADDING = 2;
var MAX_SELECT_STROKE_PADDING = 28;
var MIN_SELECTED_STROKE_ALPHA = 0.12;
var MAX_SELECTED_STROKE_ALPHA = 1;
var MIN_DRAWING_INTERPOLATION_STEP_PX = 1;
var MAX_DRAWING_INTERPOLATION_STEP_PX = 8;
var MIN_DRAWING_MIN_POINT_DISTANCE_PX = 0.05;
var MAX_DRAWING_MIN_POINT_DISTANCE_PX = 3;
var MIN_DRAWING_COMPACT_DISTANCE_PX = 0.1;
var MAX_DRAWING_COMPACT_DISTANCE_PX = 6;
var MIN_AUTO_SAVE_DELAY_MS = 120;
var MAX_AUTO_SAVE_DELAY_MS = 2500;
var TOOL_DRAW = "draw";
var TOOL_SELECT = "select";
var TOOL_EDIT_MD = "edit-md";
var TOOL_TEXT = "text";
var TOOL_EMBED = "embed";
var BRUSH_PEN = "pen";
var BRUSH_WATERCOLOR = "watercolor";
var BRUSH_VARIANT_DEFAULT = "default";
var PEN_VARIANT_FOUNTAIN = "fountain";
var PEN_VARIANT_NOTE = "note-flow";
var WATERCOLOR_VARIANT_TEXT = "text-highlight";
var WATERCOLOR_VARIANT_STRAIGHT = "straight";
var MIN_READING_ZOOM = 0.6;
var MAX_READING_ZOOM = 100;
var TEXT_RENDER_PLAIN = "plain";
var TEXT_RENDER_MARKDOWN = "markdown";
var TEXT_RENDER_HTML = "html";
var TEXT_RENDER_NOTE = "note";
var EMBED_IMAGE = "image";
var EMBED_VIDEO = "video";
var EMBED_FILE = "file";
var COMMON_COLORS = [
  "#e53935",
  "#fdd835",
  "#43a047",
  "#1e88e5",
  "#111827"
];
var SETTINGS_EXTRA_CODE_ASSETS = [
  { path: "extras/code-1.jpg", dataUrl: SUPPORT_CODE_ALIPAY_DATA_URL, labelKey: "supportCodeAlipay" },
  { path: "extras/code-2.png", dataUrl: SUPPORT_CODE_BINANCE_DATA_URL, labelKey: "supportCodeBinance" }
];
var LANGUAGE_AUTO = "auto";
var LANGUAGE_OPTIONS = [
  { value: LANGUAGE_AUTO, label: "Auto" },
  { value: "zh", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ug", label: "ئۇيغۇرچە" },
  { value: "ru", label: "Русский" },
  { value: "ar", label: "العربية" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "tr", label: "Türkçe" }
];
var I18N = {
  en: {
    toggleCommand: "Toggle preview edit and drawing mode",
    openNoteOrWebviewFirst: "Open a note or webview first.",
    failedSaveDrawing: "Failed to save drawing data.",
    failedImportFile: "Failed to import file.",
    editTextDraw: "Edit text / draw",
    editTextDrawHidden: "Edit text / draw (drawings hidden)",
    editWebviewDraw: "Edit webview / draw",
    selectDrawings: "Select drawings",
    editMarkdownTool: "Edit MD",
    pen: "Pen",
    standardPen: "Standard pen",
    fountainPen: "Fountain pen",
    notePen: "Note pen",
    watercolorBrush: "Watercolor brush",
    standardWatercolor: "Standard watercolor",
    textWatercolor: "Text watercolor",
    straightWatercolor: "Straight watercolor",
    floatingText: "Floating text",
    undoLastDrawing: "Undo last drawing",
    redoDrawing: "Redo drawing",
    deleteSelectedDrawing: "Delete selected drawing",
    penSettings: "Pen settings",
    advancedColor: "Advanced color",
    blockBackground: "Box background",
    clearBlockBackground: "Clear box background",
    moveMarkdownBlock: "Move or arrange Markdown block",
    failedMoveMarkdownBlock: "Could not move the Markdown block.",
    boxElements: "Put selection in a box",
    unboxElements: "Remove box",
    floatMarkdownBlock: "Make Markdown block floating",
    penWidth: "Pen width",
    penOpacity: "Pen opacity",
    textGroup: "Text and links",
    buttonGroup: "Buttons and connectors",
    textPlain: "Text",
    title: "Title",
    code: "Code",
    button: "Button",
    primaryButton: "Primary",
    outlineButton: "Rectangle",
    pillButton: "Solid rectangle",
    arrowUp: "Up",
    arrowDown: "Down",
    arrowLeft: "Left",
    arrowRight: "Right",
    arrow: "Arrow",
    fileTag: "File tag",
    importGroup: "Import",
    image: "Image",
    video: "Video",
    file: "File",
    previewGroup: "Preview",
    markdown: "MD",
    html: "HTML",
    note: "Note",
    mindMap: "Mind map from file",
    chooseMindMapFile: "Choose a note for the mind map",
    affectSourceNote: "Affect source note",
    openSourceNote: "Open source note",
    sourceNoteUpdated: "Source note updated",
    sourceNoteUpdateFailed: "Could not update the source note",
    placeMindMap: "Tap the reading view to place the mind map.",
    emptyMindMap: "No usable content was found in that note.",
    mindMapTruncated: "The mind map was limited to 240 nodes for performance.",
    bold: "Bold",
    italic: "Italic",
    underline: "Underline",
    inlineCode: "Inline code",
    keyboardTag: "Keyboard tag",
    superscript: "Superscript",
    subscript: "Subscript",
    codeBlock: "Code block",
    highlight: "Highlight",
    insertBreak: "Insert line break",
    clearFormat: "Clear formatting",
    textColor: "Text color",
    highlightColor: "Highlight color",
    textSize: "Text size",
    size: "Size",
    movePanel: "Move panel",
    useColor: "Use color {color}",
    settingsSectionInterface: "Interface",
    settingsSectionPen: "Pen",
    settingsSectionWatercolor: "Watercolor",
    settingsSectionInteraction: "Interaction",
    settingsSectionPerformance: "Performance",
    settingsSectionLayout: "Layout",
    settingsSectionStorage: "Data storage and sharing",
    settingsSectionDiagnostics: "Diagnostics",
    settingsSectionSupport: "Support",
    settingsLanguage: "Language",
    settingsLanguageDesc: "Plugin UI language. Auto follows Obsidian when possible.",
    languageAuto: "Auto",
    drawingStorageMode: "NoteDraw data location",
    drawingStorageModeDesc: "Where each note's NoteDraw JSON is stored. The plugin config folder remains the default.",
    drawingStorageConfig: "Plugin config folder (default)",
    drawingStorageNoteSubfolder: "Current folder / notedraw",
    drawingStorageNoteFolder: "Current folder",
    drawingStorageEmbedded: "Current Markdown file (hidden)",
    shareNoteDrawFile: "Share NoteDraw file",
    sharePreparing: "Packaging this note and its linked resources...",
    shareReady: "NoteDraw file is ready with {count} embedded resource(s).",
    shareDownloaded: "Native sharing is unavailable. The NoteDraw Markdown file was downloaded.",
    shareFailed: "Could not package the NoteDraw file.",
    defaultPenColor: "Default pen color",
    defaultPenColorDesc: "Initial color for new pen strokes.",
    defaultPenWidth: "Default pen width",
    defaultPenWidthDesc: "Initial pen width.",
    defaultPenOpacity: "Default pen opacity",
    defaultPenOpacityDesc: "Initial pen opacity.",
    defaultWatercolorColor: "Default watercolor color",
    defaultWatercolorColorDesc: "Initial color for watercolor strokes.",
    defaultWatercolorWidth: "Default watercolor width",
    defaultWatercolorWidthDesc: "Initial watercolor width.",
    defaultWatercolorOpacity: "Default watercolor opacity",
    defaultWatercolorOpacityDesc: "Initial watercolor opacity.",
    toolbarTopOffset: "Toolbar top offset",
    toolbarTopOffsetDesc: "Extra pixels below the Obsidian header.",
    longPressMs: "Long press delay",
    longPressMsDesc: "Delay before long-press actions open secondary controls.",
    selectTapDistance: "Tap tolerance",
    selectTapDistanceDesc: "Movement allowed before a tap becomes a drag or stroke.",
    selectStrokePadding: "Selection hit padding",
    selectStrokePaddingDesc: "Extra hit area around drawing elements for easier selection.",
    selectedStrokeAlpha: "Selected element opacity",
    selectedStrokeAlphaDesc: "Opacity used while selected elements are previewed for editing.",
    drawingInterpolationStep: "Stroke smoothing",
    drawingInterpolationStepDesc: "Lower values add more points between samples for smoother lines.",
    drawingMinPointDistance: "Input sample spacing",
    drawingMinPointDistanceDesc: "Minimum point distance while drawing. Lower values capture more detail.",
    drawingCompactDistance: "Save compaction",
    drawingCompactDistanceDesc: "Point reduction applied during auto-save. Lower values keep more detail.",
    autoSaveDelayMs: "Auto-save delay",
    autoSaveDelayMsDesc: "Delay before drawing changes are written to the plugin data folder.",
    resetBrushDefaults: "Reset brush defaults",
    resetBrushDefaultsDesc: "Restore pen and watercolor defaults to the bundled values.",
    resetLayoutDefaults: "Reset layout and interaction",
    resetLayoutDefaultsDesc: "Restore toolbar, selection, smoothing, and auto-save defaults.",
    reset: "Reset",
    debugLog: "Debug log",
    debugLogDesc: "Write text-save diagnostics to the plugin folder only while troubleshooting.",
    supportTitle: "Support NoteDraw",
    supportSubtitle: "Scan with Alipay or Binance to support ongoing maintenance.",
    supportCodeAlipay: "Alipay",
    supportCodeBinance: "Binance",
    bringToFront: "Bring to front",
    sendToBack: "Send to back",
    selectRelatedElements: "Select related",
    moveForward: "Move up",
    moveBackward: "Move down",
    lockElement: "Lock",
    unlockElement: "Unlock",
    copyElement: "Copy element/link",
    selectFloatingOnly: "Select floating elements only",
    selectMarkdownOnly: "Select Markdown and inserted elements only",
    selectAllElements: "Select all overlapping elements",
    copyElementLink: "Copy element link",
    pasteElement: "Paste",
    insertIntoNote: "Insert into note flow",
    removeFromNote: "Remove from note flow",
    convertToNoteFlow: "Convert to NoteFlow",
    convertToFloating: "Convert to floating",
    toggleFlowMode: "Switch NoteFlow / floating",
    copiedElements: "Copied {count} element(s).",
    copiedElementLink: "Copied NoteDraw element link.",
    elementLinkLabel: "NoteDraw element",
    elementLinkTargetNotFound: "The linked NoteDraw element was not found.",
    pastedElements: "Pasted {count} element(s).",
    nothingToPaste: "No NoteDraw elements have been copied."
  },
  zh: {
    toggleCommand: "切换阅读编辑和涂鸦模式",
    openNoteOrWebviewFirst: "请先打开笔记或网页视图。",
    failedSaveDrawing: "涂鸦数据保存失败。",
    failedImportFile: "导入文件失败。",
    editTextDraw: "编辑文字 / 涂鸦",
    editTextDrawHidden: "编辑文字 / 涂鸦（涂鸦已隐藏）",
    editWebviewDraw: "编辑网页 / 涂鸦",
    selectDrawings: "选择元素",
    editMarkdownTool: "编辑 MD",
    pen: "笔",
    standardPen: "普通笔",
    fountainPen: "钢笔",
    notePen: "笔记笔",
    watercolorBrush: "水彩笔",
    standardWatercolor: "普通水彩笔",
    textWatercolor: "文字水彩笔",
    straightWatercolor: "自动拉直水彩笔",
    floatingText: "悬浮文字",
    undoLastDrawing: "撤销上一步涂鸦",
    redoDrawing: "重做涂鸦",
    deleteSelectedDrawing: "删除选中元素",
    penSettings: "画笔设置",
    advancedColor: "高级颜色",
    blockBackground: "盒子底色",
    clearBlockBackground: "清除盒子底色",
    moveMarkdownBlock: "移动或排列 Markdown 块",
    failedMoveMarkdownBlock: "Markdown 块移动失败。",
    boxElements: "框成盒子组",
    unboxElements: "取消盒子框",
    floatMarkdownBlock: "设为悬浮 Markdown 块",
    penWidth: "笔宽",
    penOpacity: "笔透明度",
    textGroup: "文字链接",
    buttonGroup: "按钮/连接",
    textPlain: "普通文字",
    title: "标题",
    code: "代码",
    button: "按钮",
    primaryButton: "主按钮",
    outlineButton: "矩形",
    pillButton: "实心矩形",
    arrowUp: "上",
    arrowDown: "下",
    arrowLeft: "左",
    arrowRight: "右",
    arrow: "箭头",
    fileTag: "文件标签",
    importGroup: "导入",
    image: "图片",
    video: "视频",
    file: "文件",
    previewGroup: "预览",
    markdown: "MD",
    html: "HTML",
    note: "笔记",
    mindMap: "从文件提取思维导图",
    chooseMindMapFile: "选择要提取思维导图的笔记",
    affectSourceNote: "影响笔记",
    openSourceNote: "跳转源笔记",
    sourceNoteUpdated: "源笔记已同步",
    sourceNoteUpdateFailed: "源笔记同步失败",
    placeMindMap: "请在阅读视图中点击思维导图的放置位置。",
    emptyMindMap: "该笔记中没有可提取的有效内容。",
    mindMapTruncated: "为保证性能，思维导图最多提取 240 个节点。",
    bold: "加粗",
    italic: "倾斜",
    underline: "下划线",
    inlineCode: "行内代码",
    keyboardTag: "键盘标签",
    superscript: "上标",
    subscript: "下标",
    codeBlock: "代码块",
    highlight: "高亮",
    insertBreak: "换行",
    clearFormat: "清除格式",
    textColor: "文字颜色",
    highlightColor: "高亮颜色",
    textSize: "字号",
    size: "字号",
    movePanel: "移动面板",
    useColor: "使用颜色 {color}",
    settingsSectionInterface: "界面",
    settingsSectionPen: "笔",
    settingsSectionWatercolor: "水彩笔",
    settingsSectionInteraction: "交互",
    settingsSectionPerformance: "性能",
    settingsSectionLayout: "布局",
    settingsSectionStorage: "数据存储与分享",
    settingsSectionDiagnostics: "诊断",
    settingsSectionSupport: "支持作者",
    settingsLanguage: "语言",
    settingsLanguageDesc: "插件界面语言。自动模式会尽量跟随 Obsidian。",
    languageAuto: "自动",
    drawingStorageMode: "NoteDraw 数据位置",
    drawingStorageModeDesc: "设置每篇笔记的 NoteDraw 数据文件位置。默认仍为插件配置文件夹。",
    drawingStorageConfig: "插件配置文件夹（默认）",
    drawingStorageNoteSubfolder: "当前文件夹 / notedraw",
    drawingStorageNoteFolder: "当前文件夹",
    drawingStorageEmbedded: "当前 Markdown 文件（隐藏）",
    shareNoteDrawFile: "分享 NoteDraw 文件",
    sharePreparing: "正在打包笔记、NoteDraw 数据和链接资源……",
    shareReady: "NoteDraw 文件已就绪，包含 {count} 个资源。",
    shareDownloaded: "系统分享不可用，已下载 NoteDraw Markdown 文件。",
    shareFailed: "NoteDraw 文件打包失败。",
    defaultPenColor: "默认笔颜色",
    defaultPenColorDesc: "新笔画的初始颜色。",
    defaultPenWidth: "默认笔宽",
    defaultPenWidthDesc: "初始笔宽。",
    defaultPenOpacity: "默认笔透明度",
    defaultPenOpacityDesc: "初始笔透明度。",
    defaultWatercolorColor: "默认水彩颜色",
    defaultWatercolorColorDesc: "新水彩笔画的初始颜色。",
    defaultWatercolorWidth: "默认水彩笔宽",
    defaultWatercolorWidthDesc: "初始水彩笔宽。",
    defaultWatercolorOpacity: "默认水彩透明度",
    defaultWatercolorOpacityDesc: "初始水彩透明度。",
    toolbarTopOffset: "工具栏顶部偏移",
    toolbarTopOffsetDesc: "距离 Obsidian 顶部栏的额外像素。",
    longPressMs: "长按延迟",
    longPressMsDesc: "长按打开二级控制的等待时间。",
    selectTapDistance: "点击容差",
    selectTapDistanceDesc: "移动多少像素后从点击变为拖动或涂鸦。",
    selectStrokePadding: "选择命中范围",
    selectStrokePaddingDesc: "元素周围额外可点范围，越大越容易选中。",
    selectedStrokeAlpha: "选中元素透明度",
    selectedStrokeAlphaDesc: "元素被选中编辑时的预览透明度。",
    drawingInterpolationStep: "笔画平滑",
    drawingInterpolationStepDesc: "数值越小，采样点之间补点越多，线条越顺。",
    drawingMinPointDistance: "输入采样间距",
    drawingMinPointDistanceDesc: "涂鸦时保留新点的最小距离，越小越细腻。",
    drawingCompactDistance: "保存压缩",
    drawingCompactDistanceDesc: "自动保存时的点位压缩强度，越小越保留细节。",
    autoSaveDelayMs: "自动保存延迟",
    autoSaveDelayMsDesc: "涂鸦改变后写入插件数据文件夹前的等待时间。",
    resetBrushDefaults: "重置画笔默认值",
    resetBrushDefaultsDesc: "恢复笔和水彩笔的内置默认颜色、大小和透明度。",
    resetLayoutDefaults: "重置布局和交互",
    resetLayoutDefaultsDesc: "恢复工具栏、选择、平滑和自动保存的默认值。",
    reset: "重置",
    debugLog: "调试日志",
    debugLogDesc: "仅排查问题时，把文字保存诊断写入插件文件夹。",
    supportTitle: "支持 NoteDraw / 双码",
    supportSubtitle: "可用支付宝或币安扫码支持后续维护。",
    supportCodeAlipay: "支付宝",
    supportCodeBinance: "币安",
    bringToFront: "置顶",
    sendToBack: "置底",
    selectRelatedElements: "选择关联元素",
    moveForward: "上移一层",
    moveBackward: "下移一层",
    lockElement: "锁定",
    unlockElement: "解锁",
    copyElement: "复制元素/链接",
    selectFloatingOnly: "只选悬浮元素",
    selectMarkdownOnly: "只选 MD 和插入元素",
    selectAllElements: "选择全部重叠元素",
    copyElementLink: "复制元素链接",
    pasteElement: "粘贴元素",
    insertIntoNote: "插入笔记",
    removeFromNote: "取消插入笔记",
    convertToNoteFlow: "转为 NoteFlow 元素",
    convertToFloating: "转为悬浮元素",
    toggleFlowMode: "切换 NoteFlow / 悬浮",
    copiedElements: "已复制 {count} 个元素。",
    copiedElementLink: "已复制 NoteDraw 元素链接。",
    elementLinkLabel: "NoteDraw 元素",
    elementLinkTargetNotFound: "没有找到链接的 NoteDraw 元素。",
    pastedElements: "已粘贴 {count} 个元素。",
    nothingToPaste: "还没有复制 NoteDraw 元素。"
  },
  "zh-TW": {
    toggleCommand: "切換閱讀編輯和塗鴉模式",
    openNoteOrWebviewFirst: "請先開啟筆記或網頁視圖。",
    failedSaveDrawing: "塗鴉資料儲存失敗。",
    failedImportFile: "匯入檔案失敗。",
    editTextDraw: "編輯文字 / 塗鴉",
    editTextDrawHidden: "編輯文字 / 塗鴉（塗鴉已隱藏）",
    editWebviewDraw: "編輯網頁 / 塗鴉",
    selectDrawings: "選擇元素",
    selectFloatingOnly: "只選浮動元素",
    selectMarkdownOnly: "只選 MD 和插入元素",
    selectAllElements: "選擇全部重疊元素",
    editMarkdownTool: "編輯 MD",
    convertToNoteFlow: "轉為 NoteFlow 元素",
    convertToFloating: "轉為浮動元素",
    toggleFlowMode: "切換 NoteFlow / 浮動",
    pen: "筆",
    watercolorBrush: "水彩筆",
    floatingText: "浮動文字",
    undoLastDrawing: "復原上一筆",
    redoDrawing: "重做塗鴉",
    deleteSelectedDrawing: "刪除選取元素",
    penSettings: "畫筆設定",
    advancedColor: "進階顏色",
    blockBackground: "盒子底色",
    clearBlockBackground: "清除盒子底色",
    moveMarkdownBlock: "移動或排列 Markdown 區塊",
    failedMoveMarkdownBlock: "Markdown 區塊移動失敗。",
    boxElements: "框成盒子群組",
    unboxElements: "取消盒子框",
    floatMarkdownBlock: "設為浮動 Markdown 區塊",
    penWidth: "筆寬",
    penOpacity: "筆透明度",
    textGroup: "文字連結",
    buttonGroup: "按鈕/連接",
    textPlain: "普通文字",
    title: "標題",
    code: "程式碼",
    button: "按鈕",
    primaryButton: "主按鈕",
    outlineButton: "矩形",
    pillButton: "實心矩形",
    arrowUp: "上",
    arrowDown: "下",
    arrowLeft: "左",
    arrowRight: "右",
    arrow: "箭頭",
    fileTag: "檔案標籤",
    importGroup: "匯入",
    image: "圖片",
    video: "影片",
    file: "檔案",
    previewGroup: "預覽",
    markdown: "MD",
    html: "HTML",
    note: "筆記",
    bold: "粗體",
    italic: "斜體",
    underline: "底線",
    inlineCode: "行內程式碼",
    keyboardTag: "鍵盤標籤",
    superscript: "上標",
    subscript: "下標",
    codeBlock: "程式碼區塊",
    highlight: "醒目提示",
    insertBreak: "換行",
    clearFormat: "清除格式",
    textColor: "文字顏色",
    highlightColor: "醒目顏色",
    textSize: "字級",
    size: "字級",
    movePanel: "移動面板",
    useColor: "使用顏色 {color}",
    settingsSectionInterface: "介面",
    settingsSectionPen: "筆",
    settingsSectionWatercolor: "水彩筆",
    settingsSectionInteraction: "互動",
    settingsSectionPerformance: "效能",
    settingsSectionLayout: "佈局",
    settingsSectionStorage: "資料儲存與分享",
    settingsSectionDiagnostics: "診斷",
    settingsSectionSupport: "支持作者",
    settingsLanguage: "語言",
    settingsLanguageDesc: "插件介面語言。自動模式會盡量跟隨 Obsidian。",
    languageAuto: "自動",
    drawingStorageMode: "NoteDraw 資料位置",
    drawingStorageModeDesc: "設定每篇筆記的 NoteDraw 資料檔位置。預設仍為插件設定資料夾。",
    drawingStorageConfig: "插件設定資料夾（預設）",
    drawingStorageNoteSubfolder: "目前資料夾 / notedraw",
    drawingStorageNoteFolder: "目前資料夾",
    drawingStorageEmbedded: "目前 Markdown 檔案（隱藏）",
    shareNoteDrawFile: "分享 NoteDraw 檔案",
    sharePreparing: "正在封裝筆記、NoteDraw 資料與連結資源……",
    shareReady: "NoteDraw 檔案已就緒，包含 {count} 個資源。",
    shareDownloaded: "系統分享不可用，已下載 NoteDraw Markdown 檔案。",
    shareFailed: "NoteDraw 檔案封裝失敗。",
    defaultPenColor: "預設筆色",
    defaultPenColorDesc: "新筆畫的初始顏色。",
    defaultPenWidth: "預設筆寬",
    defaultPenWidthDesc: "初始筆寬。",
    defaultPenOpacity: "預設筆透明度",
    defaultPenOpacityDesc: "初始筆透明度。",
    defaultWatercolorColor: "預設水彩顏色",
    defaultWatercolorColorDesc: "新水彩筆畫的初始顏色。",
    defaultWatercolorWidth: "預設水彩筆寬",
    defaultWatercolorWidthDesc: "初始水彩筆寬。",
    defaultWatercolorOpacity: "預設水彩透明度",
    defaultWatercolorOpacityDesc: "初始水彩透明度。",
    toolbarTopOffset: "工具列頂部偏移",
    toolbarTopOffsetDesc: "距離 Obsidian 頂部列的額外像素。",
    longPressMs: "長按延遲",
    longPressMsDesc: "長按開啟次級控制的等待時間。",
    selectTapDistance: "點擊容差",
    selectTapDistanceDesc: "移動多少像素後從點擊變成拖動或塗鴉。",
    selectStrokePadding: "選取命中範圍",
    selectStrokePaddingDesc: "元素周圍額外可點範圍，越大越容易選中。",
    selectedStrokeAlpha: "選中元素透明度",
    selectedStrokeAlphaDesc: "元素被選中編輯時的預覽透明度。",
    drawingInterpolationStep: "筆畫平滑",
    drawingInterpolationStepDesc: "數值越小，採樣點之間補點越多，線條越順。",
    drawingMinPointDistance: "輸入採樣間距",
    drawingMinPointDistanceDesc: "塗鴉時保留新點的最小距離，越小越細膩。",
    drawingCompactDistance: "儲存壓縮",
    drawingCompactDistanceDesc: "自動儲存時的點位壓縮強度，越小越保留細節。",
    autoSaveDelayMs: "自動儲存延遲",
    autoSaveDelayMsDesc: "塗鴉改變後寫入插件資料夾前的等待時間。",
    resetBrushDefaults: "重置畫筆預設值",
    resetBrushDefaultsDesc: "恢復筆和水彩筆的內建預設顏色、大小和透明度。",
    resetLayoutDefaults: "重置佈局和互動",
    resetLayoutDefaultsDesc: "恢復工具列、選取、平滑和自動儲存的預設值。",
    reset: "重置",
    debugLog: "除錯日誌",
    debugLogDesc: "僅排查問題時，將文字儲存診斷寫入插件資料夾。",
    supportTitle: "支持 NoteDraw / 雙碼",
    supportSubtitle: "可用支付寶或幣安掃碼支持後續維護。",
    supportCodeAlipay: "支付寶",
    supportCodeBinance: "幣安",
    bringToFront: "置頂",
    sendToBack: "置底",
    moveForward: "上移一層",
    moveBackward: "下移一層",
    lockElement: "鎖定",
    unlockElement: "解鎖"
  },
  ug: {
    toggleCommand: "ئوقۇش تەھرىر ۋە سىزىش ھالىتىنى ئالماشتۇرۇش",
    openNoteOrWebviewFirst: "ئاۋۋال خاتىرە ياكى تور كۆزنەكىنى ئېچىڭ.",
    failedSaveDrawing: "سىزىش سانلىق مەلۇماتىنى ساقلاش مەغلۇپ بولدى.",
    failedImportFile: "ھۆججەت كىرگۈزۈش مەغلۇپ بولدى.",
    editTextDraw: "تېكىست تەھرىرلەش / سىزىش",
    editTextDrawHidden: "تېكىست تەھرىرلەش / سىزىش (سىزىش يوشۇرۇلغان)",
    editWebviewDraw: "تور بەتنى تەھرىرلەش / سىزىش",
    selectDrawings: "ئېلېمېنت تاللاش",
    editMarkdownTool: "MD تەھرىرلەش",
    pen: "قەلەم",
    watercolorBrush: "سۇ بوياق قەلەم",
    floatingText: "لەيلەپ تۇرغان تېكىست",
    undoLastDrawing: "ئاخىرقى سىزىشنى قايتۇرۇش",
    redoDrawing: "قايتا قىلىش",
    deleteSelectedDrawing: "تاللانغاننى ئۆچۈرۈش",
    penSettings: "قەلەم تەڭشىكى",
    advancedColor: "تەپسىلىي رەڭ",
    penWidth: "قەلەم كەڭلىكى",
    penOpacity: "قەلەم سۈزۈكلۈكى",
    textGroup: "تېكىست ۋە ئۇلانمىلار",
    buttonGroup: "كۇنۇپكا/يۆنىلىش",
    textPlain: "تېكىست",
    title: "ماۋزۇ",
    code: "كود",
    button: "كۇنۇپكا",
    primaryButton: "ئاساسىي",
    outlineButton: "Rectangle",
    pillButton: "Solid rectangle",
    arrowUp: "ئۈستى",
    arrowDown: "ئاستى",
    arrowLeft: "سول",
    arrowRight: "ئوڭ",
    arrow: "Arrow",
    fileTag: "ھۆججەت بەلگىسى",
    importGroup: "كىرگۈزۈش",
    image: "رەسىم",
    video: "سىن",
    file: "ھۆججەت",
    previewGroup: "ئالدىن كۆرۈش",
    markdown: "MD",
    html: "HTML",
    note: "خاتىرە",
    bold: "توم",
    italic: "قىيپاش",
    underline: "ئاستى سىزىق",
    inlineCode: "قۇر ئىچى كود",
    keyboardTag: "كىرگۈزگۈچ بەلگىسى",
    superscript: "ئۈستكى بەلگە",
    subscript: "ئاستى بەلگە",
    codeBlock: "كود بۆلىكى",
    highlight: "يورۇتۇش",
    insertBreak: "قۇر ئالماشتۇرۇش",
    clearFormat: "فورماتنى تازىلاش",
    textColor: "تېكىست رەڭگى",
    highlightColor: "يورۇتۇش رەڭگى",
    textSize: "خەت چوڭلۇقى",
    size: "چوڭلۇق",
    movePanel: "تاختىنى يۆتكەش",
    useColor: "{color} رەڭنى ئىشلىتىش",
    settingsSectionInterface: "كۆرۈنمە يۈزى",
    settingsSectionPen: "قەلەم",
    settingsSectionWatercolor: "سۇ بوياق قەلەم",
    settingsSectionLayout: "جايلىشىش",
    settingsSectionDiagnostics: "دىئاگنوز",
    settingsLanguage: "تىل",
    settingsLanguageDesc: "قىستۇرما كۆرۈنمە يۈزى تىلى. ئاپتوماتىك ھالەت Obsidian غا ئەگىشىدۇ.",
    languageAuto: "ئاپتوماتىك",
    defaultPenColor: "كۆڭۈلدىكى قەلەم رەڭگى",
    defaultPenColorDesc: "يېڭى قەلەم سىزىقىنىڭ دەسلەپكى رەڭگى.",
    defaultPenWidth: "كۆڭۈلدىكى قەلەم كەڭلىكى",
    defaultPenWidthDesc: "دەسلەپكى قەلەم كەڭلىكى.",
    defaultPenOpacity: "كۆڭۈلدىكى قەلەم سۈزۈكلۈكى",
    defaultPenOpacityDesc: "دەسلەپكى قەلەم سۈزۈكلۈكى.",
    defaultWatercolorColor: "كۆڭۈلدىكى سۇ بوياق رەڭگى",
    defaultWatercolorColorDesc: "يېڭى سۇ بوياق سىزىقىنىڭ دەسلەپكى رەڭگى.",
    defaultWatercolorWidth: "كۆڭۈلدىكى سۇ بوياق كەڭلىكى",
    defaultWatercolorWidthDesc: "دەسلەپكى سۇ بوياق كەڭلىكى.",
    defaultWatercolorOpacity: "كۆڭۈلدىكى سۇ بوياق سۈزۈكلۈكى",
    defaultWatercolorOpacityDesc: "دەسلەپكى سۇ بوياق سۈزۈكلۈكى.",
    toolbarTopOffset: "قورال بالداق ئۈستى ئارىلىقى",
    toolbarTopOffsetDesc: "Obsidian باش قىسمىدىن قوشۇمچە پىكسېل.",
    debugLog: "سازلاش خاتىرىسى",
    debugLogDesc: "پەقەت مەسىلە تەكشۈرگەندە تېكىست ساقلاش دىئاگنوزىنى قىستۇرما قىسقۇچىغا يازىدۇ.",
    supportTitle: "NoteDraw نى قوللاش",
    supportSubtitle: "Alipay ياكى Binance ئارقىلىق كودنى سىكانىرلاپ قوللىسىڭىز بولىدۇ.",
    supportCodeAlipay: "Alipay",
    supportCodeBinance: "Binance",
    bringToFront: "ئەڭ ئۈستىگە",
    sendToBack: "ئەڭ ئاستىغا",
    moveForward: "ئۈستىگە يۆتكە",
    moveBackward: "ئاستىغا يۆتكە",
    lockElement: "قۇلۇپلاش",
    unlockElement: "قۇلۇپنى ئېچىش"
  },
  ru: {
    toggleCommand: "Переключить редактирование предпросмотра и рисование",
    openNoteOrWebviewFirst: "Сначала откройте заметку или webview.",
    failedSaveDrawing: "Не удалось сохранить данные рисунка.",
    failedImportFile: "Не удалось импортировать файл.",
    editTextDraw: "Редактировать текст / рисовать",
    editTextDrawHidden: "Редактировать текст / рисовать (рисунки скрыты)",
    editWebviewDraw: "Редактировать webview / рисовать",
    selectDrawings: "Выбрать элементы",
    editMarkdownTool: "Редактировать MD",
    pen: "Перо",
    watercolorBrush: "Акварельная кисть",
    floatingText: "Плавающий текст",
    undoLastDrawing: "Отменить последний рисунок",
    redoDrawing: "Повторить рисунок",
    deleteSelectedDrawing: "Удалить выбранное",
    penSettings: "Настройки пера",
    advancedColor: "Расширенный цвет",
    penWidth: "Толщина пера",
    penOpacity: "Прозрачность пера",
    textGroup: "Текст и ссылки",
    buttonGroup: "Кнопки/стрелки",
    textPlain: "Текст",
    title: "Заголовок",
    code: "Код",
    button: "Кнопка",
    primaryButton: "Основная",
    outlineButton: "Прямоугольник",
    pillButton: "Заполненный прямоугольник",
    arrowUp: "Вверх",
    arrowDown: "Вниз",
    arrowLeft: "Влево",
    arrowRight: "Вправо",
    arrow: "Стрелка",
    fileTag: "Метка файла",
    importGroup: "Импорт",
    image: "Изображение",
    video: "Видео",
    file: "Файл",
    previewGroup: "Предпросмотр",
    markdown: "MD",
    html: "HTML",
    note: "Заметка",
    bold: "Жирный",
    italic: "Курсив",
    underline: "Подчеркивание",
    inlineCode: "Встроенный код",
    keyboardTag: "Тег клавиатуры",
    superscript: "Верхний индекс",
    subscript: "Нижний индекс",
    codeBlock: "Блок кода",
    highlight: "Выделение",
    insertBreak: "Перенос строки",
    clearFormat: "Очистить форматирование",
    textColor: "Цвет текста",
    highlightColor: "Цвет выделения",
    textSize: "Размер текста",
    size: "Размер",
    movePanel: "Переместить панель",
    useColor: "Использовать цвет {color}",
    settingsSectionInterface: "Интерфейс",
    settingsSectionPen: "Перо",
    settingsSectionWatercolor: "Акварель",
    settingsSectionLayout: "Макет",
    settingsSectionDiagnostics: "Диагностика",
    settingsLanguage: "Язык",
    settingsLanguageDesc: "Язык интерфейса плагина. Авто по возможности следует Obsidian.",
    languageAuto: "Авто",
    defaultPenColor: "Цвет пера по умолчанию",
    defaultPenColorDesc: "Начальный цвет новых штрихов пера.",
    defaultPenWidth: "Толщина пера по умолчанию",
    defaultPenWidthDesc: "Начальная толщина пера.",
    defaultPenOpacity: "Прозрачность пера по умолчанию",
    defaultPenOpacityDesc: "Начальная прозрачность пера.",
    defaultWatercolorColor: "Цвет акварели по умолчанию",
    defaultWatercolorColorDesc: "Начальный цвет акварельных штрихов.",
    defaultWatercolorWidth: "Толщина акварели по умолчанию",
    defaultWatercolorWidthDesc: "Начальная толщина акварели.",
    defaultWatercolorOpacity: "Прозрачность акварели по умолчанию",
    defaultWatercolorOpacityDesc: "Начальная прозрачность акварели.",
    toolbarTopOffset: "Смещение панели сверху",
    toolbarTopOffsetDesc: "Дополнительные пиксели ниже заголовка Obsidian.",
    debugLog: "Журнал отладки",
    debugLogDesc: "Записывать диагностику сохранения текста в папку плагина только при отладке.",
    supportTitle: "Поддержать NoteDraw",
    supportSubtitle: "Сканируйте через Alipay или Binance, чтобы поддержать разработку.",
    supportCodeAlipay: "Alipay",
    supportCodeBinance: "Binance",
    bringToFront: "На передний план",
    sendToBack: "На задний план",
    moveForward: "Выше",
    moveBackward: "Ниже",
    lockElement: "Закрепить",
    unlockElement: "Открепить"
  }
};
Object.assign(I18N, {
  ar: Object.assign({}, I18N.en, {
    toggleCommand: "تبديل وضع تحرير المعاينة والرسم",
    openNoteOrWebviewFirst: "افتح ملاحظة أو عرض ويب أولا.",
    failedSaveDrawing: "فشل حفظ بيانات الرسم.",
    failedImportFile: "فشل استيراد الملف.",
    editTextDraw: "تحرير النص / الرسم",
    editTextDrawHidden: "تحرير النص / الرسم (الرسومات مخفية)",
    editWebviewDraw: "تحرير عرض الويب / الرسم",
    selectDrawings: "تحديد العناصر",
    editMarkdownTool: "تحرير MD",
    pen: "قلم",
    watercolorBrush: "فرشاة مائية",
    floatingText: "نص عائم",
    undoLastDrawing: "تراجع عن آخر رسم",
    redoDrawing: "إعادة الرسم",
    deleteSelectedDrawing: "حذف المحدد",
    penSettings: "إعدادات القلم",
    textGroup: "النص والروابط",
    importGroup: "استيراد",
    image: "صورة",
    video: "فيديو",
    file: "ملف",
    previewGroup: "معاينة",
    bold: "غامق",
    italic: "مائل",
    underline: "تحته خط",
    highlight: "تمييز",
    clearFormat: "مسح التنسيق",
    settingsSectionInterface: "الواجهة",
    settingsSectionPen: "القلم",
    settingsSectionWatercolor: "الألوان المائية",
    settingsSectionLayout: "التخطيط",
    settingsSectionDiagnostics: "التشخيص",
    movePanel: "تحريك اللوحة",
    settingsLanguage: "اللغة",
    languageAuto: "تلقائي",
    supportTitle: "دعم NoteDraw",
    supportSubtitle: "امسح عبر Alipay أو Binance لدعم الصيانة.",
    supportCodeAlipay: "Alipay",
    supportCodeBinance: "Binance"
  }),
  es: Object.assign({}, I18N.en, {
    toggleCommand: "Cambiar edición de vista previa y dibujo",
    openNoteOrWebviewFirst: "Abre primero una nota o webview.",
    failedSaveDrawing: "No se pudieron guardar los datos de dibujo.",
    failedImportFile: "No se pudo importar el archivo.",
    editTextDraw: "Editar texto / dibujar",
    editTextDrawHidden: "Editar texto / dibujar (dibujos ocultos)",
    editWebviewDraw: "Editar webview / dibujar",
    selectDrawings: "Seleccionar elementos",
    editMarkdownTool: "Editar MD",
    pen: "Pluma",
    watercolorBrush: "Pincel acuarela",
    floatingText: "Texto flotante",
    undoLastDrawing: "Deshacer último dibujo",
    redoDrawing: "Rehacer dibujo",
    deleteSelectedDrawing: "Eliminar seleccionado",
    penSettings: "Ajustes de pluma",
    advancedColor: "Color avanzado",
    textGroup: "Texto y enlaces",
    importGroup: "Importar",
    previewGroup: "Vista previa",
    bold: "Negrita",
    italic: "Cursiva",
    underline: "Subrayado",
    clearFormat: "Quitar formato",
    settingsSectionInterface: "Interfaz",
    settingsSectionPen: "Pluma",
    settingsSectionWatercolor: "Acuarela",
    settingsSectionLayout: "Diseño",
    settingsSectionDiagnostics: "Diagnóstico",
    movePanel: "Mover panel",
    settingsLanguage: "Idioma",
    languageAuto: "Auto",
    supportTitle: "Apoyar NoteDraw",
    supportSubtitle: "Escanea con Alipay o Binance para apoyar el mantenimiento.",
    supportCodeAlipay: "Alipay",
    supportCodeBinance: "Binance"
  }),
  fr: Object.assign({}, I18N.en, {
    toggleCommand: "Basculer édition de l'aperçu et dessin",
    openNoteOrWebviewFirst: "Ouvrez d'abord une note ou une webview.",
    failedSaveDrawing: "Échec de l'enregistrement du dessin.",
    failedImportFile: "Échec de l'import du fichier.",
    editTextDraw: "Modifier le texte / dessiner",
    editTextDrawHidden: "Modifier le texte / dessiner (dessins masqués)",
    editWebviewDraw: "Modifier la webview / dessiner",
    selectDrawings: "Sélectionner les éléments",
    editMarkdownTool: "Modifier MD",
    pen: "Stylo",
    watercolorBrush: "Pinceau aquarelle",
    floatingText: "Texte flottant",
    undoLastDrawing: "Annuler le dernier dessin",
    redoDrawing: "Rétablir le dessin",
    deleteSelectedDrawing: "Supprimer la sélection",
    penSettings: "Réglages du stylo",
    advancedColor: "Couleur avancée",
    textGroup: "Texte et liens",
    importGroup: "Importer",
    previewGroup: "Aperçu",
    bold: "Gras",
    italic: "Italique",
    underline: "Souligné",
    clearFormat: "Effacer le format",
    settingsSectionInterface: "Interface",
    settingsSectionPen: "Stylo",
    settingsSectionWatercolor: "Aquarelle",
    settingsSectionLayout: "Disposition",
    settingsSectionDiagnostics: "Diagnostics",
    movePanel: "Déplacer le panneau",
    settingsLanguage: "Langue",
    languageAuto: "Auto",
    supportTitle: "Soutenir NoteDraw",
    supportSubtitle: "Scannez avec Alipay ou Binance pour soutenir la maintenance.",
    supportCodeAlipay: "Alipay",
    supportCodeBinance: "Binance"
  }),
  de: Object.assign({}, I18N.en, {
    toggleCommand: "Vorschau-Bearbeitung und Zeichnen umschalten",
    openNoteOrWebviewFirst: "Öffne zuerst eine Notiz oder Webview.",
    failedSaveDrawing: "Zeichnungsdaten konnten nicht gespeichert werden.",
    failedImportFile: "Datei konnte nicht importiert werden.",
    editTextDraw: "Text bearbeiten / zeichnen",
    editTextDrawHidden: "Text bearbeiten / zeichnen (Zeichnungen ausgeblendet)",
    editWebviewDraw: "Webview bearbeiten / zeichnen",
    selectDrawings: "Elemente auswählen",
    editMarkdownTool: "MD bearbeiten",
    pen: "Stift",
    watercolorBrush: "Aquarellpinsel",
    floatingText: "Schwebender Text",
    undoLastDrawing: "Letzte Zeichnung rückgängig",
    redoDrawing: "Zeichnung wiederholen",
    deleteSelectedDrawing: "Auswahl löschen",
    penSettings: "Stifteinstellungen",
    advancedColor: "Erweiterte Farbe",
    textGroup: "Text und Links",
    importGroup: "Import",
    previewGroup: "Vorschau",
    bold: "Fett",
    italic: "Kursiv",
    underline: "Unterstrichen",
    clearFormat: "Formatierung löschen",
    settingsSectionInterface: "Oberfläche",
    settingsSectionPen: "Stift",
    settingsSectionWatercolor: "Aquarell",
    settingsSectionLayout: "Layout",
    settingsSectionDiagnostics: "Diagnose",
    movePanel: "Panel verschieben",
    settingsLanguage: "Sprache",
    languageAuto: "Auto",
    supportTitle: "NoteDraw unterstützen",
    supportSubtitle: "Mit Alipay oder Binance scannen, um die Wartung zu unterstützen.",
    supportCodeAlipay: "Alipay",
    supportCodeBinance: "Binance"
  }),
  ja: Object.assign({}, I18N.en, {
    toggleCommand: "プレビュー編集と描画モードを切り替え",
    openNoteOrWebviewFirst: "先にノートまたは webview を開いてください。",
    failedSaveDrawing: "描画データの保存に失敗しました。",
    failedImportFile: "ファイルのインポートに失敗しました。",
    editTextDraw: "文字編集 / 描画",
    editTextDrawHidden: "文字編集 / 描画（描画は非表示）",
    editWebviewDraw: "webview 編集 / 描画",
    selectDrawings: "要素を選択",
    editMarkdownTool: "MD 編集",
    pen: "ペン",
    watercolorBrush: "水彩ブラシ",
    floatingText: "フローティング文字",
    undoLastDrawing: "最後の描画を元に戻す",
    redoDrawing: "描画をやり直す",
    deleteSelectedDrawing: "選択を削除",
    penSettings: "ペン設定",
    advancedColor: "詳細カラー",
    textGroup: "テキストとリンク",
    importGroup: "インポート",
    previewGroup: "プレビュー",
    bold: "太字",
    italic: "斜体",
    underline: "下線",
    clearFormat: "書式をクリア",
    settingsSectionInterface: "インターフェース",
    settingsSectionPen: "ペン",
    settingsSectionWatercolor: "水彩",
    settingsSectionLayout: "レイアウト",
    settingsSectionDiagnostics: "診断",
    movePanel: "パネルを移動",
    settingsLanguage: "言語",
    languageAuto: "自動",
    supportTitle: "NoteDraw を支援",
    supportSubtitle: "Alipay または Binance でスキャンして保守を支援できます。",
    supportCodeAlipay: "Alipay",
    supportCodeBinance: "Binance"
  }),
  ko: Object.assign({}, I18N.en, {
    toggleCommand: "미리보기 편집 및 그리기 모드 전환",
    openNoteOrWebviewFirst: "먼저 노트 또는 webview를 여세요.",
    failedSaveDrawing: "그리기 데이터를 저장하지 못했습니다.",
    failedImportFile: "파일을 가져오지 못했습니다.",
    editTextDraw: "텍스트 편집 / 그리기",
    editTextDrawHidden: "텍스트 편집 / 그리기(그림 숨김)",
    editWebviewDraw: "webview 편집 / 그리기",
    selectDrawings: "요소 선택",
    editMarkdownTool: "MD 편집",
    pen: "펜",
    watercolorBrush: "수채화 브러시",
    floatingText: "플로팅 텍스트",
    undoLastDrawing: "마지막 그리기 취소",
    redoDrawing: "그리기 다시 실행",
    deleteSelectedDrawing: "선택 삭제",
    penSettings: "펜 설정",
    advancedColor: "고급 색상",
    textGroup: "텍스트 및 링크",
    importGroup: "가져오기",
    previewGroup: "미리보기",
    bold: "굵게",
    italic: "기울임",
    underline: "밑줄",
    clearFormat: "서식 지우기",
    settingsSectionInterface: "인터페이스",
    settingsSectionPen: "펜",
    settingsSectionWatercolor: "수채화",
    settingsSectionLayout: "레이아웃",
    settingsSectionDiagnostics: "진단",
    movePanel: "패널 이동",
    settingsLanguage: "언어",
    languageAuto: "자동",
    supportTitle: "NoteDraw 지원",
    supportSubtitle: "Alipay 또는 Binance로 스캔하여 유지 관리를 지원할 수 있습니다.",
    supportCodeAlipay: "Alipay",
    supportCodeBinance: "Binance"
  }),
  tr: Object.assign({}, I18N.en, {
    toggleCommand: "Önizleme düzenleme ve çizim modunu değiştir",
    openNoteOrWebviewFirst: "Önce bir not veya webview açın.",
    failedSaveDrawing: "Çizim verileri kaydedilemedi.",
    failedImportFile: "Dosya içe aktarılamadı.",
    editTextDraw: "Metni düzenle / çiz",
    editTextDrawHidden: "Metni düzenle / çiz (çizimler gizli)",
    editWebviewDraw: "Webview düzenle / çiz",
    selectDrawings: "Ögeleri seç",
    editMarkdownTool: "MD düzenle",
    pen: "Kalem",
    watercolorBrush: "Sulu boya fırçası",
    floatingText: "Yüzen metin",
    undoLastDrawing: "Son çizimi geri al",
    redoDrawing: "Çizimi yinele",
    deleteSelectedDrawing: "Seçileni sil",
    penSettings: "Kalem ayarları",
    advancedColor: "Gelişmiş renk",
    textGroup: "Metin ve bağlantılar",
    importGroup: "İçe aktar",
    previewGroup: "Önizleme",
    bold: "Kalın",
    italic: "İtalik",
    underline: "Altı çizili",
    clearFormat: "Biçimi temizle",
    settingsSectionInterface: "Arayüz",
    settingsSectionPen: "Kalem",
    settingsSectionWatercolor: "Suluboya",
    settingsSectionLayout: "Yerleşim",
    settingsSectionDiagnostics: "Tanılama",
    movePanel: "Paneli taşı",
    settingsLanguage: "Dil",
    languageAuto: "Otomatik",
    supportTitle: "NoteDraw'u destekle",
    supportSubtitle: "Bakımı desteklemek için Alipay veya Binance ile tarayın.",
    supportCodeAlipay: "Alipay",
    supportCodeBinance: "Binance"
  })
});
var DEFAULT_SETTINGS = {
  language: LANGUAGE_AUTO,
  drawingStorageMode: DRAWING_STORAGE_CONFIG,
  defaultPenColor: "#e53935",
  defaultPenWidth: 3,
  defaultPenOpacity: DEFAULT_PEN_OPACITY,
  defaultWatercolorColor: "#3b82f6",
  defaultWatercolorWidth: 9,
  defaultWatercolorOpacity: 0.45,
  lastToolMode: TOOL_DRAW,
  lastBrushMode: BRUSH_PEN,
  lastPenVariant: BRUSH_VARIANT_DEFAULT,
  lastWatercolorVariant: BRUSH_VARIANT_DEFAULT,
  lastTextPreset: "plain",
  lastReadingZoom: 1,
  mindMapAffectsSource: true,
  toolbarTopOffset: 6,
  longPressMs: LONG_PRESS_MS,
  selectTapDistance: SELECT_TAP_DISTANCE,
  selectStrokePadding: SELECT_STROKE_PADDING,
  selectedStrokeAlpha: SELECTED_STROKE_ALPHA,
  drawingInterpolationStep: DRAWING_INTERPOLATION_STEP_PX,
  drawingMinPointDistance: DRAWING_MIN_POINT_DISTANCE_PX,
  drawingCompactDistance: DRAWING_COMPACT_DISTANCE_PX,
  autoSaveDelayMs: 500,
  enableDebugLog: false
};
var MARKDOWN_TEXT_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,blockquote,td,th,.callout-content";
var EDITABLE_SELECTOR = [
  ".markdown-preview-view",
  ".markdown-embed-content",
  ".internal-embed"
].flatMap((root) => MARKDOWN_TEXT_SELECTOR.split(",").map((selector) => `${root} ${selector}`)).join(",");
var BLOCKED_EDIT_SELECTOR = [
  ".notedraw-button",
  ".notedraw-toolbar",
  ".notedraw-palette-panel",
  ".notedraw-brush-panel",
  ".notedraw-selection-menu",
  ".notedraw-static-canvas",
  ".notedraw-canvas",
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "pre",
  "code",
  "img",
  "svg",
  "canvas",
  ".external-embed",
  ".frontmatter",
  ".metadata-container"
].join(",");
var WEBVIEW_EDITABLE_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "blockquote",
  "td",
  "th",
  "label",
  "summary",
  "figcaption",
  "caption",
  "a",
  "span",
  "div"
].join(",");
var WEBVIEW_BLOCKED_EDIT_SELECTOR = [
  ".notedraw-button",
  ".notedraw-toolbar",
  ".notedraw-palette-panel",
  ".notedraw-brush-panel",
  ".notedraw-text-panel",
  ".notedraw-selection-menu",
  ".notedraw-embed-layer",
  ".notedraw-underlay-embed-layer",
  ".notedraw-underlay-canvas",
  ".notedraw-static-canvas",
  ".notedraw-canvas",
  "button",
  "input",
  "textarea",
  "select",
  "pre",
  "code",
  "img",
  "svg",
  "canvas",
  "video",
  "audio",
  "webview",
  "iframe"
].join(",");
var NOTEDRAW_OWNED_MUTATION_SELECTOR = [
  ".notedraw-button",
  ".notedraw-fallback-button",
  ".notedraw-webview-button",
  ".notedraw-toolbar",
  ".notedraw-palette-panel",
  ".notedraw-brush-panel",
  ".notedraw-text-panel",
  ".notedraw-selection-menu",
  ".notedraw-format-toolbar",
  ".notedraw-reading-zoom-extent",
  ".notedraw-reading-bottom-spacer",
  ".notedraw-embed-layer",
  ".notedraw-underlay-embed-layer",
  ".notedraw-underlay-canvas",
  ".notedraw-static-canvas",
  ".notedraw-canvas",
  ".notedraw-note-flow-line-spacer",
  ".notedraw-note-flow-block-spacer",
  ".notedraw-body-control",
  ".notedraw-file-input"
].join(",");
var NoteDrawFileSuggestModal = class extends FuzzySuggestModal {
  constructor(app, currentFile, onChoose, options = {}) {
    super(app);
    this.currentFile = currentFile;
    this.onChoose = onChoose;
    this.affectsSource = options.affectsSource !== false;
    this.onAffectsSourceChange = options.onAffectsSourceChange;
    this.onModalClose = options.onClose;
    this.setPlaceholder(I18N[detectNoteDrawLanguage(app)]?.chooseMindMapFile || I18N.en.chooseMindMapFile);
    const controls = this.modalEl.createDiv({ cls: "notedraw-mind-map-source-setting" });
    new Setting(controls)
      .setName(I18N[detectNoteDrawLanguage(app)]?.affectSourceNote || I18N.en.affectSourceNote)
      .addToggle((toggle) => toggle.setValue(this.affectsSource).onChange((value) => {
        this.affectsSource = Boolean(value);
        this.onAffectsSourceChange?.(this.affectsSource);
      }));
    const inputContainer = this.modalEl.querySelector(".prompt-input-container");
    inputContainer?.insertAdjacentElement("afterend", controls);
  }
  getItems() {
    const currentPath = normalizeVaultPath(this.currentFile?.path || "");
    return this.app.vault.getMarkdownFiles().slice().sort((a, b) => {
      if (a.path === currentPath) {
        return -1;
      }
      if (b.path === currentPath) {
        return 1;
      }
      return a.path.localeCompare(b.path);
    });
  }
  getItemText(file) {
    return file?.path || file?.basename || "";
  }
  onChooseItem(file) {
    this.onChoose?.(file, this.affectsSource);
  }
  onClose() {
    this.onModalClose?.(this);
  }
};
var NoteDrawPlugin = class extends Plugin {
  async onload() {
    const savedSettings = await this.loadData();
    this.runtimeDisposed = false;
    this.noteDrawSettings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...(savedSettings || {}) });
    this.controllers = /* @__PURE__ */ new WeakMap();
    this.liveControllers = /* @__PURE__ */ new Set();
    this.sourceControllers = /* @__PURE__ */ new Map();
    this.embeddedControllers = /* @__PURE__ */ new Map();
    this.webviewControllers = /* @__PURE__ */ new Map();
    this.workspaceControllers = /* @__PURE__ */ new Map();
    this.registeredSurfaceControllers = /* @__PURE__ */ new Map();
    this.registeredSurfaceRecords = /* @__PURE__ */ new Map();
    this.headerActions = /* @__PURE__ */ new Map();
    this.saveTimers = /* @__PURE__ */ new Map();
    this.saveIdleCallbacks = /* @__PURE__ */ new Map();
    this.pendingDrawingSaves = /* @__PURE__ */ new Map();
    this.drawingWritePromises = /* @__PURE__ */ new Map();
    this.suppressedDrawingSaves = [];
    this.drawingStateCache = /* @__PURE__ */ new Map();
    this.portableBundles = /* @__PURE__ */ new Map();
    this.portableBundleLoads = /* @__PURE__ */ new Map();
    this.portableResourceCache = /* @__PURE__ */ new Map();
    this.sharePackagePromises = /* @__PURE__ */ new Map();
    this.previewRenderRecovery = /* @__PURE__ */ new Map();
    this.viewDrawingActive = /* @__PURE__ */ new WeakMap();
    this.viewToolbarState = /* @__PURE__ */ new WeakMap();
    this.viewEditHistory = /* @__PURE__ */ new WeakMap();
    this.viewInteractionController = /* @__PURE__ */ new WeakMap();
    this.textSaveStates = /* @__PURE__ */ new WeakMap();
    this.apiListeners = /* @__PURE__ */ new Map();
    this.elementClipboard = null;
    this.settingsSaveTimer = null;
    this.webviewSyncTimer = null;
    this.embeddedSyncTimer = null;
    this.workspaceSyncTimer = null;
    this.surfaceSyncTimer = null;
    this.surfaceSyncIdleId = null;
    this.floatingControlsSyncTimer = null;
    this.mindMapPickerTimer = null;
    this.mindMapFileModal = null;
    this.webviewMutationObserver = null;
    this.onElementLinkClick = this.onElementLinkClick.bind(this);
    this.api = this.createPublicApi();
    if (typeof window !== "undefined") {
      window.NoteDraw = this.api;
    }
    cleanupAllDrawingHeaderButtons();
    this.addCommand({
      id: "toggle-draw-mode",
      name: this.t("toggleCommand"),
      callback: () => this.toggleActiveController()
    });
    this.addCommand({
      id: "copy-selected-elements",
      name: this.t("copyElement"),
      checkCallback: (checking) => {
        const controller = this.getActiveController();
        const available = Boolean(controller?.getSelectedStrokeIndexes().length);
        if (available && !checking) {
          controller.copySelectedElements();
        }
        return available;
      }
    });
    this.addCommand({
      id: "copy-selected-element-link",
      name: this.t("copyElementLink"),
      checkCallback: (checking) => {
        const controller = this.getActiveController();
        const available = Boolean(controller?.hasHybridSelection?.());
        if (available && !checking) {
          void controller.copySelectedElementLink();
        }
        return available;
      }
    });
    this.addCommand({
      id: "paste-elements",
      name: this.t("pasteElement"),
      checkCallback: (checking) => {
        const controller = this.getActiveController();
        const available = Boolean(controller && this.elementClipboard?.strokes?.length);
        if (available && !checking) {
          controller.pasteCopiedElements();
        }
        return available;
      }
    });
    this.addCommand({
      id: "share-notedraw-file",
      name: this.t("shareNoteDrawFile"),
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile?.();
        const available = Boolean(file && String(file.extension || "").toLowerCase() === "md");
        if (available && !checking) {
          void this.shareNoteDrawFile(file);
        }
        return available;
      }
    });
    this.addSettingTab(new NoteDrawSettingTab(this.app, this));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleSurfaceSync(90)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleSurfaceSync(40)));
    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleSurfaceSync(60)));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      this.handleVaultFileDelete(file).catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to clear deleted file NoteDraw data`, error);
      });
    }));
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      if (!file || String(file.extension || "").toLowerCase() !== "md") {
        return;
      }
      menu.addItem((item) => {
        item.setTitle(this.t("shareNoteDrawFile")).setIcon("share-2").onClick(() => {
          void this.shareNoteDrawFile(file);
        });
      });
    }));
    activeDocument.addEventListener("click", this.onElementLinkClick, true);
    this.installWebviewObserver();
    this.registerMarkdownPostProcessor((el, ctx) => {
      if (this.runtimeDisposed) {
        return;
      }
      const renderedSourcePath = resolveRenderedSourcePath(this.app, el, ctx.sourcePath);
      annotateEditableElements(el, ctx, renderedSourcePath);
      void this.hydratePortableMarkdownResources(el, renderedSourcePath);
      this.scheduleEmbeddedMarkdownSync();
      const preview = el.closest(".markdown-preview-view");
      if (!preview || isEmbeddedPreview(preview)) {
        return;
      }
      const view = findOwningMarkdownView(this.app, preview, ctx.sourcePath);
      if (!view || !view.file || !ctx.sourcePath || view.file.path !== ctx.sourcePath) {
        return;
      }
      const existingController = this.controllers.get(preview) || preview._noteDrawController;
      if (!isMarkdownPreviewVisible(view, preview)) {
        const alternateSurfaceVisible = hasVisibleAlternateWorkspaceSurface(view, preview);
        const sourceVisible = isSourceMode(view) && isMarkdownSourceVisible(view);
        if ((alternateSurfaceVisible || sourceVisible) && existingController?.plugin === this && existingController.surfaceType === "preview") {
          existingController.destroy();
        }
        if (alternateSurfaceVisible) {
          this.scheduleWebviewSync();
        }
        return;
      }
      if (existingController?.plugin === this && !existingController.destroyed && !isSourceMode(view)) {
        existingController.setFile(view.file).catch((error) => {
          console.error(`[${PLUGIN_ID}] Failed to switch preview controller file`, error);
        });
        return;
      }
      if (!isRootPreviewReady(view, preview)) {
        existingController?.destroy?.();
        resetDormantRootPreview(view, preview);
        return;
      }
      if (existingController?.destroy) {
        existingController.destroy();
      }
      cleanupDrawingUi(preview);
      const controller = new PreviewDrawingController(this, preview, view, view.file);
      this.controllers.set(preview, controller);
      controller.mount();
      this.scheduleWebviewSync();
    });
    this.runSurfaceSync();
    this.scheduleSurfaceSync(180);
  }
  onunload() {
    this.runtimeDisposed = true;
    activeDocument.removeEventListener("click", this.onElementLinkClick, true);
    for (const controller of Array.from(this.liveControllers)) {
      controller.destroy();
    }
    this.liveControllers.clear();
    this.sourceControllers.clear();
    this.embeddedControllers.clear();
    this.webviewControllers.clear();
    this.workspaceControllers.clear();
    this.registeredSurfaceControllers?.clear();
    this.registeredSurfaceRecords?.clear();
    this.portableBundles?.clear();
    this.portableBundleLoads?.clear();
    this.portableResourceCache?.clear();
    this.sharePackagePromises?.clear();
    for (const state of this.previewRenderRecovery?.values?.() || []) {
      if (state.timer !== null) {
        window.clearTimeout(state.timer);
      }
    }
    this.previewRenderRecovery?.clear?.();
    for (const state of this.headerActions.values()) {
      state.button?.remove();
    }
    this.headerActions.clear();
    cleanupAllDrawingHeaderButtons();
    for (const path of Array.from(this.pendingDrawingSaves.keys())) {
      this.cancelScheduledDrawingSave(path);
      this.flushDrawingSave(path).catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to flush drawing data during unload`, error);
      });
    }
    this.saveTimers.clear();
    this.saveIdleCallbacks.clear();
    this.suppressedDrawingSaves = [];
    if (this.settingsSaveTimer !== null) {
      window.clearTimeout(this.settingsSaveTimer);
      this.settingsSaveTimer = null;
    }
    if (this.webviewSyncTimer !== null) {
      window.clearTimeout(this.webviewSyncTimer);
      this.webviewSyncTimer = null;
    }
    if (this.embeddedSyncTimer !== null) {
      window.clearTimeout(this.embeddedSyncTimer);
      this.embeddedSyncTimer = null;
    }
    if (this.workspaceSyncTimer !== null) {
      window.clearTimeout(this.workspaceSyncTimer);
      this.workspaceSyncTimer = null;
    }
    if (this.surfaceSyncTimer !== null) {
      window.clearTimeout(this.surfaceSyncTimer);
      this.surfaceSyncTimer = null;
    }
    if (this.surfaceSyncIdleId !== null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(this.surfaceSyncIdleId);
      this.surfaceSyncIdleId = null;
    }
    if (this.floatingControlsSyncTimer !== null) {
      window.clearTimeout(this.floatingControlsSyncTimer);
      this.floatingControlsSyncTimer = null;
    }
    if (this.mindMapPickerTimer !== null) {
      window.clearTimeout(this.mindMapPickerTimer);
      this.mindMapPickerTimer = null;
    }
    this.mindMapFileModal?.close?.();
    this.mindMapFileModal = null;
    this.webviewMutationObserver?.disconnect();
    this.webviewMutationObserver = null;
    this.apiListeners?.clear();
    if (typeof window !== "undefined" && window.NoteDraw === this.api) {
      delete window.NoteDraw;
    }
  }
  runSurfaceSync() {
    if (this.runtimeDisposed) {
      return;
    }
    this.pruneDisconnectedControllers();
    this.syncRenderedMarkdownAnnotations();
    this.syncSourceControllers();
    this.syncMarkdownControllerModes();
    this.syncEmbeddedMarkdownControllers();
    this.syncWebviewControllers();
    this.syncWorkspaceControllers();
    for (const controller of this.liveControllers) {
      this.reconcileControllerActivation(controller);
      if (!controller.button?.isConnected) {
        controller.button = this.installHeaderButton(controller);
      }
      controller.syncFloatingControlClasses();
      if (isElementVisibleEnough(controller.previewEl)) {
        controller.scheduleFrozenNoteFlowLayoutRestore();
        controller.scheduleResize({ layout: false, measure: false });
      }
    }
  }
  scheduleSurfaceSync(delay = 80) {
    if (this.runtimeDisposed || this.surfaceSyncTimer !== null || this.surfaceSyncIdleId !== null) {
      return;
    }
    this.surfaceSyncTimer = window.setTimeout(() => {
      this.surfaceSyncTimer = null;
      const run = () => {
        this.surfaceSyncIdleId = null;
        this.runSurfaceSync();
      };
      if (typeof window.requestIdleCallback === "function") {
        this.surfaceSyncIdleId = window.requestIdleCallback(run, { timeout: 400 });
      } else {
        run();
      }
    }, Math.max(0, Number(delay) || 0));
  }
  scheduleMindMapFilePicker(controller) {
    if (this.mindMapPickerTimer !== null) {
      window.clearTimeout(this.mindMapPickerTimer);
    }
    this.mindMapPickerTimer = window.setTimeout(() => {
      this.mindMapPickerTimer = null;
      if (!this.runtimeDisposed) {
        this.openMindMapFilePicker(controller);
      }
    }, 48);
  }
  openMindMapFilePicker(requestedController) {
    const requestedPath = normalizeVaultPath(requestedController?.file?.path || this.app.workspace.getActiveFile?.()?.path || "");
    const currentFile = getVaultFileByPath(this.app.vault, requestedPath) || requestedController?.file || this.app.workspace.getActiveFile?.();
    const previousModal = this.mindMapFileModal;
    this.mindMapFileModal = null;
    if (previousModal?.modalEl?.isConnected) {
      previousModal.close();
    }
    const affectsSourceByDefault = this.noteDrawSettings?.mindMapAffectsSource !== false;
    const modal = new NoteDrawFileSuggestModal(this.app, currentFile, (file, affectsSource) => {
      const target = !requestedController?.destroyed && requestedController?.previewEl?.isConnected
        ? requestedController
        : this.getActiveController() || this.getAllControllers().find((controller) => (
          controller?.previewEl?.isConnected && normalizeVaultPath(controller.file?.path || "") === requestedPath && !controller.embeddedSurface
        ));
      if (!target) {
        new Notice(this.t("openNoteOrWebviewFirst"));
        return;
      }
      target.pendingMindMapFile = file;
      target.pendingMindMapOptions = { affectsSource: Boolean(affectsSource) };
      target.textPreset = "mindMap";
      target.setTextMode();
      target.syncTextPanelButtons();
      new Notice(this.t("placeMindMap"));
    }, {
      affectsSource: affectsSourceByDefault,
      onAffectsSourceChange: (value) => {
        this.noteDrawSettings.mindMapAffectsSource = Boolean(value);
        this.scheduleSettingsSave();
      },
      onClose: (closedModal) => {
        if (this.mindMapFileModal === closedModal) {
          this.mindMapFileModal = null;
        }
      }
    });
    this.mindMapFileModal = modal;
    modal.open();
  }
  async saveSettings() {
    this.noteDrawSettings = sanitizeSettings(this.noteDrawSettings);
    await this.saveData(this.noteDrawSettings);
    for (const controller of this.getAllControllers()) {
      controller.applySettings();
      controller.refreshLocalizedLabels?.();
    }
    this.refreshLocalizedButtons();
  }
  async changeDrawingStorageMode(value) {
    const nextMode = normalizeDrawingStorageMode(value);
    const previousMode = normalizeDrawingStorageMode(this.noteDrawSettings?.drawingStorageMode);
    if (nextMode === previousMode) {
      return;
    }
    const activeFile = this.app.workspace.getActiveFile?.();
    const interactionController = this.getActiveController();
    const activeController = normalizeVaultPath(interactionController?.file?.path || "") === normalizeVaultPath(activeFile?.path || "")
      ? interactionController
      : this.getAllControllers().find((controller) => {
      return normalizeVaultPath(controller?.file?.path || "") === normalizeVaultPath(activeFile?.path || "");
      });
    const activeSnapshot = activeFile && activeController?.drawingData
      ? normalizeDrawingDataForStorage(activeController.drawingData, activeFile)
      : null;
    for (const path of Array.from(this.pendingDrawingSaves.keys())) {
      this.cancelScheduledDrawingSave(path);
      await this.flushDrawingSave(path);
    }
    this.noteDrawSettings.drawingStorageMode = nextMode;
    this.drawingStateCache.clear();
    await this.saveSettings();
    if (activeSnapshot) {
      await this.writeDrawings(activeFile, activeSnapshot);
    }
    this.scheduleSurfaceSync(40);
  }
  scheduleSettingsSave() {
    if (this.settingsSaveTimer !== null) {
      window.clearTimeout(this.settingsSaveTimer);
    }
    this.settingsSaveTimer = window.setTimeout(() => {
      this.settingsSaveTimer = null;
      this.saveSettings().catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to save settings`, error);
      });
    }, SETTINGS_SAVE_DELAY_MS);
  }
  t(key, vars = {}) {
    return translateNoteDraw(this, key, vars);
  }
  setAccessibleLabel(element, key, vars = {}) {
    setAccessibleLabel(element, this.t(key, vars));
  }
  refreshLocalizedButtons() {
    for (const state of this.headerActions.values()) {
      const controller = state.button?._noteDrawController || state.controller;
      this.setAccessibleLabel(state.button, controller?.surfaceType === "webview" ? "editWebviewDraw" : "editTextDraw");
    }
    for (const controller of this.webviewControllers.values()) {
      this.setAccessibleLabel(controller.button, "editWebviewDraw");
    }
  }
  getAllControllers() {
    const controllers = Array.from(this.liveControllers).filter((controller) => !controller.destroyed);
    activeDocument.querySelectorAll(".notedraw-shell").forEach((element) => {
      const controller = element._noteDrawController;
      if (controller?.plugin === this && !controllers.includes(controller)) {
        controllers.push(controller);
      }
    });
    return controllers;
  }
  pruneDisconnectedControllers() {
    for (const controller of Array.from(this.liveControllers)) {
      if (controller.destroyed || !controller.previewEl?.isConnected) {
        controller.destroy();
      }
    }
  }
  registeredSurfaceSelector(record) {
    return {
      owner: record.owner,
      id: record.id,
      surfaceId: record.id,
      surfaceKey: record.key,
      surface: "registered",
      path: record.file?.path
    };
  }
  mergeRegisteredSurfaceOptions(record, options = {}) {
    return { ...this.registeredSurfaceSelector(record), ...options };
  }
  registerApiSurface(options = {}) {
    const record = normalizeRegisteredSurfaceOptions(this.app, options);
    const existing = this.registeredSurfaceControllers.get(record.key);
    if (existing && !existing.destroyed && existing.previewEl !== record.host) {
      existing.destroy();
    }
    const active = this.registeredSurfaceControllers.get(record.key);
    if (active && !active.destroyed && active.previewEl === record.host) {
      active.registeredSurfaceOwner = record.owner;
      active.registeredSurfaceId = record.id;
      active.registeredSurfaceKey = record.key;
      active.registeredSurfaceSource = record.source;
      active.registeredSurfaceCapabilities = record.capabilities;
      active.registeredSurfaceViewport = record.viewport;
      active.disposeRegisteredSurfaceViewport?.();
      active.disposeRegisteredSurfaceViewport = this.bindRegisteredSurfaceViewport(active, record.viewport);
      const ready = active.setFile(record.file).catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to update registered surface file`, error);
        throw error;
      });
      const handle = this.createRegisteredSurfaceHandle(record, active, ready);
      record.controller = active;
      record.handle = handle;
      this.registeredSurfaceRecords.set(record.key, record);
      return handle;
    }
    const mountedOnElement = this.controllers.get(record.host) || record.host._noteDrawController;
    if (mountedOnElement?.plugin === this && mountedOnElement !== active) {
      mountedOnElement.destroy();
    }
    cleanupDrawingUi(record.host);
    const controller = new PreviewDrawingController(this, record.host, record.view, record.file, {
      allowTextEdit: record.capabilities.textEditing !== false,
      surfaceType: "registered",
      registeredSurface: true,
      registeredSurfaceOwner: record.owner,
      registeredSurfaceId: record.id,
      registeredSurfaceKey: record.key,
      registeredSurfaceSource: record.source,
      registeredSurfaceCapabilities: record.capabilities,
      registeredSurfaceViewport: record.viewport
    });
    this.controllers.set(record.host, controller);
    this.registeredSurfaceControllers.set(record.key, controller);
    controller.disposeRegisteredSurfaceViewport = this.bindRegisteredSurfaceViewport(controller, record.viewport);
    record.controller = controller;
    const ready = controller.mount().catch((error) => {
      console.error(`[${PLUGIN_ID}] Failed to mount registered surface`, error);
      this.destroyRegisteredSurface(record.key);
      throw error;
    });
    const handle = this.createRegisteredSurfaceHandle(record, controller, ready);
    record.handle = handle;
    this.registeredSurfaceRecords.set(record.key, record);
    return handle;
  }
  createRegisteredSurfaceHandle(record, controller, ready) {
    const plugin = this;
    const withSurface = (options = {}) => plugin.mergeRegisteredSurfaceOptions(record, options);
    return {
      apiVersion: "1.0",
      ready: Promise.resolve(ready).then(() => void 0),
      capabilities: { ...record.capabilities },
      get surface() {
        return plugin.describeController(controller);
      },
      activate: async (toolOrOptions = {}) => {
        const options = typeof toolOrOptions === "string" ? { tool: toolOrOptions } : toolOrOptions || {};
        return plugin.activateApi(withSurface(options));
      },
      deactivate: () => plugin.deactivateApi(withSurface()),
      toggle: async (options = {}) => plugin.toggleApi(withSurface(options)),
      getState: async (options = {}) => plugin.getApiState(withSurface(options)),
      setVisibility: async (visible, options = {}) => plugin.setApiVisibility(visible, withSurface(options)),
      setTool: (tool, options = {}) => plugin.setApiTool(tool, withSurface(options)),
      setBrush: (options = {}) => plugin.setApiBrush(withSurface(options)),
      setTextPreset: (preset, options = {}) => plugin.setApiTextPreset(preset, withSurface(options)),
      getZoom: () => plugin.describeController(controller)?.zoom ?? 1,
      setZoom: (zoom, options = {}) => plugin.setApiZoom(zoom, withSurface(options)),
      execute: async (actions, options = {}) => plugin.executeApiAction(actions, withSurface(options)),
      getElements: async (options = {}) => plugin.getApiElements(withSurface(options)),
      selectElements: async (options = {}) => plugin.selectApiElements(withSurface(options)),
      updateElements: async (options = {}) => plugin.updateApiElements(withSurface(options)),
      deleteElements: async (options = {}) => plugin.deleteApiElements(withSurface(options)),
      reorderElements: async (options = {}) => plugin.reorderApiElements(withSurface(options)),
      setElementsLocked: async (options = {}) => plugin.setApiElementsLocked(withSurface(options)),
      setElementsNoteFlow: async (options = {}) => plugin.setApiElementsNoteFlow(withSurface(options)),
      undo: async (options = {}) => plugin.runApiHistory("undo", withSurface(options)),
      redo: async (options = {}) => plugin.runApiHistory("redo", withSurface(options)),
      copyElements: (options = {}) => plugin.copyElementsApi(withSurface(options)),
      copyElementLink: (options = {}) => controller.copySelectedElementLink({ quiet: Boolean(options.quiet) }),
      pasteElements: (options = {}) => plugin.pasteElementsApi(withSurface(options)),
      insertMindMap: async (options = {}) => plugin.insertMindMapApi(withSurface(options)),
      refresh: async () => {
        const data = await plugin.readDrawings(record.file);
        return { ok: true, refreshed: plugin.refreshControllersForFile(record.file, data) };
      },
      on: (eventName, listener) => plugin.onApiEvent(eventName, (detail) => {
        if (typeof listener !== "function") {
          return;
        }
        if (detail?.surfaceKey === record.key || detail?.owner === record.owner && detail?.id === record.id) {
          listener(detail);
        }
      }),
      destroy: () => plugin.destroyRegisteredSurface(record.key)
    };
  }
  bindRegisteredSurfaceViewport(controller, viewport = {}) {
    if (typeof viewport?.onChange !== "function") {
      return () => void 0;
    }
    try {
      const dispose = viewport.onChange(() => {
        if (controller.destroyed) {
          return;
        }
        controller.scheduleLayoutRefresh({ settle: false });
        controller.requestRender(true);
        this.emitApiEvent("surface-changed", { ...this.describeController(controller), phase: "viewport" });
      });
      return typeof dispose === "function" ? dispose : () => void 0;
    } catch (error) {
      console.error(`[${PLUGIN_ID}] Failed to subscribe to registered surface viewport`, error);
      return () => void 0;
    }
  }
  destroyRegisteredSurface(key) {
    const normalizedKey = String(key || "");
    const controller = this.registeredSurfaceControllers?.get(normalizedKey);
    this.registeredSurfaceControllers?.delete(normalizedKey);
    this.registeredSurfaceRecords?.delete(normalizedKey);
    if (controller && !controller.destroyed) {
      controller.destroy();
    }
    return { ok: true };
  }
  controllerActivationState(controller) {
    const key = this.controllerStateKey(controller);
    return key ? Boolean(this.viewDrawingActive.get(key)) : false;
  }
  controllerStateKey(controller) {
    const view = controller?.view;
    return view?.leaf || findOwningLeaf(this.app, view?.containerEl || controller?.previewEl) || view || controller?.previewEl || null;
  }
  controllerToolbarState(controller) {
    const key = this.controllerStateKey(controller);
    return key ? this.viewToolbarState.get(key) || null : null;
  }
  interactionController(controller) {
    const key = this.controllerStateKey(controller);
    const preferred = key ? this.viewInteractionController.get(key) : null;
    if (preferred && !preferred.destroyed && preferred.previewEl?.isConnected && isElementVisibleEnough(preferred.previewEl)) {
      return preferred;
    }
    const fallback = Array.from(this.liveControllers).find((candidate) => {
      return !candidate.destroyed && !candidate.embeddedSurface && candidate.previewEl?.isConnected && this.controllerStateKey(candidate) === key && isElementVisibleEnough(candidate.previewEl);
    }) || controller;
    if (key && fallback) {
      this.viewInteractionController.set(key, fallback);
    }
    return fallback;
  }
  setInteractionController(controller) {
    const key = this.controllerStateKey(controller);
    if (!key) {
      return;
    }
    this.viewInteractionController.set(key, controller);
    for (const candidate of this.liveControllers) {
      if (!candidate.destroyed && this.controllerStateKey(candidate) === key) {
        candidate.syncFloatingControlClasses();
      }
    }
  }
  enforceSingleVisibleToolbar(controller) {
    if (!controller?.toolbar?.isConnected) {
      return;
    }
    const ownedToolbars = new Set();
    for (const candidate of this.liveControllers) {
      if (candidate.destroyed || !candidate.toolbar?.isConnected) {
        continue;
      }
      ownedToolbars.add(candidate.toolbar);
      if (candidate !== controller) {
        candidate.previewEl?.removeClass("is-notedraw-controls-visible");
        for (const element of [candidate.toolbar, candidate.palettePanel, candidate.brushPanel, candidate.textPanel, candidate.selectionMenu, candidate.formatToolbar]) {
          element?.removeClass("is-notedraw-controls-visible");
        }
        candidate.toolbar.setAttribute("aria-hidden", "true");
      }
    }
    controller.toolbar.removeAttribute("aria-hidden");
    for (const toolbar of activeDocument.querySelectorAll(".notedraw-toolbar")) {
      if (!ownedToolbars.has(toolbar)) {
        toolbar.remove();
      } else if (toolbar !== controller.toolbar) {
        toolbar.removeClass("is-notedraw-controls-visible");
        toolbar.setAttribute("aria-hidden", "true");
      }
    }
  }
  findEmbeddedStrokeControllerAtPoint(controller, event) {
    const key = this.controllerStateKey(controller);
    for (const candidate of this.liveControllers) {
      if (
        candidate === controller || candidate.destroyed || !candidate.embeddedSurface || !candidate.active ||
        !candidate.drawingsVisible || !candidate.previewEl?.isConnected || this.controllerStateKey(candidate) !== key
      ) {
        continue;
      }
      const rect = candidate.canvas?.getBoundingClientRect?.();
      if (!rect || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
        continue;
      }
      if (candidate.findStrokeAt(candidate.eventToPoint(event), { x: event.clientX, y: event.clientY }) >= 0) {
        return candidate;
      }
    }
    return null;
  }
  setControllerToolbarState(controller, state) {
    const key = this.controllerStateKey(controller);
    if (!key) {
      return;
    }
    const next = {
      ...(this.viewToolbarState.get(key) || {}),
      ...state
    };
    this.viewToolbarState.set(key, next);
    for (const candidate of this.liveControllers) {
      if (!candidate.destroyed && candidate !== controller && this.controllerStateKey(candidate) === key) {
        candidate.applySharedToolbarState(next);
      }
    }
  }
  controllerHistoryState(controller) {
    const key = this.controllerStateKey(controller);
    if (!key) {
      return null;
    }
    let state = this.viewEditHistory.get(key);
    if (!state) {
      state = { undo: [], redo: [] };
      this.viewEditHistory.set(key, state);
    }
    return state;
  }
  recordControllerHistory(controller, entry, options = {}) {
    const state = this.controllerHistoryState(controller);
    if (!state || !entry) {
      return;
    }
    const last = state.undo[state.undo.length - 1];
    if (options.coalesceKey && last?.coalesceKey === options.coalesceKey && last.kind === entry.kind && last.file?.path === entry.file?.path) {
      last.after = entry.after;
    } else {
      state.undo.push({ ...entry, coalesceKey: options.coalesceKey || null });
      if (state.undo.length > 100) {
        state.undo.shift();
      }
    }
    state.redo = [];
  }
  async undoControllerHistory(controller) {
    const state = this.controllerHistoryState(controller);
    const entry = state?.undo.pop();
    if (!entry) {
      return false;
    }
    if (!await this.applyControllerHistoryEntry(entry, "before")) {
      state.undo.push(entry);
      return false;
    }
    state.redo.push(entry);
    return true;
  }
  async redoControllerHistory(controller) {
    const state = this.controllerHistoryState(controller);
    const entry = state?.redo.pop();
    if (!entry) {
      return false;
    }
    if (!await this.applyControllerHistoryEntry(entry, "after")) {
      state.redo.push(entry);
      return false;
    }
    state.undo.push(entry);
    return true;
  }
  async applyControllerHistoryEntry(entry, direction) {
    if (entry.kind === "compound") {
      const markdownFile = getVaultFileByPath(this.app.vault, entry.markdownFile?.path);
      const drawingFile = getVaultFileByPath(this.app.vault, entry.drawingFile?.path) || entry.drawingFile;
      if (!markdownFile || !drawingFile) {
        return false;
      }
      const current = await this.app.vault.read(markdownFile);
      const expected = direction === "before" ? entry.markdownAfter : entry.markdownBefore;
      if (current !== String(expected || "")) {
        return false;
      }
      await this.app.vault.modify(markdownFile, String(direction === "before" ? entry.markdownBefore : entry.markdownAfter || ""));
      const data = cloneDrawingData(direction === "before" ? entry.drawingBefore : entry.drawingAfter, drawingFile);
      this.scheduleDrawingSave(drawingFile, data, { replace: true });
      this.emitApiEvent("markdown-changed", { file: markdownFile.path, history: direction });
      return true;
    }
    if (entry.kind === "drawing") {
      const data = cloneDrawingData(entry[direction], entry.file);
      this.scheduleDrawingSave(entry.file, data, { replace: true });
      return true;
    }
    if (entry.kind === "markdown") {
      const file = getVaultFileByPath(this.app.vault, entry.file?.path);
      if (!file) {
        return false;
      }
      const current = await this.app.vault.read(file);
      const expected = direction === "before" ? entry.after : entry.before;
      if (current !== String(expected || "")) {
        return false;
      }
      await this.app.vault.modify(file, String(entry[direction] || ""));
      this.emitApiEvent("markdown-changed", { file: file.path, history: direction });
      return true;
    }
    return false;
  }
  setControllerActivation(controller, active) {
    const key = this.controllerStateKey(controller);
    const enabled = Boolean(active);
    if (key) {
      this.viewDrawingActive.set(key, enabled);
    }
    this.reconcileControllerActivation(controller);
  }
  reconcileControllerActivation(controller = null) {
    const key = this.controllerStateKey(controller);
    if (!key) {
      return null;
    }
    const candidates = Array.from(this.liveControllers).filter((candidate) => {
      return !candidate.destroyed && this.controllerStateKey(candidate) === key;
    });
    const enabled = Boolean(this.viewDrawingActive.get(key));
    const visible = candidates.filter((candidate) => {
      return !candidate.embeddedSurface && candidate.previewEl?.isConnected && isElementVisibleEnough(candidate.previewEl);
    });
    const preferred = enabled
      ? visible.find((candidate) => candidate === controller)
        || visible.find((candidate) => candidate === this.viewInteractionController.get(key))
        || visible[0]
        || (controller && !controller.embeddedSurface && controller.previewEl?.isConnected ? controller : null)
      : null;
    for (const candidate of candidates) {
      const nextActive = Boolean(enabled && candidate === preferred);
      if (candidate.active !== nextActive) {
        candidate.applyActiveState(nextActive, { eager: nextActive || !enabled });
      }
    }
    if (preferred) {
      this.setInteractionController(preferred);
    }
    return preferred;
  }
  installWebviewObserver() {
    if (typeof MutationObserver === "undefined" || !activeDocument?.body) {
      return;
    }
    this.webviewMutationObserver = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => isEmbeddedSurfaceSyncMutation(mutation))) {
        this.scheduleEmbeddedMarkdownSync();
      }
      if (mutations.some((mutation) => isWebviewSyncMutation(mutation))) {
        this.scheduleWebviewSync();
      }
      if (mutations.some((mutation) => isWorkspaceSurfaceMutation(mutation))) {
        this.scheduleWorkspaceSync();
      }
      if (mutations.some((mutation) => isFloatingControlsVisibilityMutation(mutation))) {
        this.scheduleFloatingControlsSync();
      }
    });
    this.webviewMutationObserver.observe(activeDocument.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-url", "src", "class"]
    });
  }
  scheduleFloatingControlsSync() {
    if (this.floatingControlsSyncTimer !== null) {
      return;
    }
    this.floatingControlsSyncTimer = window.setTimeout(() => {
      this.floatingControlsSyncTimer = null;
      for (const controller of this.liveControllers) {
        controller.syncFloatingControlClasses();
      }
    }, 40);
  }
  scheduleWebviewSync() {
    if (this.webviewSyncTimer !== null) {
      return;
    }
    this.webviewSyncTimer = window.setTimeout(() => {
      this.webviewSyncTimer = null;
      this.syncWebviewControllers();
    }, 120);
  }
  scheduleEmbeddedMarkdownSync() {
    if (this.runtimeDisposed) {
      return;
    }
    if (this.embeddedSyncTimer !== null) {
      window.clearTimeout(this.embeddedSyncTimer);
    }
    this.embeddedSyncTimer = window.setTimeout(() => {
      this.embeddedSyncTimer = null;
      if (!this.runtimeDisposed) {
        this.syncEmbeddedMarkdownControllers();
      }
    }, 80);
  }
  scheduleWorkspaceSync() {
    if (this.workspaceSyncTimer !== null) {
      window.clearTimeout(this.workspaceSyncTimer);
    }
    this.workspaceSyncTimer = window.setTimeout(() => {
      this.workspaceSyncTimer = null;
      this.syncWorkspaceControllers();
    }, 100);
  }
  createPublicApi() {
    const capabilities = Object.freeze({
      responsiveCoordinates: RESPONSIVE_POINT_BASIS,
      responsiveElements: ELEMENT_LAYOUT_BASIS,
      embeddedMarkdownEditing: true,
      readingViewEditing: true,
      sourceViewEditing: true,
      readingViewZoom: true,
      sourceViewLayoutZoom: true,
      workspaceSurfaces: true,
      imageWorkspaceSurfaces: true,
      registeredSurfaces: true,
      surfaceHandles: true,
      elementClipboard: true,
      readingNoteFlow: true,
      editableMindMaps: true,
      boundConnectors: true,
      persistentHeaderActions: true,
      stateBackedWorkspaceSurfaces: true,
      agentActions: true,
      settingsApi: true,
      drawingDataExchange: ["read", "parse", "serialize"],
      brushVariants: {
        [BRUSH_PEN]: [BRUSH_VARIANT_DEFAULT, PEN_VARIANT_FOUNTAIN, PEN_VARIANT_NOTE],
        [BRUSH_WATERCOLOR]: [BRUSH_VARIANT_DEFAULT, WATERCOLOR_VARIANT_TEXT, WATERCOLOR_VARIANT_STRAIGHT]
      },
      events: ["drawings-changed", "markdown-changed", "surface-changed"],
      tools: [TOOL_DRAW, TOOL_SELECT, TOOL_EDIT_MD, TOOL_TEXT],
      sources: ["vault", "url", "virtual"],
      surfaceActions: ["activate", "deactivate", "toggle", "set-visibility", "refresh"],
      elementActions: ["get", "select", "update", "delete", "reorder", "set-locked", "set-note-flow", "copy", "copy-link", "paste"],
      historyActions: ["undo", "redo"]
    });
    const drawingData = Object.freeze({
      read: async (fileOrPath, options = {}) => this.readDrawingDataApi(fileOrPath, options),
      parse: async (input, options = {}) => this.parseDrawingDataApi(input, options),
      serialize: async (data, options = {}) => this.serializeDrawingDataApi(data, options)
    });
    const v1 = {
      apiVersion: "1.0",
      capabilities,
      drawingData,
      resolveFile: (fileOrPath, sourcePath = "") => this.resolveApiFile(fileOrPath, sourcePath),
      registerSurface: (options = {}) => this.registerApiSurface(options),
      listSurfaces: () => this.getAllControllers().map((controller) => this.describeController(controller)),
      getActiveSurface: () => this.describeController(this.getActiveController()),
      getState: (options = {}) => this.getApiState(options),
      activate: async (options = {}) => this.activateApi(options),
      deactivate: (options = {}) => this.deactivateApi(options),
      toggle: async (options = {}) => this.toggleApi(options),
      setVisibility: async (visible, options = {}) => this.setApiVisibility(visible, options),
      setTool: (tool, options = {}) => this.setApiTool(tool, options),
      setBrush: (options = {}) => this.setApiBrush(options),
      setTextPreset: (preset, options = {}) => this.setApiTextPreset(preset, options),
      getZoom: (options = {}) => this.describeController(this.findApiController(options))?.zoom ?? 1,
      setZoom: (zoom, options = {}) => this.setApiZoom(zoom, options),
      getElements: async (options = {}) => this.getApiElements(options),
      selectElements: async (options = {}) => this.selectApiElements(options),
      updateElements: async (options = {}) => this.updateApiElements(options),
      deleteElements: async (options = {}) => this.deleteApiElements(options),
      reorderElements: async (options = {}) => this.reorderApiElements(options),
      setElementsLocked: async (options = {}) => this.setApiElementsLocked(options),
      setElementsNoteFlow: async (options = {}) => this.setApiElementsNoteFlow(options),
      undo: async (options = {}) => this.runApiHistory("undo", options),
      redo: async (options = {}) => this.runApiHistory("redo", options),
      getSettings: () => ({ ...this.noteDrawSettings }),
      updateSettings: async (patch = {}) => this.updateApiSettings(patch),
      execute: async (action, options = {}) => this.executeApiAction(action, options),
      readDrawings: async (fileOrPath) => {
        const file = this.resolveApiFile(fileOrPath);
        if (!file) {
          throw new Error("NoteDraw could not resolve the requested file");
        }
        return this.readDrawings(file);
      },
      readDrawingData: drawingData.read,
      parseDrawingData: drawingData.parse,
      serializeDrawingData: drawingData.serialize,
      writeDrawings: async (fileOrPath, data) => {
        const file = this.resolveApiFile(fileOrPath);
        if (!file) {
          throw new Error("NoteDraw could not resolve the requested file");
        }
        const normalized = normalizeDrawingData(data, file);
        await this.writeDrawings(file, normalized);
        this.refreshControllersForFile(file, normalized);
        return normalized;
      },
      getStoragePaths: (fileOrPath) => {
        const file = this.resolveApiFile(fileOrPath);
        return file ? {
          current: this.drawingPathForFile(file),
          legacy: this.legacyDrawingPathForFile(file)
        } : null;
      },
      replaceText: async (options) => this.replaceTextApi(options),
      insertStroke: async (fileOrPath, stroke) => this.insertStrokeApi(fileOrPath, stroke),
      copyElements: (options = {}) => this.copyElementsApi(options),
      copyElementLink: (options = {}) => this.findApiController(options)?.copySelectedElementLink({ quiet: Boolean(options.quiet) }) || { ok: false, reason: "surface-not-found" },
      pasteElements: (options = {}) => this.pasteElementsApi(options),
      insertMindMap: async (options = {}) => this.insertMindMapApi(options),
      refresh: async (fileOrPath) => {
        const file = this.resolveApiFile(fileOrPath);
        if (!file) {
          return { ok: false, reason: "missing-file" };
        }
        const data = await this.readDrawings(file);
        return { ok: true, refreshed: this.refreshControllersForFile(file, data) };
      },
      injectExportSnapshot: async (fileOrPath, container) => {
        const file = this.resolveApiFile(fileOrPath);
        return file ? this.injectExportSnapshot(file, container) : null;
      },
      on: (eventName, listener) => this.onApiEvent(eventName, listener)
    };
    return {
      version: "3.4.19",
      apiVersion: v1.apiVersion,
      capabilities,
      v1,
      drawingData,
      resolveFile: v1.resolveFile,
      registerSurface: v1.registerSurface,
      listSurfaces: v1.listSurfaces,
      getActiveSurface: v1.getActiveSurface,
      getState: v1.getState,
      activate: v1.activate,
      deactivate: v1.deactivate,
      toggle: v1.toggle,
      setVisibility: v1.setVisibility,
      setTool: v1.setTool,
      setBrush: v1.setBrush,
      setTextPreset: v1.setTextPreset,
      getZoom: v1.getZoom,
      setZoom: v1.setZoom,
      getElements: v1.getElements,
      selectElements: v1.selectElements,
      updateElements: v1.updateElements,
      deleteElements: v1.deleteElements,
      reorderElements: v1.reorderElements,
      setElementsLocked: v1.setElementsLocked,
      setElementsNoteFlow: v1.setElementsNoteFlow,
      undo: v1.undo,
      redo: v1.redo,
      getSettings: v1.getSettings,
      updateSettings: v1.updateSettings,
      execute: v1.execute,
      getActiveController: () => this.getActiveController(),
      readDrawings: v1.readDrawings,
      readDrawingData: v1.readDrawingData,
      parseDrawingData: v1.parseDrawingData,
      serializeDrawingData: v1.serializeDrawingData,
      writeDrawings: v1.writeDrawings,
      getStoragePaths: v1.getStoragePaths,
      refresh: v1.refresh,
      injectExportSnapshot: v1.injectExportSnapshot,
      replaceSelectionText: async (file, originalText, editedText) => this.replaceTextApi({ file, originalText, editedText }),
      insertStroke: v1.insertStroke,
      copyElements: v1.copyElements,
      copyElementLink: v1.copyElementLink,
      pasteElements: v1.pasteElements,
      insertMindMap: v1.insertMindMap,
      on: v1.on
    };
  }
  resolveApiFile(fileOrPath, sourcePath = "") {
    if (fileOrPath && typeof fileOrPath === "object" && typeof fileOrPath.path === "string") {
      return getVaultFileByPath(this.app.vault, fileOrPath.path) || fileOrPath;
    }
    const path = normalizeVaultPath(fileOrPath);
    if (!path) {
      return null;
    }
    const surfaceFile = this.getAllControllers().find((controller) => normalizeVaultPath(controller.file?.path) === path)?.file;
    return getVaultFileByPath(this.app.vault, path) || surfaceFile || this.app.metadataCache.getFirstLinkpathDest?.(path, sourcePath || "") || null;
  }
  async readDrawingDataApi(fileOrPath, options = {}) {
    const file = this.resolveApiFile(fileOrPath, options.sourcePath || "");
    if (!file) {
      throw new Error("NoteDraw could not resolve the requested file");
    }
    const key = normalizeVaultPath(file.path);
    const controller = this.getAllControllers().find((candidate) => (
      normalizeVaultPath(candidate?.file?.path || "") === key && candidate?.drawingsLoaded && candidate?.drawingData
    ));
    const drawing = normalizeDrawingDataForStorage(
      controller?.drawingData || await this.readDrawings(file, { migrateLegacy: false }),
      file
    );
    if (options.includeResources === false) {
      return clonePortableValue({
        format: "notedraw-portable",
        version: 1,
        purpose: "storage",
        sourcePath: key,
        updatedAt: drawing.updatedAt || null,
        drawing,
        resources: [],
        skippedResources: []
      });
    }
    const sourceMarkdown = typeof options.sourceMarkdown === "string"
      ? options.sourceMarkdown
      : await this.app.vault.cachedRead(file);
    return clonePortableValue(await this.createPortableBundle(file, drawing, {
      purpose: options.purpose === "share" ? "share" : "storage",
      sourceMarkdown,
      includeMarkdownLinks: options.includeMarkdownLinks === true
    }));
  }
  async parseDrawingDataApi(input, options = {}) {
    let value = input;
    if (typeof value === "string") {
      const decoded = await decodeNotedrawDataBlock(value);
      if (decoded) {
        value = decoded;
      } else {
        try {
          value = JSON.parse(value);
        } catch {
          throw new Error("NoteDraw data is neither an embedded block nor valid JSON");
        }
      }
    }
    const sourcePath = normalizeVaultPath(
      options.sourcePath || options.file?.path || value?.sourcePath || value?.drawing?.sourcePath || "NoteDraw.md"
    ) || "NoteDraw.md";
    const file = this.resolveApiFile(options.file || sourcePath) || createDrawingDataFile(sourcePath);
    const bundle = value?.drawing
      ? normalizePortableBundle(value, file)
      : normalizePortableBundle({
        format: "notedraw-portable",
        version: 1,
        purpose: "storage",
        sourcePath,
        updatedAt: value?.updatedAt || null,
        drawing: value,
        resources: options.resources || []
      }, file);
    if (!bundle) {
      throw new Error("NoteDraw data is invalid");
    }
    return clonePortableValue(bundle);
  }
  async serializeDrawingDataApi(input, options = {}) {
    const bundle = await this.parseDrawingDataApi(input, options);
    const format = String(options.format || "json").trim().toLowerCase();
    if (format === "object") {
      return bundle;
    }
    if (format === "json") {
      return JSON.stringify(bundle, null, options.pretty === false ? 0 : 2);
    }
    if (format === "block") {
      return encodeNotedrawDataBlock(bundle, { compress: options.compress !== false });
    }
    if (format === "markdown") {
      return appendNotedrawDataBlock(options.markdown || "", bundle, { compress: options.compress !== false });
    }
    throw new Error(`Unsupported NoteDraw serialization format: ${format}`);
  }
  registeredSurfaceViewportState(controller) {
    const viewport = controller?.registeredSurfaceViewport;
    if (!viewport) {
      return null;
    }
    let zoom = null;
    let scroll = null;
    try {
      if (typeof viewport.getZoom === "function") {
        const value = Number(viewport.getZoom());
        zoom = Number.isFinite(value) && value > 0 ? value : null;
      }
    } catch (error) {
      void error;
    }
    try {
      if (typeof viewport.getScroll === "function") {
        const value = viewport.getScroll() || {};
        scroll = {
          left: Number.isFinite(Number(value.left)) ? Number(value.left) : 0,
          top: Number.isFinite(Number(value.top)) ? Number(value.top) : 0
        };
      }
    } catch (error) {
      void error;
    }
    return { zoom, scroll };
  }
  describeController(controller) {
    if (!controller || controller.destroyed) {
      return null;
    }
    const viewport = this.registeredSurfaceViewportState(controller);
    return {
      file: controller.file?.path || "",
      surface: controller.surfaceType,
      viewType: controller.workspaceViewType || controller.surfaceType,
      active: Boolean(controller.active),
      tool: controller.toolMode,
      brush: controller.brushMode,
      variant: controller.currentBrushVariant?.() || BRUSH_VARIANT_DEFAULT,
      zoom: viewport?.zoom ?? (controller.readingZoom || 1),
      scroll: viewport?.scroll || null,
      visible: Boolean(controller.drawingsVisible),
      drawingsLoaded: Boolean(controller.drawingsLoaded),
      strokeCount: controller.drawingData?.strokes?.length || 0,
      selected: controller.getSelectedStrokeIndexes?.() || [],
      owner: controller.registeredSurfaceOwner || "",
      id: controller.registeredSurfaceId || "",
      surfaceId: controller.registeredSurfaceId || "",
      surfaceKey: controller.registeredSurfaceKey || "",
      source: controller.registeredSurfaceSource ? { ...controller.registeredSurfaceSource } : null,
      capabilities: controller.registeredSurfaceCapabilities ? { ...controller.registeredSurfaceCapabilities } : null,
      customSurface: Boolean(controller.registeredSurface),
      coordinateBasis: RESPONSIVE_POINT_BASIS
    };
  }
  findApiController(options = {}) {
    const requestedPath = normalizeVaultPath(options.file?.path || options.path || options.file || "");
    const requestedSurface = String(options.surface || "").trim();
    const requestedOwner = String(options.owner || options.surfaceOwner || "").trim();
    const requestedId = String(options.id || options.surfaceId || "").trim();
    const requestedKey = String(options.surfaceKey || "").trim();
    const requestedSource = normalizeRegisteredSurfaceSource(options.source || {});
    const controllers = this.getAllControllers();
    const matches = controllers.filter((controller) => {
      if (requestedPath && normalizeVaultPath(controller.file?.path) !== requestedPath) {
        return false;
      }
      if (requestedSurface && controller.surfaceType !== requestedSurface) {
        return false;
      }
      if (requestedOwner && controller.registeredSurfaceOwner !== requestedOwner) {
        return false;
      }
      if (requestedId && controller.registeredSurfaceId !== requestedId && controller.registeredSurfaceKey !== requestedId) {
        return false;
      }
      if (requestedKey && controller.registeredSurfaceKey !== requestedKey) {
        return false;
      }
      if (requestedSource.kind) {
        const source = controller.registeredSurfaceSource || {};
        if (requestedSource.kind !== source.kind) {
          return false;
        }
        if (requestedSource.path && normalizeVaultPath(requestedSource.path) !== normalizeVaultPath(source.path || controller.file?.path || "")) {
          return false;
        }
        if (requestedSource.url && requestedSource.url !== source.url) {
          return false;
        }
        if (requestedSource.key && requestedSource.key !== source.key) {
          return false;
        }
      }
      return controller.previewEl?.isConnected;
    });
    return matches.find((controller) => isElementVisibleEnough(controller.previewEl)) || matches.find((controller) => controller.active) || matches[0] || this.getActiveController();
  }
  async activateApi(options = {}) {
    const controller = this.findApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    if (!controller.active) {
      await controller.toggle();
    }
    if (options.tool) {
      controller.setToolFromApi(options.tool, options);
    }
    if (options.zoom !== void 0 && controller.canZoomReadingSurface?.()) {
      controller.setReadingZoom(options.zoom);
    }
    const surface = this.describeController(controller);
    this.emitApiEvent("surface-changed", surface);
    return { ok: true, surface };
  }
  setApiTool(tool, options = {}) {
    if (tool && typeof tool === "object") {
      options = { ...tool, ...options };
      tool = options.tool;
    }
    const controller = this.findApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    const ok = controller.setToolFromApi(tool, options);
    const surface = this.describeController(controller);
    if (ok) {
      this.emitApiEvent("surface-changed", surface);
    }
    return { ok, surface };
  }
  setApiZoom(zoom, options = {}) {
    const controller = this.findApiController(options);
    const viewport = controller?.registeredSurfaceViewport;
    if (controller && typeof viewport?.setZoom === "function") {
      const nextZoom = Number(zoom);
      if (!Number.isFinite(nextZoom) || nextZoom <= 0) {
        return { ok: false, reason: "invalid-zoom" };
      }
      try {
        viewport.setZoom(nextZoom);
        controller.scheduleLayoutRefresh({ settle: false });
        controller.requestRender(true);
        const surface = this.describeController(controller);
        this.emitApiEvent("surface-changed", { ...surface, phase: "viewport" });
        return { ok: true, surface };
      } catch (error) {
        return { ok: false, reason: "viewport-set-zoom-failed", message: String(error?.message || error) };
      }
    }
    if (!controller || !controller.canZoomReadingSurface?.()) {
      return { ok: false, reason: "reading-surface-not-found" };
    }
    const ok = controller.setReadingZoom(zoom);
    const surface = this.describeController(controller);
    if (ok) {
      this.emitApiEvent("surface-changed", surface);
    }
    return { ok, surface };
  }
  async getLoadedApiController(options = {}) {
    const controller = this.findApiController(options);
    if (!controller) {
      return null;
    }
    await controller.ensureDrawingsLoaded();
    return controller;
  }
  async getApiState(options = {}) {
    const controller = await this.getLoadedApiController(options);
    return controller ? { ok: true, surface: this.describeController(controller) } : { ok: false, reason: "surface-not-found" };
  }
  deactivateApi(options = {}) {
    const controller = this.findApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    this.setControllerActivation(controller, false);
    const surface = this.describeController(controller);
    this.emitApiEvent("surface-changed", { ...surface, phase: "updated" });
    return { ok: true, surface };
  }
  async toggleApi(options = {}) {
    const controller = this.findApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    await controller.toggle();
    const surface = this.describeController(controller);
    this.emitApiEvent("surface-changed", { ...surface, phase: "updated" });
    return { ok: true, surface };
  }
  async setApiVisibility(visible, options = {}) {
    if (visible && typeof visible === "object") {
      options = { ...visible, ...options };
      visible = options.visible;
    }
    const controller = await this.getLoadedApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    controller.setDrawingsVisible(visible !== false, { persist: true });
    const surface = this.describeController(controller);
    this.emitApiEvent("surface-changed", { ...surface, phase: "updated" });
    return { ok: true, surface };
  }
  setApiBrush(options = {}) {
    const controller = this.findApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    if (options.color !== void 0 && !isCssColor(options.color)) {
      return { ok: false, reason: "invalid-color" };
    }
    const brush = options.brush === BRUSH_WATERCOLOR ? BRUSH_WATERCOLOR : BRUSH_PEN;
    controller.brushVariants[brush] = normalizeBrushVariant(brush, options.variant ?? controller.brushVariants[brush]);
    controller.setBrushMode(brush);
    const settings = controller.currentBrushSettings();
    if (options.color !== void 0) {
      settings.color = options.color;
    }
    if (options.width !== void 0 && Number.isFinite(Number(options.width))) {
      settings.width = clamp(Number(options.width), MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH);
    }
    if (options.opacity !== void 0 && Number.isFinite(Number(options.opacity))) {
      settings.opacity = clamp(Number(options.opacity), 0, 1);
    }
    if (options.count !== void 0 && Number.isFinite(Number(options.count))) {
      settings.count = clamp(Math.round(Number(options.count)), 1, MAX_PEN_COUNT);
    }
    controller.syncCurrentBrushFields();
    controller.syncPaletteInputs();
    controller.updateToolButtons();
    controller.persistCurrentBrushSettings();
    controller.persistInteractionSettings();
    controller.syncSharedToolbarState();
    controller.render();
    const surface = this.describeController(controller);
    this.emitApiEvent("surface-changed", { ...surface, phase: "updated" });
    return { ok: true, surface, brush: { brush, variant: controller.currentBrushVariant(), ...settings } };
  }
  setApiTextPreset(preset, options = {}) {
    if (preset && typeof preset === "object") {
      options = { ...preset, ...options };
      preset = options.preset;
    }
    const controller = this.findApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    controller.textPreset = normalizeTextPreset(preset);
    controller.setTextMode();
    controller.syncTextPanelButtons();
    controller.syncSharedToolbarState();
    const surface = this.describeController(controller);
    this.emitApiEvent("surface-changed", { ...surface, phase: "updated" });
    return { ok: true, surface, preset: controller.textPreset };
  }
  resolveApiElementIndexes(controller, options = {}, fallbackToSelection = true) {
    if (!controller?.drawingData?.strokes) {
      return [];
    }
    if (options.clear) {
      return [];
    }
    const selection = options.selection ?? options;
    if (selection === "all" || options.all === true || selection?.all === true) {
      return controller.drawingData.strokes.map((_, index) => index);
    }
    const rawIndexes = Array.isArray(selection) ? selection.filter((value) => Number.isInteger(Number(value))).map(Number) : selection?.indexes ?? options.indexes;
    const rawIds = Array.isArray(selection) ? selection.filter((value) => typeof value === "string") : selection?.ids ?? selection?.elementIds ?? options.ids ?? options.elementIds;
    const indexes = Array.isArray(rawIndexes) ? rawIndexes.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < controller.drawingData.strokes.length) : [];
    const ids = new Set(Array.isArray(rawIds) ? rawIds.map(String) : []);
    if (ids.size) {
      controller.drawingData.strokes.forEach((stroke, index) => {
        if (ids.has(strokeElementId(stroke))) {
          indexes.push(index);
        }
      });
    }
    if (Array.isArray(rawIndexes) || Array.isArray(rawIds)) {
      return Array.from(new Set(indexes)).sort((a, b) => a - b);
    }
    return fallbackToSelection ? controller.getSelectedStrokeIndexes() : [];
  }
  async getApiElements(options = {}) {
    const controller = await this.getLoadedApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found", elements: [] };
    }
    const selected = new Set(controller.getSelectedStrokeIndexes());
    const requested = this.resolveApiElementIndexes(controller, options, false);
    const indexes = options.all === true || options.selection === "all" || requested.length ? requested : controller.drawingData.strokes.map((_, index) => index);
    return {
      ok: true,
      surface: this.describeController(controller),
      elements: indexes.map((index) => ({ index, selected: selected.has(index), ...JSON.parse(JSON.stringify(controller.drawingData.strokes[index])) }))
    };
  }
  async selectApiElements(options = {}) {
    const controller = await this.getLoadedApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    const indexes = this.resolveApiElementIndexes(controller, options, false);
    if (options.tool !== false && controller.toolMode !== TOOL_SELECT) {
      controller.toggleSelectMode();
    }
    controller.setSelectedStrokes(indexes);
    controller.render();
    const surface = this.describeController(controller);
    this.emitApiEvent("surface-changed", { ...surface, phase: "updated" });
    return { ok: true, selected: indexes, surface };
  }
  commitApiDrawingMutation(controller, before, indexes = []) {
    controller.redoStack = [];
    controller.rebuildElementRelations();
    controller.invalidateStaticCache();
    controller.setSelectedStrokes(indexes);
    this.scheduleDrawingSave(controller.file, controller.drawingData, { userOperation: true });
    controller.recordDrawingHistory(before);
    controller.scheduleNoteFlowLayout({
      operation: indexes.some((index) => controller.drawingData.strokes[index]?.noteFlow?.enabled)
    });
    controller.scheduleLayoutRefresh({ settle: false });
    controller.render();
  }
  async updateApiElements(options = {}) {
    const controller = await this.getLoadedApiController(options);
    const patch = options.patch;
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return { ok: false, reason: "missing-patch" };
    }
    const indexes = this.resolveApiElementIndexes(controller, options);
    if (!indexes.length) {
      return { ok: false, reason: "selection-not-found" };
    }
    const before = controller.captureDrawingHistorySnapshot();
    for (const index of indexes) {
      const current = controller.drawingData.strokes[index];
      controller.drawingData.strokes[index] = normalizeStroke({ ...current, ...patch });
    }
    this.commitApiDrawingMutation(controller, before, indexes);
    return { ok: true, updated: indexes.length, selected: indexes, surface: this.describeController(controller) };
  }
  async deleteApiElements(options = {}) {
    const controller = await this.getLoadedApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    const indexes = this.resolveApiElementIndexes(controller, options);
    if (!indexes.length) {
      return { ok: false, reason: "selection-not-found" };
    }
    const before = controller.drawingData.strokes.length;
    controller.setSelectedStrokes(indexes);
    controller.deleteSelectedStroke();
    return { ok: true, deleted: before - controller.drawingData.strokes.length, surface: this.describeController(controller) };
  }
  async reorderApiElements(options = {}) {
    const controller = await this.getLoadedApiController(options);
    const direction = String(options.direction || "front").toLowerCase();
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    if (!["front", "forward", "backward", "back"].includes(direction)) {
      return { ok: false, reason: "invalid-direction" };
    }
    const indexes = this.resolveApiElementIndexes(controller, options);
    if (!indexes.length) {
      return { ok: false, reason: "selection-not-found" };
    }
    controller.setSelectedStrokes(indexes);
    controller.reorderSelectedStrokes(direction);
    return { ok: true, direction, selected: controller.getSelectedStrokeIndexes(), surface: this.describeController(controller) };
  }
  async setApiElementsLocked(options = {}) {
    return this.updateApiElements({ ...options, patch: { ...(options.patch || {}), locked: options.locked !== false } });
  }
  async setApiElementsNoteFlow(options = {}) {
    const controller = await this.getLoadedApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    if (!controller.supportsNoteFlow()) {
      return { ok: false, reason: "note-flow-not-supported" };
    }
    const indexes = this.resolveApiElementIndexes(controller, options).filter((index) => !controller.drawingData.strokes[index]?.locked && !isConnectorStroke(controller.drawingData.strokes[index]));
    if (!indexes.length) {
      return { ok: false, reason: "selection-not-found" };
    }
    const before = controller.captureDrawingHistorySnapshot();
    const enabled = options.enabled !== false;
    controller.resetNoteFlowSettle();
    controller.clearNoteFlowLayout();
    controller.noteFlowAvoidanceAnchors.clear();
    for (const index of indexes) {
      const stroke = controller.drawingData.strokes[index];
      stroke.noteFlow = enabled ? controller.captureNoteFlowAnchor(stroke) : null;
      stroke.belowMarkdown = enabled;
    }
    controller.captureResponsiveAnchorsForIndexes(indexes);
    this.commitApiDrawingMutation(controller, before, indexes);
    return { ok: true, enabled, selected: indexes, surface: this.describeController(controller) };
  }
  async runApiHistory(direction, options = {}) {
    const controller = await this.getLoadedApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    if (direction === "redo") {
      await controller.redoLastStroke();
    } else {
      await controller.undoLastStroke();
    }
    return { ok: true, direction, surface: this.describeController(controller) };
  }
  async updateApiSettings(patch = {}) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return { ok: false, reason: "invalid-settings" };
    }
    this.noteDrawSettings = sanitizeSettings({ ...this.noteDrawSettings, ...patch });
    await this.saveData(this.noteDrawSettings);
    for (const controller of this.getAllControllers()) {
      controller.applySettings();
    }
    return { ok: true, settings: { ...this.noteDrawSettings } };
  }
  async executeApiAction(action, options = {}) {
    if (Array.isArray(action)) {
      const results = [];
      for (const item of action) {
        results.push(await this.executeApiAction(item, options));
      }
      return {
        ok: results.every((result) => result?.ok !== false),
        count: results.length,
        results,
        surface: this.describeController(this.findApiController(options))
      };
    }
    if (action && typeof action === "object") {
      const actionOptions = { ...options, ...(action.options || {}), ...action };
      const name = action.op || action.action || action.type || action.name || action.command || "";
      delete actionOptions.op;
      delete actionOptions.action;
      delete actionOptions.type;
      delete actionOptions.name;
      delete actionOptions.command;
      delete actionOptions.options;
      return this.executeApiAction(name, actionOptions);
    }
    const name = String(action || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (name === "activate") return this.activateApi(options);
    if (name === "deactivate") return this.deactivateApi(options);
    if (name === "toggle") return this.toggleApi(options);
    if (name === "get-state") return this.getApiState(options);
    if (name === "set-visibility") return this.setApiVisibility(options.visible, options);
    if (name === "set-tool") return this.setApiTool(options.tool, options);
    if (name === "set-brush") return this.setApiBrush(options);
    if (name === "set-text-preset") return this.setApiTextPreset(options.preset, options);
    if (name === "set-zoom") return this.setApiZoom(options.zoom, options);
    if (name === "get-elements") return this.getApiElements(options);
    if (name === "select-elements") return this.selectApiElements(options);
    if (name === "clear-selection") return this.selectApiElements({ ...options, clear: true });
    if (name === "update-elements") return this.updateApiElements(options);
    if (name === "delete-elements") return this.deleteApiElements(options);
    if (name === "reorder-elements") return this.reorderApiElements(options);
    if (name === "set-elements-locked") return this.setApiElementsLocked(options);
    if (name === "set-elements-note-flow") return this.setApiElementsNoteFlow(options);
    if (name === "undo" || name === "redo") return this.runApiHistory(name, options);
    if (name === "copy") return this.copyElementsApi(options);
    if (name === "copy-link" || name === "copy-element-link") return this.findApiController(options)?.copySelectedElementLink({ quiet: Boolean(options.quiet) }) || { ok: false, reason: "surface-not-found" };
    if (name === "paste") return this.pasteElementsApi(options);
    if (name === "insert-stroke" || name === "insert-element" || name === "insert-elements") return this.insertApiElements(options);
    if (name === "insert-mind-map" || name === "insert-mindmap") return this.insertMindMapApi(options);
    if (name === "get-settings") return { ok: true, settings: { ...this.noteDrawSettings } };
    if (name === "update-settings") return this.updateApiSettings(options.patch || options.settings || {});
    if (name === "refresh") {
      const controller = this.findApiController(options);
      const file = controller?.file || this.resolveApiFile(options.file || options.path);
      if (!file) return { ok: false, reason: "missing-file" };
      const data = await this.readDrawings(file);
      return { ok: true, refreshed: this.refreshControllersForFile(file, data) };
    }
    return { ok: false, reason: "unknown-action", action: name };
  }
  async replaceTextApi(options = {}) {
    const file = this.resolveApiFile(options.file || options.path, options.sourcePath || "");
    if (!file) {
      return { changed: false, reason: "missing-file" };
    }
    const originalText = String(options.originalText || "");
    const editedText = String(options.editedText ?? options.text ?? "");
    const sourceInfo = options.sourceInfo || null;
    const source = await this.app.vault.read(file);
    const target = resolveSourceEditTarget(source, sourceInfo, originalText);
    if (!target) {
      return { changed: false, reason: "target-not-found" };
    }
    const result = await this.saveTextBlock(file, originalText, editedText, sourceInfo, target);
    if (result.history) {
      const controller = this.findApiController({ file });
      controller?.recordMarkdownHistory(file, result.history.before, result.history.after);
    }
    return result;
  }
  async insertStrokeApi(fileOrPath, stroke) {
    const file = this.resolveApiFile(fileOrPath);
    if (!file) {
      throw new Error("NoteDraw could not resolve the requested file");
    }
    const data = await this.readDrawings(file);
    const normalized = normalizeStroke(stroke);
    if (normalized.points.length) {
      data.strokes.push(normalized);
      await this.writeDrawings(file, data);
      this.refreshControllersForFile(file, data);
    }
    return data;
  }
  async insertApiElements(options = {}) {
    const controller = await this.getLoadedApiController(options);
    if (!controller) {
      return { ok: false, reason: "surface-not-found" };
    }
    const rawElements = Array.isArray(options.elements) ? options.elements : Array.isArray(options.strokes) ? options.strokes : options.stroke ? [options.stroke] : [];
    if (!rawElements.length) {
      return { ok: false, reason: "missing-elements" };
    }
    const before = controller.captureDrawingHistorySnapshot();
    const inserted = [];
    for (const raw of rawElements) {
      const normalized = normalizeStroke(raw);
      if (!normalized.points.length) {
        continue;
      }
      controller.drawingData.strokes.push(normalized);
      inserted.push(controller.drawingData.strokes.length - 1);
    }
    if (!inserted.length) {
      return { ok: false, reason: "empty-elements" };
    }
    this.commitApiDrawingMutation(controller, before, inserted);
    return {
      ok: true,
      inserted: inserted.length,
      selected: inserted,
      elementIds: inserted.map((index) => strokeElementId(controller.drawingData.strokes[index])),
      surface: this.describeController(controller)
    };
  }
  copyElementsApi(options = {}) {
    const controller = this.findApiController(options);
    return controller?.copySelectedElements({ quiet: Boolean(options.quiet) }) || { ok: false, reason: "selection-not-found" };
  }
  pasteElementsApi(options = {}) {
    const controller = this.findApiController(options);
    return controller?.pasteCopiedElements({ point: options.point, quiet: Boolean(options.quiet) }) || { ok: false, reason: "surface-not-found" };
  }
  async insertMindMapApi(options = {}) {
    const controller = this.findApiController(options);
    const sourceFile = this.resolveApiFile(options.source || options.sourcePath || options.file || controller?.file);
    if (!controller || !sourceFile) {
      return { ok: false, reason: "source-or-surface-not-found" };
    }
    const point = options.point || controller.visibleCanvasPastePoint();
    return controller.insertMindMapAt(point, sourceFile, {
      quiet: Boolean(options.quiet),
      affectsSource: options.affectsSource ?? this.noteDrawSettings.mindMapAffectsSource
    });
  }
  refreshControllersForFile(file, data, options = {}) {
    let refreshed = 0;
    for (const controller of this.getAllControllers()) {
      if (
        normalizeVaultPath(controller.file?.path) !== normalizeVaultPath(file?.path) ||
        controller.drawingData === options.excludeData ||
        controller.pointerDown ||
        controller.draggingStroke ||
        controller.resizingSelection
      ) {
        continue;
      }
      controller.drawingData = normalizeDrawingData(data, file);
      controller.rebuildElementRelations();
      controller.drawingsLoaded = true;
      controller.applyDrawingsVisibility(controller.drawingData.visible !== false);
      controller.responsivePointsInitialized = false;
      controller.responsiveLayoutSignature = "";
      controller.responsiveLayoutContext = null;
      controller.invalidateStaticCache();
      if (isElementVisibleEnough(controller.previewEl)) {
        controller.scheduleFrozenNoteFlowLayoutRestore();
        controller.scheduleLayoutRefresh({ settle: false });
        controller.requestRender(true);
      }
      refreshed += 1;
    }
    return refreshed;
  }
  async handleVaultFileDelete(deletedFile) {
    const deletedFiles = collectDeletedVaultFiles(deletedFile);
    const deletedPaths = new Set(deletedFiles.map((file) => normalizeVaultPath(file?.path)).filter(Boolean));
    const rootPath = normalizeVaultPath(deletedFile?.path || "");
    if (rootPath) {
      deletedPaths.add(rootPath);
    }
    if (!deletedPaths.size) {
      return;
    }
    const isDeletedPath = (path) => {
      const normalized = normalizeVaultPath(path);
      return Array.from(deletedPaths).some((deletedPath) => normalized === deletedPath || normalized.startsWith(`${deletedPath}/`));
    };
    for (const controller of this.getAllControllers()) {
      if (isDeletedPath(controller.file?.path)) {
        controller.destroy({ discardEdits: true });
      }
    }
    const storageRecords = deletedFiles.filter((file) => file?.extension || String(file?.path || "").toLowerCase().endsWith(".md"));
    const storagePaths = new Set();
    const storageKeys = new Set();
    for (const file of storageRecords) {
      const filePath = normalizeVaultPath(file.path);
      const encodedName = this.encodedDrawingNameForFile({ path: filePath });
      const modes = [DRAWING_STORAGE_CONFIG];
      if (String(file.extension || "").toLowerCase() === "md") {
        modes.push(DRAWING_STORAGE_NOTE_SUBFOLDER, DRAWING_STORAGE_NOTE_FOLDER, DRAWING_STORAGE_EMBEDDED);
      }
      for (const mode of modes) {
        const storagePath = mode === DRAWING_STORAGE_EMBEDDED
          ? ""
          : resolveDrawingStoragePath({
            filePath,
            configDir: this.app.vault.configDir,
            pluginId: PLUGIN_ID,
            encodedName,
            mode
          });
        const storageKey = `${mode}:${storagePath}`;
        storageKeys.add(storageKey);
        if (storagePath) {
          storagePaths.add(storagePath);
        }
      }
      this.portableBundles.delete(filePath);
      this.portableBundleLoads.delete(filePath);
    }
    for (const key of Array.from(this.saveTimers.keys())) {
      if (storageKeys.has(key)) {
        this.cancelScheduledDrawingSave(key);
      }
    }
    for (const key of Array.from(this.saveIdleCallbacks.keys())) {
      if (storageKeys.has(key)) {
        this.cancelScheduledDrawingSave(key);
      }
    }
    for (const key of storageKeys) {
      this.pendingDrawingSaves.delete(key);
    }
    await Promise.all(Array.from(storageKeys).map((key) => this.drawingWritePromises.get(key)).filter(Boolean).map((write) => write.catch(() => void 0)));
    for (const key of storageKeys) {
      this.drawingStateCache.delete(key);
      this.drawingWritePromises.delete(key);
    }
    for (const path of storagePaths) {
      try {
        if (await this.app.vault.adapter.exists(path)) {
          await this.app.vault.adapter.remove(path);
        }
      } catch (error) {
        console.error(`[${PLUGIN_ID}] Failed to remove deleted file NoteDraw storage`, path, error);
      }
    }
  }
  onApiEvent(eventName, listener) {
    if (typeof listener !== "function") {
      return () => void 0;
    }
    const name = String(eventName || "");
    let listeners = this.apiListeners.get(name);
    if (!listeners) {
      listeners = /* @__PURE__ */ new Set();
      this.apiListeners.set(name, listeners);
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  emitApiEvent(eventName, detail) {
    for (const listener of Array.from(this.apiListeners?.get(eventName) || [])) {
      try {
        listener(detail);
      } catch (error) {
        console.error(`[${PLUGIN_ID}] API listener failed`, error);
      }
    }
  }
  resolveEditableFile(element, fallbackFile) {
    const sourcePath = normalizeVaultPath(element?.dataset?.noteDrawSourcePath || "");
    return this.resolveApiFile(sourcePath) || fallbackFile;
  }
  getActiveController() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const activeLeaf = findActiveWorkspaceLeaf(this.app);
    const activeContainer = activeView?.containerEl || activeLeaf?.view?.containerEl;
    if (activeView instanceof MarkdownView) {
      const surface = findPrimaryMarkdownSurface(activeView);
      const controller = surface ? this.controllers.get(surface) || surface._noteDrawController : null;
      if (controller) {
        return controller;
      }
    }
    if (activeContainer) {
      const activeRegistered = Array.from(this.registeredSurfaceControllers.values()).find((controller) => controller.previewEl?.isConnected && activeContainer.contains(controller.previewEl));
      if (activeRegistered) {
        return activeRegistered;
      }
      const activeWebview = Array.from(this.webviewControllers.values()).find((controller) => controller.previewEl?.isConnected && activeContainer.contains(controller.previewEl));
      if (activeWebview) {
        return activeWebview;
      }
      const activeWorkspace = this.workspaceControllers.get(activeLeaf?.view) || Array.from(this.workspaceControllers.values()).find((controller) => controller.previewEl?.isConnected && activeContainer.contains(controller.previewEl));
      if (activeWorkspace) {
        return activeWorkspace;
      }
    }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const surface = view ? findPrimaryMarkdownSurface(view) : null;
    return surface ? this.controllers.get(surface) || surface._noteDrawController : null;
  }
  toggleActiveController() {
    const controller = this.getActiveController();
    if (!controller) {
      new Notice(this.t("openNoteOrWebviewFirst"));
      return;
    }
    controller.toggle().catch((error) => {
      console.error(`[${PLUGIN_ID}] Failed to toggle NoteDraw`, error);
    });
  }
  onElementLinkClick(event) {
    const anchor = event?.target?.closest?.("a[href]");
    const href = anchor?.getAttribute?.("href") || anchor?.href || "";
    if (!parseNoteDrawElementLink(href)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    void this.openElementLink(href).catch((error) => {
      console.error(`[${PLUGIN_ID}] Failed to open NoteDraw element link`, error);
      new Notice(this.t("elementLinkTargetNotFound"));
    });
  }
  async openElementLink(rawLink) {
    const target = parseNoteDrawElementLink(rawLink);
    const file = target ? this.resolveApiFile(target.file) : null;
    if (!target || !file) {
      new Notice(this.t("elementLinkTargetNotFound"));
      return { ok: false, reason: "invalid-link" };
    }
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    if (typeof leaf.setViewState === "function") {
      await leaf.setViewState({
        type: "markdown",
        state: { file: file.path, mode: "preview", source: false },
        active: true
      });
    }
    await this.app.workspace.revealLeaf?.(leaf);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const view = leaf.view;
      const controller = view instanceof MarkdownView
        ? this.resolveLivePreviewController(view)
        : null;
      if (controller?.previewEl?.isConnected && controller.file?.path === file.path) {
        await controller.ensureDrawingsLoaded();
        if (controller.drawingsLoaded) {
          this.setControllerActivation(controller, true);
          controller.selectElementsById(target.ids);
          controller.scrollSelectionIntoView();
          return { ok: true, file: file.path, ids: target.ids };
        }
      }
      this.runSurfaceSync();
      await waitForNextFrame();
    }
    new Notice(this.t("elementLinkTargetNotFound"));
    return { ok: false, reason: "surface-not-ready" };
  }
  syncRenderedMarkdownAnnotations() {
    const leaves = this.app.workspace.getLeavesOfType?.("markdown") || [];
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || !view.file || !view.containerEl) {
        continue;
      }
      if (!isElementVisibleEnough(view.containerEl)) {
        continue;
      }
      annotateVisibleMarkdownElements(this.app, view.containerEl, view.file.path);
    }
  }
  syncSourceControllers() {
    const leaves = this.app.workspace.getLeavesOfType?.("markdown") || [];
    const activeViews = /* @__PURE__ */ new Set();
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || !view.file) {
        continue;
      }
      const sourceEl = findSourceSurfaceForView(view);
      const previewVisible = isMarkdownPreviewVisible(view, findRootPreviewForView(view));
      const sourceVisible = isMarkdownSourceVisible(view, sourceEl);
      const shouldMount = Boolean(sourceEl) && isSourceMode(view) && sourceVisible && !previewVisible;
      const existing = this.sourceControllers.get(view);
      if (!shouldMount) {
        if (existing) {
          existing.destroy();
          this.sourceControllers.delete(view);
        }
        continue;
      }
      activeViews.add(view);
      if (existing?.previewEl === sourceEl) {
        existing.setFile(view.file).catch((error) => {
          console.error(`[${PLUGIN_ID}] Failed to switch source controller file`, error);
        });
        continue;
      }
      if (existing) {
        existing.destroy();
      }
      const mountedOnElement = this.controllers.get(sourceEl) || sourceEl._noteDrawController;
      if (mountedOnElement?.destroy) {
        mountedOnElement.destroy();
      }
      cleanupDrawingUi(sourceEl);
      const controller = new PreviewDrawingController(this, sourceEl, view, view.file, {
        allowTextEdit: false,
        surfaceType: "source"
      });
      this.controllers.set(sourceEl, controller);
      this.sourceControllers.set(view, controller);
      controller.mount().catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to mount source drawing controller`, error);
      });
    }
    for (const [view, controller] of Array.from(this.sourceControllers.entries())) {
      if (!activeViews.has(view) && !controller.previewEl?.isConnected) {
        controller.destroy();
        this.sourceControllers.delete(view);
      }
    }
  }
  clearPreviewRenderRecovery(preview) {
    const state = this.previewRenderRecovery?.get(preview);
    if (state?.timer !== null && state?.timer !== void 0) {
      window.clearTimeout(state.timer);
    }
    this.previewRenderRecovery?.delete(preview);
  }
  schedulePreviewRenderRecovery(view, preview) {
    const lifecycle = rootPreviewLifecycleState(view, preview);
    const renderer = view?.previewMode?.renderer;
    if (this.runtimeDisposed || !shouldRecoverEmptyRootPreview({
      ...lifecycle,
      rendererMatches: renderer?.previewEl === preview
    })) {
      this.clearPreviewRenderRecovery(preview);
      return false;
    }
    const path = normalizeVaultPath(view?.file?.path || "");
    let state = this.previewRenderRecovery.get(preview);
    if (!state || state.path !== path) {
      this.clearPreviewRenderRecovery(preview);
      state = { path, attempts: 0, timer: null };
      this.previewRenderRecovery.set(preview, state);
    }
    if (state.timer !== null || state.attempts >= 2) {
      return false;
    }
    const delay = state.attempts === 0 ? 0 : 120;
    state.attempts += 1;
    state.timer = window.setTimeout(() => {
      state.timer = null;
      if (this.runtimeDisposed || !preview?.isConnected || view?.previewMode?.renderer?.previewEl !== preview) {
        this.clearPreviewRenderRecovery(preview);
        return;
      }
      try {
        view.previewMode?.rerender?.(true);
      } catch (error) {
        void error;
      }
      this.scheduleSurfaceSync(60);
    }, delay);
    return true;
  }
  syncMarkdownControllerModes() {
    const leaves = this.app.workspace.getLeavesOfType?.("markdown") || [];
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) {
        continue;
      }
      const preview = findRootPreviewForView(view);
      const source = findSourceSurfaceForView(view);
      let previewController = preview ? this.controllers.get(preview) || preview._noteDrawController : null;
      const sourceController = source ? this.controllers.get(source) || source._noteDrawController : null;
      const previewVisible = isMarkdownPreviewVisible(view, preview);
      const sourceVisible = isMarkdownSourceVisible(view, source);
      const alternateSurfaceVisible = hasVisibleAlternateWorkspaceSurface(view, preview);
      if (previewController?.plugin === this && view.file && previewController.file?.path !== view.file.path) {
        previewController.destroy();
        previewController = null;
      }
      if (isSourceMode(view) && sourceVisible && !previewVisible) {
        for (const rootPreview of findRootPreviewsForView(view)) {
          this.clearPreviewRenderRecovery(rootPreview);
          const controller = this.controllers.get(rootPreview) || rootPreview._noteDrawController;
          controller?.destroy?.();
          resetDormantRootPreview(view, rootPreview);
        }
        continue;
      }
      sourceController?.syncFloatingControlClasses();
      if (!previewVisible) {
        if (alternateSurfaceVisible) {
          for (const rootPreview of findRootPreviewsForView(view)) {
            const controller = this.controllers.get(rootPreview) || rootPreview._noteDrawController;
            if (controller?.plugin === this && controller.surfaceType === "preview") {
              controller.destroy();
            }
          }
        }
        continue;
      }
      for (const alternatePreview of findRootPreviewsForView(view)) {
        if (alternatePreview === preview) {
          continue;
        }
        const alternateController = this.controllers.get(alternatePreview) || alternatePreview._noteDrawController;
        if (alternateController?.plugin === this && alternateController.surfaceType === "preview") {
          alternateController.destroy();
        }
      }
      if (previewController?.plugin === this && !previewController.destroyed && previewController.file?.path === view.file?.path) {
        previewController.syncFloatingControlClasses();
        continue;
      }
      if (!isRootPreviewReady(view, preview)) {
        previewController?.destroy();
        if (this.schedulePreviewRenderRecovery(view, preview)) {
          continue;
        }
        resetDormantRootPreview(view, preview);
        continue;
      }
      this.clearPreviewRenderRecovery(preview);
      if (previewVisible && (!previewController || previewController.destroyed || previewController.file?.path !== view.file?.path)) {
        previewController?.destroy();
        previewController = this.resolveLivePreviewController(view);
      }
    }
  }
  syncEmbeddedMarkdownControllers() {
    if (this.runtimeDisposed) {
      return;
    }
    const activeSurfaces = /* @__PURE__ */ new Set();
    const leaves = this.app.workspace.getLeavesOfType?.("markdown") || [];
    for (const leaf of leaves) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || !view.file || !view.containerEl) {
        continue;
      }
      const surfaces = Array.from(view.containerEl.querySelectorAll(".markdown-embed-content")).filter((surface) => {
        return isElementLaidOut(surface) && !surface.closest(".notedraw-embed");
      });
      for (const surface of surfaces) {
        const sourcePath = resolveRenderedSourcePath(this.app, surface, view.file.path);
        const file = getVaultFileByPath(this.app.vault, sourcePath);
        if (!file || normalizeVaultPath(file.path) === normalizeVaultPath(view.file.path)) {
          continue;
        }
        if (!isElementNearViewport(surface)) {
          continue;
        }
        activeSurfaces.add(surface);
        const existing = this.embeddedControllers.get(surface);
        if (existing?.previewEl === surface && !existing.destroyed) {
          existing.setFile(file).catch((error) => {
            console.error(`[${PLUGIN_ID}] Failed to switch embedded drawing controller file`, error);
          });
          continue;
        }
        existing?.destroy();
        const mountedOnElement = this.controllers.get(surface) || surface._noteDrawController;
        if (mountedOnElement?.destroy) {
          mountedOnElement.destroy();
        }
        cleanupDrawingUi(surface);
        const controller = new PreviewDrawingController(this, surface, view, file, {
          allowTextEdit: true,
          surfaceType: "embedded",
          embeddedSurface: true
        });
        this.controllers.set(surface, controller);
        this.embeddedControllers.set(surface, controller);
        controller.mount().catch((error) => {
          console.error(`[${PLUGIN_ID}] Failed to mount embedded drawing controller`, error);
        });
      }
    }
    for (const [surface, controller] of Array.from(this.embeddedControllers.entries())) {
      if (!activeSurfaces.has(surface) || !surface.isConnected) {
        controller.destroy();
        this.embeddedControllers.delete(surface);
      }
    }
  }
  syncWebviewControllers() {
    for (const leaf of collectWorkspaceLeaves(this.app)) {
      const view = leaf?.view;
      if (isNativeGraphWorkspaceType(workspaceViewType(view))) {
        this.cleanupNativeGraphWorkspaceView(view, view?.contentEl || findWorkspaceDrawingSurface(view));
      }
    }
    const surfaces = findWebviewSurfaces(activeDocument);
    const activeSurfaces = /* @__PURE__ */ new Set();
    for (const surface of surfaces) {
      if (!surface?.isConnected) {
        continue;
      }
      const view = findOwningWorkspaceView(this.app, surface);
      if (isNativeGraphWorkspaceType(workspaceViewType(view))) {
        this.cleanupNativeGraphWorkspaceView(view, surface);
        continue;
      }
      if (!isElementVisibleEnough(surface)) {
        continue;
      }
      activeSurfaces.add(surface);
      const file = createWebviewDrawingFile(surface, view);
      const existing = this.webviewControllers.get(surface);
      if (existing?.previewEl === surface) {
        existing.setFile(file).catch((error) => {
          console.error(`[${PLUGIN_ID}] Failed to switch webview controller file`, error);
        });
        continue;
      }
      if (existing) {
        existing.destroy();
      }
      const mountedOnElement = surface._noteDrawController;
      if (mountedOnElement?.plugin === this && mountedOnElement.surfaceType === "webview") {
        mountedOnElement.setFile(file).catch((error) => {
          console.error(`[${PLUGIN_ID}] Failed to switch webview controller file`, error);
        });
        this.webviewControllers.set(surface, mountedOnElement);
        continue;
      }
      if (mountedOnElement?.destroy) {
        mountedOnElement.destroy();
      }
      cleanupDrawingUi(surface);
      const controller = new PreviewDrawingController(this, surface, view, file, {
        allowTextEdit: true,
        surfaceType: "webview"
      });
      this.controllers.set(surface, controller);
      this.webviewControllers.set(surface, controller);
      controller.mount().catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to mount webview drawing controller`, error);
      });
    }
    for (const [surface, controller] of Array.from(this.webviewControllers.entries())) {
      if (!activeSurfaces.has(surface) || !surface.isConnected) {
        controller.destroy();
        this.webviewControllers.delete(surface);
      }
    }
  }
  syncWorkspaceControllers() {
    const activeViews = /* @__PURE__ */ new Set();
    for (const leaf of collectImageWorkspaceLeaves(this.app)) {
      const view = leaf?.view;
      const viewType = workspaceViewType(view) || "image";
      const file = view?.file && typeof view.file.path === "string" ? view.file : null;
      const surface = findWorkspaceDrawingSurface(view);
      if (!view?.containerEl || !file || !surface?.isConnected) {
        continue;
      }
      activeViews.add(view);
      if (!isElementVisibleEnough(surface)) {
        continue;
      }
      this.mountWorkspaceController(view, viewType, file, surface);
    }
    for (const leaf of collectWorkspaceLeaves(this.app)) {
      const view = leaf?.view;
      const viewType = workspaceViewType(view);
      const imageWorkspace = isImageWorkspaceView(view, viewType);
      if (isNativeGraphWorkspaceType(viewType)) {
        this.cleanupNativeGraphWorkspaceView(view, view?.contentEl || findWorkspaceDrawingSurface(view));
        continue;
      }
      if (imageWorkspace) {
        continue;
      }
      if (!view?.containerEl || !isMainWorkspaceView(view) || view instanceof MarkdownView || viewType === "markdown" || viewType === "empty" || isWebviewWorkspaceType(viewType)) {
        continue;
      }
      const file = view.file && typeof view.file.path === "string" ? view.file : createWorkspaceDrawingFile(view, viewType);
      const surface = findWorkspaceDrawingSurface(view);
      if (!surface?.isConnected) {
        continue;
      }
      activeViews.add(view);
      if (!isElementVisibleEnough(surface)) {
        continue;
      }
      this.mountWorkspaceController(view, viewType, file, surface);
    }
    for (const [view, controller] of Array.from(this.workspaceControllers.entries())) {
      if (!activeViews.has(view) || !controller.previewEl?.isConnected) {
        controller.destroy();
        this.workspaceControllers.delete(view);
      }
    }
  }
  mountWorkspaceController(view, viewType, file, surface) {
    const existing = this.workspaceControllers.get(view);
    if (existing?.previewEl === surface && !existing.destroyed) {
      existing.workspaceViewType = viewType;
      existing.setFile(file).catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to switch workspace drawing file`, error);
      });
      if (!existing.button?.isConnected) {
        existing.button = this.installHeaderButton(existing);
      }
      return existing;
    }
    existing?.destroy();
    const mountedOnElement = this.controllers.get(surface) || surface._noteDrawController;
    if (mountedOnElement?.destroy) {
      mountedOnElement.destroy();
    }
    cleanupDrawingUi(surface);
    const controller = new PreviewDrawingController(this, surface, view, file, {
      allowTextEdit: false,
      surfaceType: "workspace",
      workspaceSurface: true,
      workspaceViewType: viewType
    });
    this.controllers.set(surface, controller);
    this.workspaceControllers.set(view, controller);
    controller.mount().catch((error) => {
      console.error(`[${PLUGIN_ID}] Failed to mount workspace drawing controller`, error);
    });
    return controller;
  }
  cleanupNativeGraphWorkspaceView(view, surface = view?.contentEl || findWorkspaceDrawingSurface(view)) {
    if (!surface) {
      return;
    }
    const candidates = new Set([
      this.workspaceControllers.get(view),
      this.webviewControllers.get(surface),
      this.controllers.get(surface),
      surface._noteDrawController
    ].filter(Boolean));
    const registeredController = Array.from(candidates).find((controller) => controller?.plugin === this && controller.registeredSurface);
    for (const controller of candidates) {
      if (controller?.plugin === this && controller !== registeredController) {
        controller.destroy?.();
      }
    }
    if (registeredController) {
      return;
    }
    cleanupDrawingUi(surface);
    for (const button of view?.containerEl?.querySelectorAll?.(".notedraw-header-button, .notedraw-webview-button") || []) {
      if (!button._noteDrawController?.registeredSurface) {
        button.remove();
      }
    }
  }
  installHeaderButton(controller) {
    if (controller.surfaceType === "webview" || controller.registeredSurface) {
      return this.installSurfaceButton(controller);
    }
    const view = controller.view;
    let state = this.headerActions.get(view);
    if (!state || !state.button?.isConnected) {
      state = {
        button: null,
        controller: null,
        controllers: /* @__PURE__ */ new Set()
      };
      state.clickHandler = (event) => this.resolveHeaderController(view, state, { preferPreviewOnAppleTouch: isAppleTouchEvent(event) })?.onButtonClick(event);
      state.pointerDownHandler = (event) => this.resolveHeaderController(view, state, { preferPreviewOnAppleTouch: false })?.onButtonPointerDown(event);
      state.pointerUpHandler = (event) => this.resolveHeaderController(view, state, { preferPreviewOnAppleTouch: false })?.onButtonPointerUp(event);
      state.touchEndHandler = (event) => this.resolveHeaderController(view, state, { preferPreviewOnAppleTouch: true })?.onButtonTouchEnd(event);
      state.contextMenuHandler = (event) => this.resolveHeaderController(view, state, { preferPreviewOnAppleTouch: false })?.onButtonContextMenu(event);
      let button = null;
      if (typeof view?.addAction === "function") {
        button = view.addAction("wand-sparkles", this.t("editTextDraw"), state.clickHandler);
      }
      if (!button) {
        const actions = view?.containerEl?.querySelector(".view-actions");
        button = activeDocument.createElement("div");
        button.classList.add("clickable-icon", "view-action");
        setIcon(button, "wand-sparkles");
        button.addEventListener("click", state.clickHandler);
        if (actions) {
          actions.appendChild(button);
        } else {
          controller.previewEl.appendChild(button);
          button.classList.add("notedraw-fallback-button");
        }
      }
      button.addEventListener("pointerdown", state.pointerDownHandler);
      button.addEventListener("pointerup", state.pointerUpHandler);
      button.addEventListener("pointercancel", state.pointerUpHandler);
      button.addEventListener("pointerleave", state.pointerUpHandler);
      button.addEventListener("touchend", state.touchEndHandler, { passive: false });
      button.addEventListener("contextmenu", state.contextMenuHandler);
      state.button = button;
      this.headerActions.set(view, state);
    }
    if (!state.controllers) {
      state.controllers = /* @__PURE__ */ new Set();
    }
    state.controllers.add(controller);
    state.controller = this.pickHeaderController(view, state, controller);
    state.button._noteDrawController = state.controller || controller;
    state.button.classList.add("notedraw-header-button");
    state.button.classList.toggle("notedraw-webview-button", state.button._noteDrawController?.surfaceType === "webview");
    this.setAccessibleLabel(state.button, state.button._noteDrawController?.surfaceType === "webview" ? "editWebviewDraw" : "editTextDraw");
    state.button.classList.toggle("is-active", Boolean(state.button._noteDrawController?.active));
    this.cleanupHeaderButtons(view, state.button);
    return state.button;
  }
  installSurfaceButton(controller) {
    const actions = findWebviewButtonHost(controller.previewEl, controller.view);
    const inline = actions && !actions.classList?.contains("view-actions");
    const button = activeDocument.createElement(inline ? "button" : "div");
    if (inline) {
      button.setAttribute("type", "button");
    }
    button.classList.add("clickable-icon", "notedraw-webview-button");
    if (inline) {
      button.classList.add("mwv-icon-button", "notedraw-webview-inline-button");
    } else {
      button.classList.add("view-action");
    }
    setIcon(button, "wand-sparkles");
    this.setAccessibleLabel(button, controller.surfaceType === "webview" ? "editWebviewDraw" : "editTextDraw");
    button.addEventListener("click", (event) => controller.onButtonClick(event));
    button.addEventListener("pointerdown", (event) => controller.onButtonPointerDown(event));
    button.addEventListener("pointerup", () => controller.onButtonPointerUp());
    button.addEventListener("pointercancel", () => controller.onButtonPointerUp());
    button.addEventListener("pointerleave", () => controller.onButtonPointerUp());
    button.addEventListener("touchend", (event) => controller.onButtonTouchEnd(event), { passive: false });
    button.addEventListener("contextmenu", (event) => controller.onButtonContextMenu(event));
    if (actions) {
      actions.appendChild(button);
    } else {
      controller.previewEl.appendChild(button);
      button.classList.add("notedraw-fallback-button");
    }
    button._noteDrawController = controller;
    return button;
  }
  releaseHeaderButton(controller) {
    if (controller.surfaceType === "webview" || controller.registeredSurface) {
      controller.button?.remove();
      return;
    }
    const state = this.headerActions.get(controller.view);
    if (!state) {
      return;
    }
    state.controllers?.delete(controller);
    if (state.controller === controller) {
      state.controller = this.pickHeaderController(controller.view, state);
    }
    if (state.controller) {
      state.button._noteDrawController = state.controller;
      state.button.classList.toggle("is-active", state.controller.active);
      state.button.classList.toggle("notedraw-webview-button", state.controller.surfaceType === "webview");
      return;
    }
    if (state.button?._noteDrawController) {
      delete state.button._noteDrawController;
    }
    state.button?.classList.remove("is-active");
    if (!controller.view?.containerEl?.isConnected) {
      state.button?.remove();
      this.headerActions.delete(controller.view);
      this.cleanupHeaderButtons(controller.view);
    }
  }
  resolveHeaderController(view, state, options = {}) {
    const controller = this.pickHeaderController(view, state, null, options);
    if (controller) {
      state.controller = controller;
      state.button._noteDrawController = controller;
      state.button.classList.toggle("is-active", controller.active);
      state.button.classList.toggle("notedraw-webview-button", controller.surfaceType === "webview");
    }
    return controller;
  }
  pickHeaderController(view, state, preferred = null, options = {}) {
    const controllers = Array.from(state.controllers || []).filter((controller) => controller?.previewEl?.isConnected && controller.view === view && controller.surfaceType !== "webview");
    if (options.preferPreviewOnAppleTouch && isAppleMobileRuntime() && isReadingSurfaceVisible(view)) {
      const previewController = this.resolveLivePreviewController(view, controllers);
      if (previewController) {
        return previewController;
      }
    }
    const currentMode = currentMarkdownSurfaceType(view);
    const preferredLive = preferred && controllers.includes(preferred) ? preferred : null;
    return controllers.find((controller) => controller.surfaceType === currentMode) || preferredLive || controllers.find((controller) => controller.active) || controllers[0] || null;
  }
  resolveLivePreviewController(view, controllers = []) {
    const preview = findRootPreviewForView(view);
    if (!preview || !view?.file) {
      return null;
    }
    const existing = this.controllers.get(preview) || preview._noteDrawController;
    if (existing?.plugin === this && !existing.destroyed && existing.previewEl?.isConnected && existing.surfaceType === "preview") {
      return existing;
    }
    if (!isRootPreviewReady(view, preview)) {
      resetDormantRootPreview(view, preview);
      return null;
    }
    const registered = controllers.find((controller) => controller.surfaceType === "preview" && controller.previewEl === preview);
    if (registered) {
      return registered;
    }
    cleanupDrawingUi(preview);
    const controller = new PreviewDrawingController(this, preview, view, view.file);
    this.controllers.set(preview, controller);
    controller.mount().catch((error) => {
      console.error(`[${PLUGIN_ID}] Failed to mount preview drawing controller`, error);
    });
    return controller;
  }
  cleanupHeaderButtons(view, keepButton = null) {
    view?.containerEl?.querySelectorAll(".notedraw-header-button").forEach((button) => {
      if (button !== keepButton) {
        button.remove();
      }
    });
  }
  async ensureDrawingDir() {
    const base = this.app.vault.configDir;
    const pluginDir = `${base}/plugins/${PLUGIN_ID}`;
    const drawingDir = `${pluginDir}/drawings`;
    await this.ensureFolder(`${base}/plugins`);
    await this.ensureFolder(pluginDir);
    await this.ensureFolder(drawingDir);
    return drawingDir;
  }
  async ensureAssetDir() {
    const base = this.app.vault.configDir;
    const pluginDir = `${base}/plugins/${PLUGIN_ID}`;
    const assetDir = `${pluginDir}/assets`;
    await this.ensureFolder(`${base}/plugins`);
    await this.ensureFolder(pluginDir);
    await this.ensureFolder(assetDir);
    return assetDir;
  }
  async ensureFolder(path) {
    const adapter = this.app.vault.adapter;
    const parts = normalizeVaultPath(path).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!await adapter.exists(current)) {
        await adapter.mkdir(current);
      }
    }
  }
  encodedDrawingNameForFile(file) {
    const encoded = file.path.replace(/\\/g, "/").replace(/[^a-zA-Z0-9._/-]/g, "_").replace(/\//g, "__");
    return `${encoded}.json`;
  }
  drawingStorageModeForFile(file, requestedMode = this.noteDrawSettings?.drawingStorageMode) {
    const mode = normalizeDrawingStorageMode(requestedMode);
    if (mode === DRAWING_STORAGE_CONFIG) {
      return mode;
    }
    const realFile = getVaultFileByPath(this.app.vault, file?.path || "");
    return realFile && String(realFile.extension || "").toLowerCase() === "md"
      ? mode
      : DRAWING_STORAGE_CONFIG;
  }
  drawingPathForFile(file, requestedMode = this.noteDrawSettings?.drawingStorageMode) {
    const mode = this.drawingStorageModeForFile(file, requestedMode);
    return resolveDrawingStoragePath({
      filePath: file?.path || "",
      configDir: this.app.vault.configDir,
      pluginId: PLUGIN_ID,
      encodedName: this.encodedDrawingNameForFile(file),
      mode
    });
  }
  drawingStorageKey(file, requestedMode = this.noteDrawSettings?.drawingStorageMode) {
    const mode = this.drawingStorageModeForFile(file, requestedMode);
    return `${mode}:${this.drawingPathForFile(file, mode)}`;
  }
  async ensureDrawingStorageDir(file, requestedMode = this.noteDrawSettings?.drawingStorageMode) {
    const mode = this.drawingStorageModeForFile(file, requestedMode);
    if (mode === DRAWING_STORAGE_EMBEDDED) {
      return "";
    }
    const path = this.drawingPathForFile(file, mode);
    const slash = path.lastIndexOf("/");
    const directory = slash >= 0 ? path.slice(0, slash) : "";
    if (directory) {
      await this.ensureFolder(directory);
    }
    return directory;
  }
  assetPathForName(name) {
    return `${this.app.vault.configDir}/plugins/${ASSET_DIR}/${sanitizeAssetFileName(name)}`;
  }
  legacyDrawingPathForFile(file) {
    return `${this.app.vault.configDir}/plugins/${LEGACY_DRAWING_DIR}/${this.encodedDrawingNameForFile(file)}`;
  }
  debugLogPath() {
    return `${this.app.vault.configDir}/plugins/${PLUGIN_ID}/${DEBUG_LOG_FILE}`;
  }
  async importLocalAsset(fileLike) {
    if (!fileLike) {
      return null;
    }
    await this.ensureAssetDir();
    const originalName = sanitizeAssetFileName(fileLike.name || "attachment.bin");
    const targetName = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${originalName}`;
    const targetPath = this.assetPathForName(targetName);
    const buffer = await fileLike.arrayBuffer();
    await this.app.vault.adapter.writeBinary(targetPath, buffer);
    const mime = fileLike.type || guessMimeType(originalName);
    const text = isTextAssetMime(originalName, mime) && typeof fileLike.text === "function" ? await fileLike.text() : "";
    const imageDataUrl = classifyImportedAsset({ name: originalName, mime }) === EMBED_IMAGE ? arrayBufferToDataUrl(buffer, mime) : "";
    return {
      path: targetPath,
      name: originalName,
      mime,
      size: Number(fileLike.size || buffer.byteLength || 0),
      text,
      imageDataUrl
    };
  }
  async assetDataUrl(assetPath, mime = "", file = null) {
    if (!assetPath) {
      return "";
    }
    const portable = this.portableResourceUrl(file, assetPath);
    if (portable) {
      return portable;
    }
    try {
      const buffer = await this.app.vault.adapter.readBinary(normalizeVaultPath(assetPath));
      return arrayBufferToDataUrl(buffer, mime || guessMimeType(assetPath));
    } catch (error) {
      void error;
      return "";
    }
  }
  async createPortableBundle(file, data, options = {}) {
    const sourceMarkdown = typeof options.sourceMarkdown === "string"
      ? stripNotedrawDataBlocks(options.sourceMarkdown)
      : stripNotedrawDataBlocks(await this.app.vault.cachedRead(file));
    const collected = await this.collectPortableResources(file, data, {
      includeMarkdownLinks: options.includeMarkdownLinks === true,
      sourceMarkdown
    });
    return {
      format: "notedraw-portable",
      version: 1,
      purpose: options.purpose === "share" ? "share" : "storage",
      sourcePath: normalizeVaultPath(file.path),
      updatedAt: options.updatedAt || (/* @__PURE__ */ new Date()).toISOString(),
      drawing: normalizeDrawingDataForStorage(data, file),
      resources: collected.resources,
      skippedResources: collected.failed
    };
  }
  async buildPortableMarkdownCopy(file) {
    const source = await this.app.vault.cachedRead(file);
    const bundle = await this.readDrawingDataApi(file, {
      purpose: "share",
      includeResources: true,
      includeMarkdownLinks: true,
      sourceMarkdown: source
    });
    return {
      bundle,
      markdown: await appendNotedrawDataBlock(source, bundle)
    };
  }
  shareCopyPathForFile(file) {
    const normalizedPath = normalizeVaultPath(file?.path || "");
    const slash = normalizedPath.lastIndexOf("/");
    const parent = slash >= 0 ? normalizedPath.slice(0, slash) : "";
    const originalBase = String(file?.basename || file?.name || "NoteDraw").replace(/\.notedraw$/i, "");
    const base = sanitizeAssetFileName(originalBase || "NoteDraw");
    let index = 1;
    while (true) {
      const suffix = index === 1 ? "" : `-${index}`;
      const name = `${base}.notedraw${suffix}.md`;
      const path = normalizeVaultPath(parent ? `${parent}/${name}` : name);
      if (!getVaultFileByPath(this.app.vault, path)) {
        return path;
      }
      index += 1;
    }
  }
  async createAndOpenShareCopy(file, markdown, bundle) {
    const path = this.shareCopyPathForFile(file);
    const copyFile = await this.app.vault.create(path, markdown);
    this.rememberPortableBundle(copyFile, normalizePortableBundle(bundle, copyFile));
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(copyFile, { active: true });
    if (typeof leaf.setViewState === "function") {
      await leaf.setViewState({
        type: "markdown",
        state: { file: copyFile.path, mode: "preview", source: false },
        active: true
      });
    }
    await this.app.workspace.revealLeaf?.(leaf);
    await this.waitForShareCopyPreview(copyFile, leaf);
    return copyFile;
  }
  async waitForShareCopyPreview(file, leaf) {
    const path = normalizeVaultPath(file?.path || "");
    const deadline = Date.now() + 1e4;
    while (Date.now() < deadline) {
      const view = leaf?.view;
      const preview = view instanceof MarkdownView && normalizeVaultPath(view.file?.path || "") === path
        ? findRootPreviewForView(view)
        : null;
      if (preview?.isConnected && isMarkdownPreviewVisible(view, preview) && isRootPreviewReady(view, preview)) {
        await this.hydratePortableMarkdownResources(preview, path);
        const controller = this.resolveLivePreviewController(view);
        if (controller) {
          await controller.ensureDrawingsLoaded();
          controller.requestRender(true);
          await waitForNextFrame();
          await waitForNextFrame();
          if (controller.drawingsLoaded && controller.canvas?.isConnected && controller.renderFrameId === null) {
            return controller;
          }
        }
      }
      this.runSurfaceSync();
      await waitForNextFrame();
    }
    throw new Error("NoteDraw share copy did not finish its first preview frame");
  }
  async collectPortableResources(file, data, options = {}) {
    const resources = /* @__PURE__ */ new Map();
    const failed = [];
    const existing = normalizePortableResources(this.portableBundles.get(normalizeVaultPath(file?.path || ""))?.resources);
    const addExisting = (reference, aliases = []) => {
      const resource = findPortableResource(existing, reference, aliases);
      if (!resource) {
        return false;
      }
      resources.set(portableResourceIdentity(resource), resource);
      return true;
    };
    const addReference = async (reference, aliases = []) => {
      const normalizedReference = String(reference || "").trim();
      if (!normalizedReference) {
        return;
      }
      if (addExisting(normalizedReference, aliases)) {
        return;
      }
      try {
        const resource = await this.loadPortableResource(normalizedReference, file, aliases);
        if (resource) {
          resources.set(portableResourceIdentity(resource), resource);
        } else {
          failed.push(normalizedReference);
        }
      } catch (error) {
        console.warn(`[${PLUGIN_ID}] Skipped portable resource`, normalizedReference, error);
        failed.push(normalizedReference);
      }
    };
    const drawingReferences = [];
    for (const stroke of Array.isArray(data?.strokes) ? data.strokes : []) {
      if (stroke?.assetPath) {
        drawingReferences.push(addReference(stroke.assetPath, [stroke.assetName, stroke.text].filter(Boolean)));
      }
      const renderMode = normalizeTextRenderMode(stroke?.render);
      if (renderMode === TEXT_RENDER_NOTE && stroke?.text) {
        drawingReferences.push(addReference(stroke.text));
      } else if (renderMode === TEXT_RENDER_MARKDOWN) {
        for (const reference of extractPortableMarkdownLinks(stroke?.text)) {
          drawingReferences.push(addReference(reference));
        }
      } else if (renderMode === TEXT_RENDER_HTML) {
        for (const reference of extractPortableHtmlLinks(stroke?.text)) {
          drawingReferences.push(addReference(reference));
        }
      }
      const mindMapSource = normalizeMindMapNode(stroke?.mindMapNode)?.sourcePath;
      if (mindMapSource) {
        drawingReferences.push(addReference(mindMapSource));
      }
    }
    await Promise.all(drawingReferences);
    if (options.includeMarkdownLinks) {
      const cache = this.app.metadataCache.getFileCache?.(file);
      const links = [...Array.from(cache?.embeds || []), ...Array.from(cache?.links || [])]
        .map((entry) => entry?.link)
        .filter(Boolean);
      const fallbackLinks = extractPortableMarkdownLinks(options.sourceMarkdown);
      const markdownReferences = Array.from(new Set([...links, ...fallbackLinks]));
      for (const reference of markdownReferences) {
        await addReference(reference);
      }
    } else if (existing.length) {
      for (const reference of extractPortableMarkdownLinks(options.sourceMarkdown)) {
        addExisting(reference);
      }
    }
    return {
      resources: Array.from(resources.values()),
      failed: Array.from(new Set(failed))
    };
  }
  async loadPortableResource(reference, ownerFile, aliases = []) {
    const raw = String(reference || "").trim();
    if (!raw || raw.startsWith("#") || /^(?:mailto|tel|obsidian):/i.test(raw)) {
      return null;
    }
    const cacheKey = /^(?:https?:|data:)/i.test(raw)
      ? raw
      : `${normalizeVaultPath(ownerFile?.path || "")}|${raw}`;
    const existingPromise = this.portableResourceCache.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }
    const loading = this.readPortableResource(raw, ownerFile, aliases).finally(() => {
      while (this.portableResourceCache.size > PORTABLE_RESOURCE_CACHE_LIMIT) {
        this.portableResourceCache.delete(this.portableResourceCache.keys().next().value);
      }
    });
    this.portableResourceCache.set(cacheKey, loading);
    return loading;
  }
  async readPortableResource(reference, ownerFile, aliases = []) {
    const raw = String(reference || "").trim();
    if (/^data:[^;,]+;base64,/i.test(raw)) {
      const comma = raw.indexOf(",");
      const mime = raw.slice(5, raw.indexOf(";", 5)) || "application/octet-stream";
      const dataBase64 = raw.slice(comma + 1).replace(/\s+/g, "");
      return normalizePortableResource({
        id: portableResourceId(raw),
        source: raw,
        resolvedPath: raw,
        aliases,
        name: "embedded-resource",
        mime,
        size: Math.floor(dataBase64.length * 0.75),
        dataBase64
      });
    }
    if (/^https?:\/\//i.test(raw)) {
      const response = await requestUrl({ url: raw, method: "GET" });
      const buffer = response.arrayBuffer;
      const mime = portableResponseMime(response.headers) || portableMimeType(raw);
      return normalizePortableResource({
        id: portableResourceId(raw),
        source: raw,
        resolvedPath: raw,
        aliases,
        name: portableUrlName(raw),
        mime,
        size: buffer.byteLength,
        dataBase64: arrayBufferToBase64(buffer)
      });
    }
    const linkPath = unwrapWikiLink(raw.replace(/^!/, "")).split("|")[0].split("#")[0].trim();
    const linkedFile = this.app.metadataCache.getFirstLinkpathDest?.(linkPath, ownerFile?.path || "")
      || getVaultFileByPath(this.app.vault, linkPath);
    if (linkedFile) {
      const buffer = await this.app.vault.readBinary(linkedFile);
      return normalizePortableResource({
        id: portableResourceId(linkedFile.path),
        source: raw,
        resolvedPath: normalizeVaultPath(linkedFile.path),
        aliases: [linkPath, linkedFile.name, ...aliases],
        name: linkedFile.name,
        mime: portableMimeType(linkedFile.name),
        size: buffer.byteLength,
        dataBase64: arrayBufferToBase64(buffer)
      });
    }
    const adapterPath = normalizeVaultPath(linkPath || raw);
    if (!adapterPath || !await this.app.vault.adapter.exists(adapterPath)) {
      return null;
    }
    const buffer = await this.app.vault.adapter.readBinary(adapterPath);
    return normalizePortableResource({
      id: portableResourceId(adapterPath),
      source: raw,
      resolvedPath: adapterPath,
      aliases: [adapterPath.split("/").pop(), ...aliases],
      name: adapterPath.split("/").pop() || "attachment.bin",
      mime: portableMimeType(adapterPath),
      size: buffer.byteLength,
      dataBase64: arrayBufferToBase64(buffer)
    });
  }
  portableResource(file, reference) {
    const bundle = this.portableBundles.get(normalizeVaultPath(file?.path || ""));
    return findPortableResource(bundle?.resources, reference);
  }
  portableResourceUrl(file, reference) {
    const resource = this.portableResource(file, reference);
    return resource ? portableResourceDataUrl(resource) : "";
  }
  async hydratePortableMarkdownResources(root, sourcePath) {
    if (!root?.querySelectorAll) {
      return;
    }
    const file = getVaultFileByPath(this.app.vault, sourcePath);
    const bundle = file ? await this.loadPortableBundle(file) : null;
    const resources = normalizePortableResources(bundle?.resources);
    if (!resources.length || !root.isConnected) {
      return;
    }
    const elements = [root, ...Array.from(root.querySelectorAll("img, video, audio, source, a, .internal-embed"))];
    for (const element of elements) {
      if (!element?.matches?.("img, video, audio, source, a, .internal-embed")) {
        continue;
      }
      const references = portableElementReferences(element);
      const resource = references.map((reference) => findPortableResource(resources, reference)).find(Boolean);
      if (!resource) {
        continue;
      }
      const dataUrl = portableResourceDataUrl(resource);
      const tag = String(element.tagName || "").toLowerCase();
      if (["img", "video", "audio", "source"].includes(tag)) {
        element.setAttribute("src", dataUrl);
        element.dataset.notedrawPortableResource = resource.id;
        continue;
      }
      if (tag === "a") {
        element.setAttribute("href", dataUrl);
        element.setAttribute("download", resource.name || "attachment.bin");
        element.classList.remove("internal-link", "is-unresolved");
        element.dataset.notedrawPortableResource = resource.id;
        continue;
      }
      await this.renderPortableInternalEmbed(element, resource, file);
    }
  }
  async renderPortableInternalEmbed(element, resource, ownerFile) {
    if (element.dataset.notedrawPortableResource === resource.id) {
      return;
    }
    element.dataset.notedrawPortableResource = resource.id;
    const dataUrl = portableResourceDataUrl(resource);
    const mime = String(resource.mime || "").toLowerCase();
    const host = element.createDiv({ cls: "notedraw-portable-resource" });
    if (mime.startsWith("image/")) {
      host.createEl("img", { attr: { src: dataUrl, alt: resource.name || "Image" } });
      return;
    }
    if (mime.startsWith("video/")) {
      host.createEl("video", { attr: { src: dataUrl, controls: "true", playsinline: "true" } });
      return;
    }
    if (mime.startsWith("audio/")) {
      host.createEl("audio", { attr: { src: dataUrl, controls: "true" } });
      return;
    }
    if (mime === "text/markdown") {
      await MarkdownRenderer.render(this.app, portableResourceText(resource), host, ownerFile?.path || "", this);
      return;
    }
    const link = host.createEl("a", {
      text: resource.name || "Attachment",
      attr: { href: dataUrl, download: resource.name || "attachment.bin" }
    });
    setIcon(link.createSpan({ cls: "notedraw-portable-resource-icon" }), "paperclip");
  }
  async shareNoteDrawFile(file) {
    const key = normalizeVaultPath(file?.path || "");
    if (!key || this.sharePackagePromises.has(key)) {
      return this.sharePackagePromises.get(key);
    }
    new Notice(this.t("sharePreparing"));
    const sharing = (async () => {
      try {
        const { markdown, bundle } = await this.buildPortableMarkdownCopy(file);
        const copyFile = await this.createAndOpenShareCopy(file, markdown, bundle);
        const name = copyFile.name;
        const shareFile = typeof File === "function"
          ? new File([markdown], name, { type: "text/markdown;charset=utf-8" })
          : null;
        const shareData = shareFile ? { title: copyFile.basename || file.basename || "NoteDraw", files: [shareFile] } : null;
        let shared = false;
        let canUseNativeShare = Boolean(shareData && typeof navigator !== "undefined" && typeof navigator.share === "function");
        if (canUseNativeShare && typeof navigator.canShare === "function") {
          try {
            canUseNativeShare = navigator.canShare(shareData);
          } catch {
            canUseNativeShare = false;
          }
        }
        if (canUseNativeShare) {
          try {
            await navigator.share(shareData);
            shared = true;
          } catch (error) {
            if (error?.name === "AbortError") {
              return;
            }
          }
        }
        if (!shared) {
          this.downloadPortableMarkdown(markdown, name);
          new Notice(this.t("shareDownloaded"));
        } else {
          new Notice(this.t("shareReady", { count: bundle.resources.length }));
        }
      } catch (error) {
        console.error(`[${PLUGIN_ID}] Failed to share portable NoteDraw file`, error);
        new Notice(this.t("shareFailed"));
      }
    })().finally(() => {
      this.sharePackagePromises.delete(key);
    });
    this.sharePackagePromises.set(key, sharing);
    return sharing;
  }
  downloadPortableMarkdown(markdown, name) {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = activeDocument.body.createEl("a", {
      attr: { href: url, download: name, "aria-hidden": "true" }
    });
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  async appendDebugLog(entry) {
    if (!this.noteDrawSettings?.enableDebugLog) {
      return;
    }
    try {
      await this.ensureDrawingDir();
      const path = this.debugLogPath();
      const adapter = this.app.vault.adapter;
      const line = JSON.stringify({
        time: (/* @__PURE__ */ new Date()).toISOString(),
        ...entry
      });
      let lines = [];
      if (await adapter.exists(path)) {
        lines = String(await adapter.read(path) || "").split(/\r?\n/).filter(Boolean).slice(-(DEBUG_LOG_LIMIT - 1));
      }
      lines.push(line);
      await adapter.write(path, `${lines.join("\n")}
`);
    } catch (error) {
      console.error(`[${PLUGIN_ID}] Failed to write debug log`, error);
    }
  }
  async readDrawings(file, options = {}) {
    const storageMode = this.drawingStorageModeForFile(file);
    const storageKey = this.drawingStorageKey(file, storageMode);
    const pending = this.pendingDrawingSaves.get(storageKey);
    if (pending?.entries?.length) {
      const latest = materializeDrawingSaveRequest(
        this.drawingStateCache.get(storageKey),
        pending,
        normalizeDrawingDataForStorage
      );
      return normalizeDrawingData(latest, file);
    }
    const cached = this.drawingStateCache.get(storageKey);
    if (cached) {
      return normalizeDrawingData(cached, file);
    }
    try {
      const adapter = this.app.vault.adapter;
      const selectedPath = storageMode === DRAWING_STORAGE_EMBEDDED ? "" : this.drawingPathForFile(file, storageMode);
      const configPath = this.drawingPathForFile(file, DRAWING_STORAGE_CONFIG);
      const legacyPath = this.legacyDrawingPathForFile(file);
      const portableBundle = await this.loadPortableBundle(file);
      const candidates = [];
      if (portableBundle?.drawing) {
        candidates.push({
          kind: "portable",
          priority: storageMode === DRAWING_STORAGE_EMBEDDED ? 4 : portableBundle.purpose === "share" ? 3 : 2,
          updatedAt: portableBundle.updatedAt || portableBundle.drawing.updatedAt,
          data: portableBundle.drawing
        });
      }
      const storedPaths = Array.from(new Set([selectedPath, configPath].filter(Boolean)));
      for (const path of storedPaths) {
        if (!await adapter.exists(path)) {
          continue;
        }
        try {
          const data = JSON.parse(await adapter.read(path));
          candidates.push({
            kind: path === selectedPath ? "selected" : "config",
            priority: path === selectedPath ? 5 : 2,
            updatedAt: data?.updatedAt,
            data
          });
        } catch (error) {
          console.warn(`[${PLUGIN_ID}] Skipped invalid drawing data`, path, error);
        }
      }
      if (await adapter.exists(legacyPath)) {
        try {
          const data = JSON.parse(await adapter.read(legacyPath));
          candidates.push({ kind: "legacy", priority: 1, updatedAt: data?.updatedAt, data });
        } catch (error) {
          console.warn(`[${PLUGIN_ID}] Skipped invalid legacy drawing data`, legacyPath, error);
        }
      }
      candidates.sort((a, b) => portableTimestamp(b.updatedAt) - portableTimestamp(a.updatedAt) || b.priority - a.priority);
      const selected = candidates[0] || null;
      const data = selected ? normalizeDrawingData(selected.data, file) : createEmptyDrawingData(file);
      this.drawingStateCache.set(storageKey, normalizeDrawingData(data, file));
      if (selected?.kind === "legacy" && options.migrateLegacy !== false) {
        await this.writeDrawings(file, data, { refresh: false });
      }
      return data;
    } catch (error) {
      console.error(`[${PLUGIN_ID}] Failed to read drawing file`, error);
      return createEmptyDrawingData(file);
    }
  }
  async loadPortableBundle(file, options = {}) {
    const realFile = getVaultFileByPath(this.app.vault, file?.path || "");
    if (!realFile || String(realFile.extension || "").toLowerCase() !== "md") {
      return null;
    }
    const key = normalizeVaultPath(realFile.path);
    if (!options.refresh && this.portableBundles.has(key)) {
      return this.portableBundles.get(key);
    }
    if (!options.refresh && this.portableBundleLoads.has(key)) {
      return this.portableBundleLoads.get(key);
    }
    const loading = this.app.vault.cachedRead(realFile).then(async (source) => {
      const decoded = await decodeNotedrawDataBlock(source);
      const bundle = normalizePortableBundle(decoded, realFile);
      this.rememberPortableBundle(realFile, bundle);
      return bundle;
    }).catch((error) => {
      console.error(`[${PLUGIN_ID}] Failed to read embedded NoteDraw data`, error);
      this.rememberPortableBundle(realFile, null);
      return null;
    }).finally(() => {
      if (this.portableBundleLoads.get(key) === loading) {
        this.portableBundleLoads.delete(key);
      }
    });
    this.portableBundleLoads.set(key, loading);
    return loading;
  }
  rememberPortableBundle(file, bundle) {
    const key = normalizeVaultPath(file?.path || "");
    if (!key) {
      return;
    }
    this.portableBundles.delete(key);
    this.portableBundles.set(key, bundle || null);
    while (this.portableBundles.size > PORTABLE_RESOURCE_CACHE_LIMIT) {
      this.portableBundles.delete(this.portableBundles.keys().next().value);
    }
  }
  scheduleDrawingSave(file, data, options = {}) {
    const path = this.drawingStorageKey(file);
    if (options.replace !== true && options.userOperation !== true) {
      this.suppressedDrawingSaves.push({
        at: Date.now(),
        path,
        strokeCount: Array.isArray(data?.strokes) ? data.strokes.length : 0,
        markdownBlockCount: Array.isArray(data?.markdownBlocks) ? data.markdownBlocks.length : 0,
        stack: new Error().stack || ""
      });
      this.suppressedDrawingSaves.splice(0, Math.max(0, this.suppressedDrawingSaves.length - 20));
      return false;
    }
    this.pendingDrawingSaves.set(path, coalesceDrawingSaveRequest(
      this.pendingDrawingSaves.get(path),
      {
        file,
        data,
        excludeData: options.excludeData || data,
        replace: options.replace === true
      }
    ));
    this.cancelScheduledDrawingSave(path);
    const timer = window.setTimeout(() => {
      this.saveTimers.delete(path);
      const run = () => {
        this.saveIdleCallbacks.delete(path);
        this.flushDrawingSave(path).catch((error) => {
          console.error(`[${PLUGIN_ID}] Failed to save drawing file`, error);
          new Notice(this.t("failedSaveDrawing"));
        });
      };
      if (typeof window.requestIdleCallback === "function") {
        const idleId = window.requestIdleCallback(run, { timeout: 800 });
        this.saveIdleCallbacks.set(path, idleId);
      } else {
        run();
      }
    }, this.noteDrawSettings?.autoSaveDelayMs ?? DEFAULT_SETTINGS.autoSaveDelayMs);
    this.saveTimers.set(path, timer);
    return true;
  }
  cancelScheduledDrawingSave(path) {
    const timer = this.saveTimers.get(path);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.saveTimers.delete(path);
    }
    const idleId = this.saveIdleCallbacks.get(path);
    if (idleId !== undefined) {
      window.cancelIdleCallback?.(idleId);
      this.saveIdleCallbacks.delete(path);
    }
  }
  async flushDrawingSave(path) {
    this.cancelScheduledDrawingSave(path);
    const request = this.pendingDrawingSaves.get(path);
    if (!request) {
      return;
    }
    if (this.pendingDrawingSaves.get(path) === request) {
      this.pendingDrawingSaves.delete(path);
    }
    const previousWrite = this.drawingWritePromises.get(path) || Promise.resolve();
    const write = previousWrite.catch(() => void 0).then(async () => {
      const canonical = materializeDrawingSaveRequest(
        this.drawingStateCache.get(path),
        request,
        normalizeDrawingDataForStorage
      );
      if (!canonical) {
        return;
      }
      this.drawingStateCache.set(path, canonical);
      const lastEntry = request.entries[request.entries.length - 1];
      this.refreshControllersForFile(request.file, canonical, { excludeData: lastEntry?.excludeData });
      const compacted = normalizeDrawingDataForStorage(canonical, request.file);
      compactDrawingData(compacted, this.noteDrawSettings?.drawingCompactDistance ?? DEFAULT_SETTINGS.drawingCompactDistance);
      await this.writeDrawings(request.file, compacted, { normalized: true, refresh: false, updateCache: false });
    });
    this.drawingWritePromises.set(path, write);
    try {
      await write;
    } finally {
      if (this.drawingWritePromises.get(path) === write) {
        this.drawingWritePromises.delete(path);
      }
    }
  }
  async writeDrawings(file, data, options = {}) {
    const storageMode = this.drawingStorageModeForFile(file);
    const path = this.drawingPathForFile(file, storageMode);
    const storageKey = this.drawingStorageKey(file, storageMode);
    const normalized = options.normalized === true ? data : normalizeDrawingDataForStorage(data, file);
    const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    normalized.updatedAt = updatedAt;
    if (options.updateCache !== false) {
      this.drawingStateCache.set(storageKey, normalizeDrawingData(normalized, file));
    }
    let storagePath = path;
    if (storageMode === DRAWING_STORAGE_EMBEDDED) {
      const realFile = getVaultFileByPath(this.app.vault, file?.path || "");
      if (!realFile) {
        throw new Error(`Cannot embed NoteDraw data in missing Markdown file: ${file?.path || ""}`);
      }
      const bundle = await this.createPortableBundle(realFile, normalized, {
        purpose: "storage",
        includeMarkdownLinks: false,
        updatedAt
      });
      const block = await encodeNotedrawDataBlock(bundle);
      if (typeof this.app.vault.process === "function") {
        await this.app.vault.process(realFile, (source) => appendEncodedNotedrawDataBlock(source, block));
      } else {
        const source = await this.app.vault.cachedRead(realFile);
        await this.app.vault.modify(realFile, appendEncodedNotedrawDataBlock(source, block));
      }
      this.rememberPortableBundle(realFile, bundle);
      storagePath = `${realFile.path}#NOTEDRAW_DATA_BEGIN`;
    } else {
      await this.ensureDrawingStorageDir(file, storageMode);
      const body = JSON.stringify({
        ...normalized,
        sourcePath: file.path,
        updatedAt
      }, null, 2);
      await this.app.vault.adapter.write(path, body);
    }
    if (options.refresh !== false) {
      this.refreshControllersForFile(file, normalized, { excludeData: data });
    }
    this.emitApiEvent("drawings-changed", {
      file: file.path,
      storagePath,
      strokeCount: normalized.strokes.length,
      updatedAt
    });
  }
  async injectExportSnapshot(file, container) {
    if (!file || !(container instanceof HTMLElement)) {
      return null;
    }
    const host = findNoteDrawExportHost(container);
    const liveLayers = Array.from(host.querySelectorAll(".notedraw-underlay-embed-layer, .notedraw-embed-layer"));
    const liveDrawingData = host._noteDrawController?.drawingData || container._noteDrawController?.drawingData || null;
    const imageLayer = await this.injectExportImageCanvasLayer(file, host, liveDrawingData);
    if (liveLayers.length) {
      await Promise.all(liveLayers.map((layer) => prepareExportImages(layer)));
      return imageLayer || liveLayers[liveLayers.length - 1];
    }
    return imageLayer;
  }
  async injectExportImageCanvasLayer(file, container, drawingData = null) {
    container.querySelectorAll(".notedraw-export-image-canvas-layer").forEach((element) => element.remove());
    const data = drawingData || await this.readDrawings(file);
    const imageStrokes = (Array.isArray(data?.strokes) ? data.strokes : []).filter(isImageEmbedStroke);
    if (!imageStrokes.length) {
      return null;
    }
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(container.scrollWidth || rect.width || 1));
    const height = Math.max(1, Math.ceil(container.scrollHeight || rect.height || 1));
    if (getComputedStyle(container).position === "static") {
      applyElementStyles(container, { position: "relative" });
    }
    const layer = activeDocument.createElement("div");
    layer.className = "notedraw-export-image-canvas-layer";
    applyElementStyles(layer, {
      position: "absolute",
      zIndex: "58",
      top: "0",
      left: "0",
      right: "auto",
      bottom: "auto",
      width: `${width}px`,
      height: `${height}px`,
      pointerEvents: "none",
      userSelect: "none",
      background: "transparent"
    });
    container.appendChild(layer);
    let drewImage = false;
    for (const stroke of imageStrokes) {
      drewImage = await this.drawExportImageStrokeOn(layer, stroke, width, height) || drewImage;
    }
    if (!drewImage) {
      layer.remove();
      return null;
    }
    window.setTimeout(() => {
      layer.remove();
    }, 3e4);
    return layer;
  }
  async drawExportImageStrokeOn(layer, stroke, width, height) {
    const bounds = getStrokeBounds(stroke, width, height);
    if (!bounds) {
      return false;
    }
    const source = normalizeImageDataUrl(stroke.exportImageDataUrl) || await this.assetDataUrl(stroke.assetPath, stroke.assetMime || guessMimeType(stroke.assetName || stroke.assetPath), file);
    if (!source) {
      return false;
    }
    const image = await loadExportImage(source, 2200);
    if (!image?.naturalWidth || !image?.naturalHeight) {
      return false;
    }
    const x = Math.round(bounds.minX);
    const y = Math.round(bounds.minY);
    const boxWidth = Math.max(1, Math.round(bounds.maxX - bounds.minX));
    const boxHeight = Math.max(1, Math.round(bounds.maxY - bounds.minY));
    const fit = objectFitContain(image.naturalWidth, image.naturalHeight, boxWidth, boxHeight);
    const scale = Math.min(2, Math.max(1, Number(window.devicePixelRatio || 1)));
    const canvas = activeDocument.createElement("canvas");
    canvas.className = "notedraw-export-image-canvas";
    canvas.width = Math.ceil(boxWidth * scale);
    canvas.height = Math.ceil(boxHeight * scale);
    const opacity = clamp(Number(stroke.opacity ?? 1), 0, 1);
    canvas.dataset.notedrawAssetPath = stroke.assetPath || "";
    canvas.dataset.notedrawAssetName = stroke.assetName || "";
    canvas.dataset.notedrawAssetMime = stroke.assetMime || "";
    canvas.dataset.notedrawAssetSize = String(stroke.assetSize || 0);
    applyElementStyles(canvas, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: `${boxWidth}px`,
      height: `${boxHeight}px`,
      pointerEvents: "none",
      userSelect: "none",
      background: "#fff",
      opacity: String(opacity)
    });
    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, boxWidth, boxHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.globalAlpha = opacity;
    context.drawImage(image, fit.x, fit.y, fit.width, fit.height);
    layer.appendChild(canvas);
    return true;
  }
  getPluginAssetPath(relativePath) {
    const pluginDir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    return normalizePath(`${pluginDir}/${relativePath}`);
  }
  async getOptionalAssetResourcePath(relativePath) {
    const assetPath = this.getPluginAssetPath(relativePath);
    if (!await this.app.vault.adapter.exists(assetPath)) {
      return null;
    }
    return this.app.vault.adapter.getResourcePath(assetPath);
  }
  prepareTextEditState(file, originalText, element, controller = null) {
    const state = this.getTextSaveState(file, originalText, element);
    state.file = file;
    state.baselineText = originalText;
    state.latestText = originalText;
    state.latestSourceInfo = getSourceInfo(element);
    state.target = null;
    state.controller = controller || state.controller;
    state.targetPromise = this.resolveTextEditTarget(file, originalText, element).then((target) => {
      state.target = target;
      return target;
    }).catch((error) => {
      console.error(`[${PLUGIN_ID}] Failed to resolve text edit target`, error);
      return null;
    });
    return state;
  }
  async resolveTextEditTarget(file, originalText, element) {
    const sourceInfo = getSourceInfo(element);
    const source = await this.app.vault.read(file);
    const target = resolveSourceEditTarget(source, sourceInfo, originalText);
    this.appendDebugLog({
      event: "resolve-target",
      file: file.path,
      sourceInfo: summarizeSourceInfo(sourceInfo),
      original: shortText(originalText),
      hasTarget: Boolean(target),
      target: summarizeTarget(target)
    });
    return target;
  }
  scheduleTextSave(file, originalText, editedText, element, controller = null) {
    const state = this.getTextSaveState(file, originalText, element);
    state.file = file;
    state.latestText = editedText;
    state.latestSourceInfo = getSourceInfo(element);
    state.controller = controller || state.controller;
    state.saveBlocked = false;
    state.saveLogged = false;
    if (!state.target && !state.targetPromise) {
      state.targetPromise = this.resolveTextEditTarget(file, originalText, element).then((target) => {
        state.target = target;
        return target;
      }).catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to resolve text edit target`, error);
        return null;
      });
    }
    if (state.timer) {
      window.clearTimeout(state.timer);
    }
    element.addClass("notedraw-saving");
    state.timer = window.setTimeout(() => {
      state.timer = null;
      this.flushTextSave(element);
    }, TEXT_SAVE_DELAY_MS);
  }
  stageTextSave(file, originalText, editedText, element, controller = null) {
    const state = this.getTextSaveState(file, originalText, element);
    state.file = file;
    state.latestText = editedText;
    state.latestSourceInfo = getSourceInfo(element);
    state.controller = controller || state.controller;
    state.saveBlocked = false;
    state.saveLogged = false;
    if (!state.target && !state.targetPromise) {
      state.targetPromise = this.resolveTextEditTarget(file, originalText, element).then((target) => {
        state.target = target;
        return target;
      }).catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to resolve text edit target`, error);
        return null;
      });
    }
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    return state;
  }
  scheduleTextSaveNow(file, originalText, editedText, element, controller = null) {
    const state = this.getTextSaveState(file, originalText, element);
    state.file = file;
    state.latestText = editedText;
    state.latestSourceInfo = getSourceInfo(element);
    state.controller = controller || state.controller;
    state.saveBlocked = false;
    state.saveLogged = false;
    if (!state.target && !state.targetPromise) {
      state.targetPromise = this.resolveTextEditTarget(file, originalText, element).then((target) => {
        state.target = target;
        return target;
      }).catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to resolve text edit target`, error);
        return null;
      });
    }
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    element.addClass("notedraw-saving");
    return this.flushTextSave(element);
  }
  getTextSaveState(file, originalText, element) {
    let state = this.textSaveStates.get(element);
    if (!state) {
      state = {
        file,
        baselineText: originalText,
        latestText: originalText,
        latestSourceInfo: getSourceInfo(element),
        target: null,
        targetPromise: null,
        timer: null,
        saving: false,
        pending: false,
        saveBlocked: false,
        warningLogged: false,
        saveLogged: false
      };
      this.textSaveStates.set(element, state);
    }
    return state;
  }
  async flushTextSave(element) {
    const state = this.textSaveStates.get(element);
    if (!state) {
      return;
    }
    if (state.saving) {
      state.pending = true;
      return;
    }
    const baselineText = state.baselineText;
    const latestText = state.latestText;
    if (normalizeEditableSourceText(baselineText) === normalizeEditableSourceText(latestText)) {
      element.removeClass("notedraw-saving");
      return;
    }
    state.saving = true;
    try {
      if (state.targetPromise) {
        state.target = await state.targetPromise;
        state.targetPromise = null;
      }
      const result = await this.saveTextBlock(
        state.file,
        baselineText,
        latestText,
        state.latestSourceInfo,
        state.target
      );
      if (result.changed) {
        if (result.history && state.controller) {
          state.controller.recordMarkdownHistory(state.file, result.history.before, result.history.after, state);
        }
        state.baselineText = latestText;
        state.target = result.target || state.target;
        state.warningLogged = false;
        state.saveBlocked = false;
        element.dataset.noteDrawOriginal = latestText;
        element.removeClass("notedraw-save-failed");
        if (!state.saveLogged) {
          this.appendDebugLog({
            event: "save-ok",
            file: state.file?.path,
            sourceInfo: summarizeSourceInfo(state.latestSourceInfo),
            target: summarizeTarget(state.target),
            original: shortText(baselineText),
            edited: shortText(latestText)
          });
          state.saveLogged = true;
        }
      } else {
        element.addClass("notedraw-save-failed");
        state.saveBlocked = true;
        if (!state.warningLogged) {
          console.warn(`[${PLUGIN_ID}] Could not find the original block to update`, {
            path: state.file?.path,
            sourceInfo: state.latestSourceInfo,
            originalLength: String(baselineText || "").length,
            editedLength: String(latestText || "").length
          });
          this.appendDebugLog({
            event: "save-miss",
            file: state.file?.path,
            sourceInfo: summarizeSourceInfo(state.latestSourceInfo),
            target: summarizeTarget(state.target),
            original: shortText(baselineText),
            edited: shortText(latestText)
          });
          state.warningLogged = true;
        }
      }
    } catch (error) {
      console.error(`[${PLUGIN_ID}] Failed to save text block`, error);
      element.addClass("notedraw-save-failed");
      this.appendDebugLog({
        event: "save-error",
        file: state.file?.path,
        sourceInfo: summarizeSourceInfo(state.latestSourceInfo),
        target: summarizeTarget(state.target),
        error: String(error?.message || error)
      });
    } finally {
      state.saving = false;
    }
    if (state.pending || normalizeEditableSourceText(state.baselineText) !== normalizeEditableSourceText(state.latestText)) {
      if (state.saveBlocked) {
        element.removeClass("notedraw-saving");
        return;
      }
      state.pending = false;
      state.timer = window.setTimeout(() => {
        state.timer = null;
        this.flushTextSave(element);
      }, TEXT_SAVE_DELAY_MS);
      return;
    }
    element.removeClass("notedraw-saving");
  }
  async flushTextSaveAndWait(element) {
    const state = this.textSaveStates.get(element);
    if (!state) {
      return true;
    }
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await this.flushTextSave(element);
      if (state.saveBlocked) {
        return false;
      }
      const settled = !state.saving && normalizeEditableSourceText(state.baselineText) === normalizeEditableSourceText(state.latestText);
      if (settled) {
        if (state.timer) {
          window.clearTimeout(state.timer);
          state.timer = null;
        }
        state.pending = false;
        return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    }
    return false;
  }
  discardTextSaveState(element) {
    const state = this.textSaveStates.get(element);
    if (state?.timer) {
      window.clearTimeout(state.timer);
    }
    this.textSaveStates.delete(element);
  }
  async saveTextBlock(file, originalText, editedText, sourceInfo, target) {
    const normalizedOriginal = normalizeRenderedText(originalText);
    if (!normalizedOriginal || normalizeEditableSourceText(originalText) === normalizeEditableSourceText(editedText)) {
      return { changed: true, target };
    }
    const source = await this.app.vault.read(file);
    const match = resolveLockedTarget(source, target, originalText) || resolveSourceEditTarget(source, sourceInfo, originalText);
    if (!match) {
      return { changed: false, target };
    }
    const replacement = formatReplacementBlock(match.text, editedText);
    const start = match.start;
    const end = match.end;
    const currentText = source.slice(start, end);
    const nextTarget = createTextEditTarget({
      ...match,
      end: start + replacement.length,
      text: replacement
    }, sourceInfo, editedText);
    if (currentText !== replacement) {
      const nextSource = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
      await this.app.vault.modify(file, nextSource);
      this.emitApiEvent("markdown-changed", {
        file: file.path,
        start,
        end,
        replacementLength: replacement.length
      });
      return { changed: true, target: nextTarget, history: { before: source, after: nextSource } };
    }
    return { changed: true, target: nextTarget };
  }
  async reorderTextBlock(file, movingElement, targetElement, placeAfter = false, sourceState = {}) {
    if (!file || !movingElement || !targetElement || movingElement === targetElement) {
      return false;
    }
    const source = await this.app.vault.read(file);
    const moving = resolveSourceEditTarget(source, sourceState.movingInfo || getSourceInfo(movingElement), sourceState.movingText || movingElement.innerText);
    const target = resolveSourceEditTarget(source, sourceState.targetInfo || getSourceInfo(targetElement), sourceState.targetText || targetElement.innerText);
    if (!moving || !target || moving.start === target.start || moving.start < target.end && moving.end > target.start) {
      return false;
    }
    const block = source.slice(moving.start, moving.end).trim();
    const without = `${source.slice(0, moving.start)}${source.slice(moving.end)}`;
    let insertion = placeAfter ? target.end : target.start;
    if (moving.start < insertion) {
      insertion -= moving.end - moving.start;
    }
    const before = without.slice(0, insertion).replace(/[ \t]+$/g, "");
    const after = without.slice(insertion).replace(/^[ \t]+/g, "");
    const separatorBefore = before && !before.endsWith("\n\n") ? before.endsWith("\n") ? "\n" : "\n\n" : "";
    const separatorAfter = after && !after.startsWith("\n\n") ? after.startsWith("\n") ? "\n" : "\n\n" : "";
    const nextSource = `${before}${separatorBefore}${block}${separatorAfter}${after}`;
    await this.app.vault.modify(file, nextSource);
    return { changed: true, before: source, after: nextSource };
  }
  async reorderTextBlocks(file, movingStates, targetElement, placeAfter = false, sourceState = {}) {
    if (!file || !Array.isArray(movingStates) || !movingStates.length || !targetElement) {
      return false;
    }
    const source = await this.app.vault.read(file);
    const lockedMovingTargets = Array.isArray(sourceState.lockedMovingTargets) ? sourceState.lockedMovingTargets : [];
    const moving = movingStates.map((state, index) => {
      const renderedText = state?.sourceText || state?.element?.innerText;
      const locked = lockedMovingTargets[index];
      if (locked) {
        return resolveLockedTarget(source, locked, renderedText);
      }
      return sourceState.strictMoving
        ? null
        : resolveSourceEditTarget(source, state?.sourceInfo || getSourceInfo(state?.element), renderedText);
    }).filter(Boolean).sort((a, b) => a.start - b.start);
    const targetText = sourceState.targetText || targetElement.innerText;
    const target = sourceState.lockedTarget
      ? resolveLockedTarget(source, sourceState.lockedTarget, targetText)
      : sourceState.strictTarget
        ? null
        : resolveSourceEditTarget(
          source,
          sourceState.targetInfo || getSourceInfo(targetElement),
          targetText
        );
    if (moving.length !== movingStates.length || !target || moving.some((item) => item.start === target.start || item.start < target.end && item.end > target.start)) {
      return false;
    }
    const uniqueMoving = moving.filter((item, index) => index === 0 || item.start !== moving[index - 1].start);
    const blocks = uniqueMoving.map((item) => source.slice(item.start, item.end).trim()).filter(Boolean);
    if (!blocks.length) {
      return false;
    }
    let insertion = placeAfter ? target.end : target.start;
    let without = source;
    for (const item of uniqueMoving.slice().sort((a, b) => b.start - a.start)) {
      without = `${without.slice(0, item.start)}${without.slice(item.end)}`;
      if (item.start < insertion) {
        insertion -= item.end - item.start;
      }
    }
    const before = without.slice(0, insertion).replace(/[ \t]+$/g, "");
    const after = without.slice(insertion).replace(/^[ \t]+/g, "");
    const joined = blocks.join("\n\n");
    const separatorBefore = before && !before.endsWith("\n\n") ? before.endsWith("\n") ? "\n" : "\n\n" : "";
    const separatorAfter = after && !after.startsWith("\n\n") ? after.startsWith("\n") ? "\n" : "\n\n" : "";
    const nextSource = `${before}${separatorBefore}${joined}${separatorAfter}${after}`;
    if (nextSource === source) {
      return { changed: false, before: source, after: source };
    }
    await this.app.vault.modify(file, nextSource);
    return { changed: true, before: source, after: nextSource };
  }
};
var PreviewDrawingController = class {
  constructor(plugin, previewEl, view, file, options = {}) {
    this.plugin = plugin;
    this.previewEl = previewEl;
    this.view = view;
    this.file = file;
    this.allowTextEdit = options.allowTextEdit !== false;
    this.surfaceType = options.surfaceType || "preview";
    this.embeddedSurface = Boolean(options.embeddedSurface);
    this.workspaceSurface = Boolean(options.workspaceSurface);
    this.workspaceViewType = String(options.workspaceViewType || "");
    this.registeredSurface = Boolean(options.registeredSurface);
    this.registeredSurfaceOwner = String(options.registeredSurfaceOwner || "");
    this.registeredSurfaceId = String(options.registeredSurfaceId || "");
    this.registeredSurfaceKey = String(options.registeredSurfaceKey || "");
    this.registeredSurfaceSource = options.registeredSurfaceSource || null;
    this.registeredSurfaceCapabilities = options.registeredSurfaceCapabilities || null;
    this.registeredSurfaceViewport = options.registeredSurfaceViewport || null;
    this.destroyed = false;
    this.plugin.liveControllers?.add(this);
    this.runtimeSettings = sanitizeSettings(this.plugin?.noteDrawSettings || {});
    this.active = this.plugin.controllerActivationState(this);
    this.drawingData = {
      version: 3,
      sourcePath: file.path,
      strokes: [],
      markdownBlocks: [],
      elementGroups: [],
      updatedAt: null
    };
    this.currentStroke = null;
    this.currentEditor = null;
    this.currentEditorFile = null;
    this.currentEditorEmbedded = false;
    this.textCommitBarrier = createAsyncCommitBarrier((error) => {
      console.error(`[${PLUGIN_ID}] Failed to settle an edit before history navigation`, error);
    });
    this.routedPointerController = null;
    this.routedPointerHost = null;
    this.currentTextRange = null;
    this.formatToolbar = null;
    this.formatToolbarManualPosition = null;
    this.formatToolbarDrag = null;
    this.formatColorInput = null;
    this.formatHighlightInput = null;
    this.formatSizeSelect = null;
    this.brushMode = this.runtimeSettings.lastBrushMode;
    this.brushVariants = {
      [BRUSH_PEN]: this.runtimeSettings.lastPenVariant,
      [BRUSH_WATERCOLOR]: this.runtimeSettings.lastWatercolorVariant
    };
    this.brushSettings = {
      [BRUSH_PEN]: {
        color: "#e53935",
        width: 3,
        opacity: DEFAULT_PEN_OPACITY,
        count: 1
      },
      [BRUSH_WATERCOLOR]: {
        color: "#3b82f6",
        width: 9,
        opacity: 0.45,
        count: 1
      }
    };
    this.selectedStrokeIndex = -1;
    this.selectedStrokeIndexes = /* @__PURE__ */ new Set();
    this.selectedMarkdownBlockIds = /* @__PURE__ */ new Set();
    this.enteredElementGroupIds = /* @__PURE__ */ new Set();
    this.selectionFilterCycle = null;
    this.selectionFrameSnapshot = null;
    this.selectionFrameAwaitingMarkdownSync = null;
    this.markdownBlockElements = /* @__PURE__ */ new Map();
    this.applySettings();
    this.penColor = this.brushSettings[BRUSH_PEN].color;
    this.penWidth = this.brushSettings[BRUSH_PEN].width;
    this.penOpacity = this.brushSettings[BRUSH_PEN].opacity;
    this.penCount = this.brushSettings[BRUSH_PEN].count;
    this.toolMode = normalizeToolMode(this.runtimeSettings.lastToolMode);
    if (this.workspaceSurface && this.toolMode === TOOL_EDIT_MD) {
      this.toolMode = TOOL_DRAW;
    }
    this.pointerDown = false;
    this.startedOnText = false;
    this.pointerStartPoint = null;
    this.pointerStartClient = null;
    this.pointerStartEditable = null;
    this.pointerStartSourceText = false;
    this.activePointerId = null;
    this.pendingSelectionTap = null;
    this.textHighlightLineRects = [];
    this.textHighlightTarget = null;
    this.connectorGesture = null;
    this.touchPointers = /* @__PURE__ */ new Map();
    this.multiTouchScrolling = false;
    this.multiTouchGestureMode = "undecided";
    this.multiTouchInitialDistance = null;
    this.multiTouchLastCenter = null;
    this.multiTouchLastDistance = null;
    this.multiTouchPendingCenter = null;
    this.multiTouchPendingDistance = null;
    this.multiTouchFrameId = null;
    this.multiTouchPinching = false;
    this.suppressTouchDrawing = false;
    this.draggingStroke = false;
    this.dragStrokeStartPoint = null;
    this.dragStrokePointerGeometry = null;
    this.dragStrokeOriginalPoints = null;
    this.dragStrokeOriginalPointBounds = null;
    this.dragStrokeIndexes = [];
    this.dragShouldSnap = false;
    this.dragStrokeOriginalNoteFlows = null;
    this.pendingDraggedNoteFlowIndexes = /* @__PURE__ */ new Set();
    this.dragStrokeOriginalBounds = null;
    this.dragStrokeOriginalBounds = null;
    this.dragStrokeMoved = false;
    this.dragStrokeHitIndex = -1;
    this.dragStrokePreserveSelection = false;
    this.dragMarkdownOriginalElements = null;
    this.dragMarkdownSourcePromise = null;
    this.dragMarkdownSourceIndexPromise = null;
    this.dragNoteFlowOriginalBounds = null;
    this.dragMarkdownDropTarget = null;
    this.dragMarkdownDropSide = null;
    this.dragMarkdownLastValidDrop = null;
    this.dragMarkdownDropFrameId = null;
    this.dragMarkdownDropClientX = null;
    this.dragMarkdownDropClientY = null;
    this.dragMarkdownOriginalClientBounds = null;
    this.dragMarkdownClientDeltaX = 0;
    this.dragContentLaneRect = null;
    this.dragMarkdownTextCommit = null;
    this.dragElementGroupBounds = null;
    this.dragDropGeometry = null;
    this.dragSnapOtherBounds = null;
    this.dragSnapOtherXValues = null;
    this.dragSnapOtherYValues = null;
    this.dragMovedElementIds = null;
    this.dragPendingConnectorIds = null;
    this.dragConnectorCandidates = null;
    this.dragConnectorById = null;
    this.dragHasBoxBackground = false;
    this.dragLastPointerEvent = null;
    this.dragLastPointerKey = "";
    this.dragNoteFlowDropFrameId = null;
    this.dragNoteFlowDropClientX = null;
    this.dragNoteFlowDropClientY = null;
    this.dragNoteFlowPlacement = null;
    this.dragNoteFlowTargetElement = null;
    this.noteFlowDropIndicator = null;
    this.resizingSelection = false;
    this.resizeSelectionHandle = null;
    this.resizeSelectionStartPoint = null;
    this.resizeSelectionStartClient = null;
    this.resizeSelectionOriginalBounds = null;
    this.resizeSelectionPreviewBounds = null;
    this.resizeSelectionOriginalStrokes = null;
    this.resizeSelectionOriginalMarkdownBlocks = null;
    this.resizeSelectionPointerGeometry = null;
    this.resizeSelectionClientBounds = null;
    this.resizeSelectionMoved = false;
    this.selectingStrokes = false;
    this.selectionStartPoint = null;
    this.selectionCurrentPoint = null;
    this.didMove = false;
    this.redoStack = [];
    this.drawingsVisible = true;
    this.buttonLongPressed = false;
    this.buttonLongPressTimer = null;
    this.suppressNextButtonClick = false;
    this.paletteOpen = false;
    this.brushPanelOpen = false;
    this.brushPanelMode = BRUSH_PEN;
    this.textPanelOpen = false;
    this.selectionMenuOpen = false;
    this.selectionLongPressTimer = null;
    this.selectionLongPressState = null;
    this.floatingControlsHost = null;
    this.floatingControlsInBody = false;
    this.textPreset = this.runtimeSettings.lastTextPreset;
    this.readingZoom = this.runtimeSettings.lastReadingZoom;
    this.readingZoomTarget = null;
    this.readingZoomBaseTarget = null;
    this.readingZoomBaseOrigin = null;
    this.readingZoomExtent = null;
    this.readingZoomStage = null;
    this.readingZoomStageParent = null;
    this.readingZoomStageNextSibling = null;
    this.readingZoomStyleState = /* @__PURE__ */ new Map();
    this.readingVirtualSectionFrameId = null;
    this.readingVirtualSectionsManaged = false;
    this.readingVirtualSectionSignature = "";
    this.readingVirtualStyleState = /* @__PURE__ */ new Map();
    this.readingLogicalSizerHeight = 0;
    this.readingZoomInteractionUntil = 0;
    this.readingZoomSettleTimer = null;
    this.initialReadingLayoutPrepared = false;
    this.readingTouchGuard = createReadingTouchGuardState();
    this.pendingEmbedTool = null;
    this.pendingMindMapFile = null;
    this.pendingMindMapOptions = null;
    this.noteFlowFrameId = null;
    this.noteFlowFallbackTimer = null;
    this.frozenNoteFlowRestoreFrameId = null;
    this.noteFlowOperationPending = false;
    this.noteFlowPersistencePending = false;
    this.noteFlowResizeTimer = null;
    this.noteFlowSuppressResizeUntil = 0;
    this.noteFlowSettleEpoch = "";
    this.noteFlowSettlePasses = 0;
    this.noteFlowAnchorRepairReady = false;
    this.noteFlowAnchorRepairComplete = false;
    this.noteFlowAnchorRepairTimer = null;
    this.noteFlowActivationRepairAttempted = false;
    this.noteFlowLayoutIncomplete = false;
    this.noteFlowStyledElements = /* @__PURE__ */ new Map();
    this.noteFlowLineSpacers = /* @__PURE__ */ new Map();
    this.noteFlowBlockSpacers = /* @__PURE__ */ new Map();
    this.noteFlowAvoidanceAnchors = /* @__PURE__ */ new Map();
    this.noteFlowLayoutSignature = "";
    this.frozenNoteFlowPreparation = null;
    this.frozenNoteFlowRetryFrameId = null;
    this.readingBottomSpacer = null;
    this.readingBottomSpacerHeight = 0;
    this.readingBottomExtentResizeAt = 0;
    const sharedToolbarState = this.plugin.controllerToolbarState(this);
    if (sharedToolbarState) {
      this.brushMode = [BRUSH_PEN, BRUSH_WATERCOLOR].includes(sharedToolbarState.brushMode) ? sharedToolbarState.brushMode : this.brushMode;
      for (const mode of [BRUSH_PEN, BRUSH_WATERCOLOR]) {
        this.brushVariants[mode] = normalizeBrushVariant(mode, sharedToolbarState.brushVariants?.[mode]);
      }
      this.toolMode = sharedToolbarState.toolMode || this.toolMode;
      this.paletteOpen = Boolean(sharedToolbarState.paletteOpen);
      this.brushPanelOpen = Boolean(sharedToolbarState.brushPanelOpen);
      this.brushPanelMode = [BRUSH_PEN, BRUSH_WATERCOLOR].includes(sharedToolbarState.brushPanelMode) ? sharedToolbarState.brushPanelMode : this.brushPanelMode;
      this.textPanelOpen = Boolean(sharedToolbarState.textPanelOpen);
      this.textPreset = sharedToolbarState.textPreset || this.textPreset;
      this.readingZoom = clamp(Number(sharedToolbarState.readingZoom) || 1, MIN_READING_ZOOM, MAX_READING_ZOOM);
      for (const mode of [BRUSH_PEN, BRUSH_WATERCOLOR]) {
        if (sharedToolbarState.brushSettings?.[mode]) {
          this.brushSettings[mode] = { ...this.brushSettings[mode], ...sharedToolbarState.brushSettings[mode] };
        }
      }
      this.syncCurrentBrushFields();
    }
    this.lastTextTap = null;
    this.underlayCanvas = activeDocument.createElement("canvas");
    this.underlayCanvas.width = 1;
    this.underlayCanvas.height = 1;
    this.underlayCtx = null;
    this.underlayCacheDirty = true;
    this.underlayEmbedLayer = null;
    this.embedLayer = null;
    this.embedNodes = /* @__PURE__ */ new Map();
    this.embedRenderTokens = /* @__PURE__ */ new Map();
    this.embedGeometryTokens = /* @__PURE__ */ new Map();
    this.canvasImageCache = /* @__PURE__ */ new Map();
    this.hiddenFileInput = null;
    this.canvasCssWidth = 1;
    this.canvasCssHeight = 1;
    this.canvasWindowTop = 0;
    this.canvasRenderHeight = 1;
    this.canvasBackingScale = 1;
    this.responsiveLayoutSignature = "";
    this.responsivePointsInitialized = false;
    this.responsiveLayoutContext = null;
    this.renderFrameId = null;
    this.pendingDomRender = false;
    this.pendingInteractionRender = false;
    this.resizeFrameId = null;
    this.resizeFallbackTimer = null;
    this.resizeNeedsLayout = false;
    this.resizeNeedsMeasure = false;
    this.resizePreserveNoteFlowAbsolute = false;
    this.resizePreserveAbsolutePlacement = false;
    this.responsiveProjectionPending = null;
    this.responsiveProjectionSettleTimer = null;
    this.responsiveProjectionPreserveNoteFlowAbsolute = false;
    this.scrollSettleTimer = null;
    this.positionFrameId = null;
    this.layoutRefreshGeneration = 0;
    this.markdownAnnotationTimer = null;
    this.markdownAnnotationNeedsLayout = false;
    this.lastScrollAt = 0;
    this.markdownRenderObserver = null;
    this.staticCanvas = activeDocument.createElement("canvas");
    this.staticCanvas.width = 1;
    this.staticCanvas.height = 1;
    this.staticCtx = null;
    this.staticCacheDirty = true;
    this.scrollContainer = null;
    this.scrollEventTarget = null;
    this.layoutMeasureEl = null;
    this.lastObservedPreviewWidth = 0;
    this.drawingsLoaded = false;
    this.loadingDrawings = null;
    this.drawingLoadGeneration = 0;
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onCanvasContextMenu = this.onCanvasContextMenu.bind(this);
    this.onPreviewContextMenu = this.onPreviewContextMenu.bind(this);
    this.onCanvasDoubleClick = this.onCanvasDoubleClick.bind(this);
    this.onPreviewDoubleClick = this.onPreviewDoubleClick.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onScroll = this.onScroll.bind(this);
    this.onReadingTouchPointerDown = this.onReadingTouchPointerDown.bind(this);
    this.onReadingTouchPointerMove = this.onReadingTouchPointerMove.bind(this);
    this.onReadingTouchPointerFinish = this.onReadingTouchPointerFinish.bind(this);
    this.onReadingClick = this.onReadingClick.bind(this);
    this.onReadingVirtualScrollCapture = this.onReadingVirtualScrollCapture.bind(this);
    this.onButtonClick = this.onButtonClick.bind(this);
    this.onButtonPointerDown = this.onButtonPointerDown.bind(this);
    this.onButtonPointerUp = this.onButtonPointerUp.bind(this);
    this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
    this.onDocumentPointerFinish = this.onDocumentPointerFinish.bind(this);
    this.onDocumentSelectionChange = this.onDocumentSelectionChange.bind(this);
    this.onDocumentKeyDown = this.onDocumentKeyDown.bind(this);
    this.onFormatToolbarDragMove = this.onFormatToolbarDragMove.bind(this);
    this.onFormatToolbarDragEnd = this.onFormatToolbarDragEnd.bind(this);
  }
  ensureReadingZoomStage(target = findResponsiveContentElement(this.previewEl, this.surfaceType)) {
    if (!this.usesVisualReadingZoom() || !target?.isConnected) {
      return null;
    }
    if (!this.readingZoomStage?.isConnected) {
      const stage = this.previewEl.ownerDocument.createElement("div");
      stage.classList.add("notedraw-reading-stage");
      this.readingZoomStageParent = target.parentElement || this.previewEl;
      this.readingZoomStageNextSibling = target.nextSibling;
      this.readingZoomStageParent.insertBefore(stage, target);
      this.readingZoomStage = stage;
    }
    if (target.parentElement !== this.readingZoomStage) {
      this.readingZoomStage.appendChild(target);
    }
    for (const element of [this.underlayEmbedLayer, this.underlayCanvas, this.staticCanvas, this.canvas, this.embedLayer]) {
      if (element && element.parentElement !== this.readingZoomStage) {
        this.readingZoomStage.appendChild(element);
      }
    }
    return this.readingZoomStage;
  }
  restoreReadingZoomStage() {
    const stage = this.readingZoomStage;
    if (!stage) {
      return;
    }
    const target = this.readingZoomTarget?.parentElement === stage
      ? this.readingZoomTarget
      : stage.querySelector?.(".markdown-preview-sizer");
    const parent = this.readingZoomStageParent?.isConnected ? this.readingZoomStageParent : this.previewEl;
    if (target && parent?.isConnected) {
      const next = this.readingZoomStageNextSibling;
      if (next?.parentElement === parent) {
        parent.insertBefore(target, next);
      } else {
        parent.appendChild(target);
      }
    }
    stage.remove();
    this.readingZoomStage = null;
    this.readingZoomStageParent = null;
    this.readingZoomStageNextSibling = null;
  }
  async mount() {
    if (this.destroyed) {
      return;
    }
    cleanupDrawingUi(this.previewEl);
    this.previewEl._noteDrawController = this;
    this.previewEl.addClass("notedraw-shell");
    this.previewEl.addClass("is-notedraw-responsive-layout");
    this.previewEl.toggleClass("is-notedraw-source-shell", this.surfaceType === "source");
    this.previewEl.toggleClass("is-notedraw-webview-shell", this.surfaceType === "webview");
    this.previewEl.toggleClass("is-notedraw-embedded-shell", this.embeddedSurface);
    this.previewEl.toggleClass("is-notedraw-workspace-shell", this.workspaceSurface);
    this.previewEl.toggleClass("is-notedraw-registered-shell", this.registeredSurface);
    this.floatingControlsInBody = shouldUseBodyFloatingControls(this.previewEl, this.surfaceType);
    this.floatingControlsHost = this.floatingControlsInBody ? activeDocument.body : this.previewEl;
    this.previewEl.toggleClass("has-notedraw-body-controls", this.floatingControlsInBody);
    this.button = this.createHeaderButton();
    this.toolbar = createNoteDrawControlElement(this.floatingControlsHost, "notedraw-toolbar");
    this.toolbar._noteDrawController = this;
    this.selectButton = this.toolbar.createEl("button", {
      attr: { type: "button", title: this.plugin.t("selectDrawings") }
    });
    setIcon(this.selectButton, "mouse-pointer-2");
    this.selectButton.addEventListener("click", () => this.toggleSelectMode());
    this.editMarkdownButton = this.surfaceType === "source"
      ? this.toolbar.createEl("button", {
        attr: { type: "button", title: this.plugin.t("editMarkdownTool") }
      })
      : null;
    if (this.editMarkdownButton) {
      setIcon(this.editMarkdownButton, "file-pen-line");
      this.editMarkdownButton.addEventListener("click", () => this.setEditMarkdownMode());
    }
    this.penButton = this.toolbar.createEl("button", {
      attr: { type: "button", title: this.plugin.t("pen") }
    });
    setIcon(this.penButton, "pen-line");
    bindNoteDrawControlTap(this.penButton, (event) => this.onBrushButtonClick(BRUSH_PEN, event));
    this.watercolorButton = this.toolbar.createEl("button", {
      attr: { type: "button", title: this.plugin.t("watercolorBrush") }
    });
    setIcon(this.watercolorButton, "paintbrush");
    bindNoteDrawControlTap(this.watercolorButton, (event) => this.onBrushButtonClick(BRUSH_WATERCOLOR, event));
    this.textButton = this.toolbar.createEl("button", {
      attr: { type: "button", title: this.plugin.t("floatingText") }
    });
    setIcon(this.textButton, "type");
    bindNoteDrawControlTap(this.textButton, () => {
      this.setTextMode();
      this.setTextPanelOpen(true);
      this.syncTextPanelButtons();
    });
    this.undoButton = this.toolbar.createEl("button", {
      attr: { type: "button", title: this.plugin.t("undoLastDrawing") }
    });
    setIcon(this.undoButton, "undo-2");
    this.undoButton.addEventListener("click", () => this.undoLastStroke());
    this.redoButton = this.toolbar.createEl("button", {
      attr: { type: "button", title: this.plugin.t("redoDrawing") }
    });
    setIcon(this.redoButton, "redo-2");
    this.redoButton.addEventListener("click", () => this.redoLastStroke());
    this.deleteButton = this.toolbar.createEl("button", {
      attr: { type: "button", title: this.plugin.t("deleteSelectedDrawing") }
    });
    setIcon(this.deleteButton, "trash-2");
    this.deleteButton.addEventListener("click", () => this.deleteSelectedStroke());
    this.paletteButton = this.toolbar.createEl("button", {
      attr: { type: "button", title: this.plugin.t("penSettings") }
    });
    setIcon(this.paletteButton, "palette");
    bindNoteDrawControlTap(this.paletteButton, () => {
      if (this.toolMode === TOOL_EDIT_MD || this.toolMode === TOOL_SELECT && !this.hasHybridSelection()) {
        this.setPaletteOpen(false);
        return;
      }
      this.togglePalettePanel();
    });
    this.palettePanel = createNoteDrawControlElement(this.floatingControlsHost, "notedraw-palette-panel");
    this.createColorPalette();
    this.brushPanel = createNoteDrawControlElement(this.floatingControlsHost, "notedraw-brush-panel");
    this.createBrushPanel();
    this.textPanel = createNoteDrawControlElement(this.floatingControlsHost, "notedraw-text-panel");
    this.createTextPanel();
    this.selectionMenu = createNoteDrawControlElement(this.floatingControlsHost, "notedraw-selection-menu");
    this.createSelectionMenu();
    if (this.allowTextEdit && this.surfaceType !== "webview") {
      this.createFormatToolbar();
    }
    this.colorInput = this.palettePanel.createEl("input", {
      cls: "notedraw-advanced-color",
      attr: {
        type: "color",
        value: this.penColor,
        title: this.plugin.t("advancedColor"),
        "aria-label": this.plugin.t("advancedColor")
      }
    });
    this.colorInput.addEventListener("input", () => {
      this.setCurrentBrushColor(this.colorInput.value);
    });
    this.markdownBackgroundInput = this.palettePanel.createEl("input", {
      cls: "notedraw-advanced-color notedraw-md-background-color",
      attr: {
        type: "color",
        value: "#ffffff",
        title: this.plugin.t("blockBackground"),
        "aria-label": this.plugin.t("blockBackground")
      }
    });
    this.markdownBackgroundInput.addEventListener("input", () => {
      this.applyBackgroundToSelectedMarkdownBlocks(this.markdownBackgroundInput.value);
    });
    this.clearMarkdownBackgroundButton = this.palettePanel.createEl("button", {
      cls: "notedraw-clear-md-background",
      attr: { type: "button", title: this.plugin.t("clearBlockBackground"), "aria-label": this.plugin.t("clearBlockBackground") }
    });
    setIcon(this.clearMarkdownBackgroundButton, "eraser");
    bindNoteDrawControlTap(this.clearMarkdownBackgroundButton, () => this.applyBackgroundToSelectedMarkdownBlocks(""));
    this.hiddenFileInput = this.floatingControlsHost.createEl("input", {
      cls: "notedraw-file-input",
      attr: {
        type: "file",
        accept: filePickerAcceptForPreset(this.textPreset)
      }
    });
    this.hiddenFileInput.addEventListener("change", () => {
      const file = this.hiddenFileInput?.files?.[0] || null;
      const pending = this.pendingEmbedTool;
      this.hiddenFileInput.value = "";
      if (!file || !pending?.point) {
        this.pendingEmbedTool = null;
        return;
      }
      this.insertImportedAsset(file, pending.point).catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to import asset`, error);
        new Notice(this.plugin.t("failedImportFile"));
      });
    });
    this.widthInput = this.createPaletteInput("circle", "width", {
      type: "range",
      value: String(brushWidthToPaletteSlider(this.penWidth)),
      min: "0",
      max: "1000",
      step: "1",
      title: this.plugin.t("penWidth")
    });
    this.widthInput.addEventListener("input", () => {
      const width = paletteSliderToBrushWidth(this.widthInput.value);
      this.currentBrushSettings().width = width;
      this.applySizeToSelectedStrokes(width);
      this.syncCurrentBrushFields();
      this.updateToolButtons();
      this.persistCurrentBrushSettings();
      this.syncSharedToolbarState();
    });
    this.opacityInput = this.createPaletteInput("droplets", "opacity", {
      type: "range",
      value: String(opacityToPaletteSlider(this.penOpacity)),
      min: "0",
      max: "1000",
      step: "1",
      title: this.plugin.t("penOpacity")
    });
    this.opacityInput.addEventListener("input", () => {
      const opacity = paletteSliderToOpacity(this.opacityInput.value);
      this.currentBrushSettings().opacity = opacity;
      this.applyOpacityToSelectedStrokes(opacity);
      this.syncCurrentBrushFields();
      this.updateToolButtons();
      this.persistCurrentBrushSettings();
      this.syncSharedToolbarState();
    });
    this.readingZoomExtent = this.previewEl.createDiv({ cls: "notedraw-reading-zoom-extent" });
    const initialZoomTarget = findResponsiveContentElement(this.previewEl, this.surfaceType);
    this.readingZoomTarget = initialZoomTarget;
    const drawingHost = this.ensureReadingZoomStage(initialZoomTarget) || this.previewEl;
    this.underlayEmbedLayer = drawingHost.createDiv({ cls: "notedraw-underlay-embed-layer" });
    this.embedLayer = drawingHost.createDiv({ cls: "notedraw-embed-layer" });
    this.underlayCanvas.classList.add("notedraw-underlay-canvas");
    drawingHost.appendChild(this.underlayCanvas);
    this.staticCanvas.classList.add("notedraw-static-canvas");
    drawingHost.appendChild(this.staticCanvas);
    this.canvas = drawingHost.createEl("canvas", { cls: "notedraw-canvas" });
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("lostpointercapture", this.onPointerUp);
    this.canvas.addEventListener("dblclick", this.onCanvasDoubleClick);
    this.canvas.addEventListener("contextmenu", this.onCanvasContextMenu);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.previewEl.addEventListener("contextmenu", this.onPreviewContextMenu, true);
    this.previewEl.addEventListener("dblclick", this.onPreviewDoubleClick, true);
    if (this.usesVisualReadingZoom()) {
      this.previewEl.addEventListener("pointerdown", this.onReadingTouchPointerDown, true);
      this.previewEl.addEventListener("pointermove", this.onReadingTouchPointerMove, true);
      this.previewEl.addEventListener("pointerup", this.onReadingTouchPointerFinish, true);
      this.previewEl.addEventListener("pointercancel", this.onReadingTouchPointerFinish, true);
      this.previewEl.addEventListener("click", this.onReadingClick, true);
      this.previewEl.addEventListener("scroll", this.onReadingVirtualScrollCapture, { capture: true, passive: true });
    }
    window.addEventListener("resize", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
    window.visualViewport?.addEventListener("scroll", this.onResize);
    activeDocument.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    activeDocument.addEventListener("pointerup", this.onDocumentPointerFinish, true);
    activeDocument.addEventListener("pointercancel", this.onDocumentPointerFinish, true);
    activeDocument.addEventListener("selectionchange", this.onDocumentSelectionChange);
    activeDocument.addEventListener("keydown", this.onDocumentKeyDown, true);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.onResize);
      this.resizeObserver.observe(this.previewEl);
      this.layoutMeasureEl = findLayoutMeasureElement(this.previewEl);
      if (this.layoutMeasureEl && this.layoutMeasureEl !== this.previewEl) {
        this.resizeObserver.observe(this.layoutMeasureEl);
      }
    }
    this.refreshScrollContainer();
    this.repairConnectedReadingSections();
    await this.prepareInitialReadingLayout();
    if (this.destroyed || !this.previewEl?.isConnected) {
      return;
    }
    if (typeof MutationObserver !== "undefined") {
      this.markdownRenderObserver = new MutationObserver((mutations) => {
        if (mutations.some((mutation) => isMarkdownContentMutation(mutation))) {
          this.repairConnectedReadingSections();
          const editingLayout = this.active && (
            this.toolMode === TOOL_EDIT_MD
            || this.noteFlowOperationPending
            || this.draggingStroke
            || this.resizingSelection
          );
          if (editingLayout) {
            this.scheduleMarkdownAnnotationRefresh({ layout: false });
          } else {
            this.scheduleFrozenNoteFlowLayoutRestore();
            this.scheduleReadingVirtualSectionSync();
            this.scheduleResize({ layout: false, measure: false });
          }
        }
      });
      this.markdownRenderObserver.observe(this.previewEl, { subtree: true, childList: true });
    }
    this.updateToolButtons();
    this.syncPaletteInputs();
    this.refreshLocalizedLabels();
    this.applySharedToolbarState(this.plugin.controllerToolbarState(this));
    this.applyReadingZoom();
    this.applyActiveState(this.active);
    await this.ensureDrawingsLoaded();
    this.repairConnectedReadingSections();
    this.plugin.emitApiEvent("surface-changed", { ...this.plugin.describeController(this), phase: "mounted" });
  }
  async prepareInitialReadingLayout() {
    if (this.initialReadingLayoutPrepared || !this.usesVisualReadingZoom()) {
      this.initialReadingLayoutPrepared = true;
      return;
    }
    if (!this.active && Math.abs(this.readingZoomScale() - 1) < 0.001) {
      this.initialReadingLayoutPrepared = true;
      return;
    }
    const requestFrame = () => new Promise((resolve) => {
      if (typeof window.requestAnimationFrame === "function") {
        let settled = false;
        let frameId = null;
        let fallbackTimer = null;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          if (frameId !== null) {
            window.cancelAnimationFrame(frameId);
          }
          if (fallbackTimer !== null) {
            window.clearTimeout(fallbackTimer);
          }
          resolve();
        };
        frameId = window.requestAnimationFrame(finish);
        fallbackTimer = window.setTimeout(finish, 120);
      } else {
        window.setTimeout(resolve, 16);
      }
    });
    await waitForStableReadingLayout(() => {
      const sizer = rootPreviewSizer(this.previewEl);
      return captureInitialReadingLayout(this.previewEl, sizer, this.readingPreviewRenderer());
    }, {
      requestFrame,
      stableFrames: 2,
      maxFrames: 8,
      shouldAbort: () => this.destroyed || !this.previewEl?.isConnected
    });
    if (this.destroyed || !this.previewEl?.isConnected) {
      return;
    }
    this.responsiveLayoutContext = null;
    this.responsiveLayoutSignature = "";
    this.initialReadingLayoutPrepared = true;
  }
  applySettings() {
    const settings = sanitizeSettings(this.plugin?.noteDrawSettings || {});
    this.runtimeSettings = settings;
    if (this.brushSettings?.[BRUSH_PEN]) {
      this.brushSettings[BRUSH_PEN].color = settings.defaultPenColor;
      this.brushSettings[BRUSH_PEN].width = settings.defaultPenWidth;
      this.brushSettings[BRUSH_PEN].opacity = settings.defaultPenOpacity;
    }
    if (this.brushSettings?.[BRUSH_WATERCOLOR]) {
      this.brushSettings[BRUSH_WATERCOLOR].color = settings.defaultWatercolorColor;
      this.brushSettings[BRUSH_WATERCOLOR].width = settings.defaultWatercolorWidth;
      this.brushSettings[BRUSH_WATERCOLOR].opacity = settings.defaultWatercolorOpacity;
    }
    this.syncCurrentBrushFields?.();
    this.syncPaletteInputs?.();
    this.updateToolButtons?.();
    this.positionToolbar?.();
    this.render?.();
  }
  refreshLocalizedLabels() {
    this.plugin.setAccessibleLabel(this.button, this.surfaceType === "webview" ? "editWebviewDraw" : this.drawingsVisible ? "editTextDraw" : "editTextDrawHidden");
    this.plugin.setAccessibleLabel(this.selectButton, "selectDrawings");
    this.plugin.setAccessibleLabel(this.editMarkdownButton, "editMarkdownTool");
    this.plugin.setAccessibleLabel(this.penButton, "pen");
    this.plugin.setAccessibleLabel(this.watercolorButton, "watercolorBrush");
    this.plugin.setAccessibleLabel(this.textButton, "floatingText");
    this.plugin.setAccessibleLabel(this.undoButton, "undoLastDrawing");
    this.plugin.setAccessibleLabel(this.redoButton, "redoDrawing");
    this.plugin.setAccessibleLabel(this.deleteButton, "deleteSelectedDrawing");
    this.plugin.setAccessibleLabel(this.paletteButton, "penSettings");
    this.plugin.setAccessibleLabel(this.colorInput, "advancedColor");
    this.plugin.setAccessibleLabel(this.advancedColorButton, "advancedColor");
    this.plugin.setAccessibleLabel(this.markdownBackgroundInput, "blockBackground");
    this.plugin.setAccessibleLabel(this.clearMarkdownBackgroundButton, "clearBlockBackground");
    this.colorSwatchButtons?.forEach((button, index) => {
      const color = COMMON_COLORS[index];
      if (color) {
        button.setAttribute("aria-label", this.plugin.t("useColor", { color }));
      }
    });
    this.widthInput?.setAttribute("title", this.plugin.t("penWidth"));
    this.opacityInput?.setAttribute("title", this.plugin.t("penOpacity"));
    if (this.brushPanel) {
      const wasOpen = this.brushPanelOpen;
      this.brushPanel.empty();
      this.createBrushPanel();
      this.brushPanelOpen = wasOpen;
      this.previewEl.toggleClass("is-brush-panel-open", this.brushPanelOpen);
      this.syncBrushPanelButtons();
    }
    if (this.textPanel) {
      const wasOpen = this.textPanelOpen;
      this.textPanel.empty();
      this.createTextPanel();
      this.textPanelOpen = wasOpen;
      this.previewEl.toggleClass("is-text-panel-open", this.textPanelOpen);
      this.syncTextPanelButtons();
    }
    if (this.selectionMenu) {
      const wasOpen = this.selectionMenuOpen;
      this.selectionMenu.empty();
      this.createSelectionMenu();
      this.selectionMenuOpen = wasOpen;
      this.selectionMenu.toggleClass("is-visible", wasOpen);
      this.previewEl.toggleClass("is-selection-menu-open", wasOpen);
    }
    if (this.formatToolbar) {
      this.formatToolbar.querySelectorAll("[data-note-draw-title-key]").forEach((element) => {
        this.plugin.setAccessibleLabel(element, element.dataset.noteDrawTitleKey);
      });
      this.plugin.setAccessibleLabel(this.formatToolbar.querySelector(".notedraw-format-move-button"), "movePanel");
      this.plugin.setAccessibleLabel(this.formatColorInput, "textColor");
      this.plugin.setAccessibleLabel(this.formatHighlightInput, "highlightColor");
      this.plugin.setAccessibleLabel(this.formatSizeSelect, "textSize");
      const firstOption = this.formatSizeSelect?.querySelector?.('option[value=""]');
      if (firstOption) {
        firstOption.textContent = this.plugin.t("size");
      }
    }
  }
  createPaletteInput(icon, cls, attr) {
    const row = this.palettePanel.createDiv({ cls: "notedraw-palette-row" });
    const iconEl = row.createSpan({ cls: "notedraw-palette-icon" });
    setIcon(iconEl, icon);
    return row.createEl("input", {
      cls: `notedraw-${cls}`,
      attr
    });
  }
  longPressDelayMs() {
    return this.runtimeSettings?.longPressMs ?? DEFAULT_SETTINGS.longPressMs;
  }
  tapDistancePx() {
    return this.runtimeSettings?.selectTapDistance ?? DEFAULT_SETTINGS.selectTapDistance;
  }
  selectionHitPaddingPx() {
    return this.runtimeSettings?.selectStrokePadding ?? DEFAULT_SETTINGS.selectStrokePadding;
  }
  selectedStrokeAlpha() {
    return this.runtimeSettings?.selectedStrokeAlpha ?? DEFAULT_SETTINGS.selectedStrokeAlpha;
  }
  interpolationStepPx() {
    return this.runtimeSettings?.drawingInterpolationStep ?? DEFAULT_SETTINGS.drawingInterpolationStep;
  }
  minPointDistancePx() {
    return this.runtimeSettings?.drawingMinPointDistance ?? DEFAULT_SETTINGS.drawingMinPointDistance;
  }
  createHeaderButton() {
    return this.plugin.installHeaderButton(this);
  }
  async setFile(file) {
    if (this.destroyed || !file || this.file?.path === file.path) {
      return;
    }
    this.endTextEdit();
    this.endFloatingTextInput(true);
    this.drawingLoadGeneration += 1;
    this.cancelNoteFlowLayout();
    this.cancelFrozenNoteFlowLayoutRestore();
    this.frozenNoteFlowPreparation = null;
    this.clearDraggedNoteFlowPlacement();
    this.clearNoteFlowLayout();
    this.noteFlowLayoutSignature = "";
    this.resetNoteFlowSettle();
    this.noteFlowAnchorRepairReady = false;
    this.noteFlowAnchorRepairComplete = false;
    this.noteFlowPersistencePending = false;
    this.noteFlowActivationRepairAttempted = false;
    this.noteFlowLayoutIncomplete = false;
    this.noteFlowAvoidanceAnchors.clear();
    this.cancelRenderFrame();
    this.cancelResizeFrame();
    this.cancelResponsiveProjectionSettle();
    this.cancelReadingZoomSettle();
    this.readingZoomBaseTarget = null;
    this.readingZoomBaseOrigin = null;
    this.resetCanvasSurface();
    this.file = file;
    this.currentStroke = null;
    this.pointerDown = false;
    this.pointerStartEditable = null;
    this.activePointerId = null;
    this.resetTouchGestureState();
    this.draggingStroke = false;
    this.dragStrokeStartPoint = null;
    this.dragStrokeOriginalPoints = null;
    this.dragStrokeOriginalNoteFlows = null;
    this.dragNoteFlowOriginalBounds = null;
    this.pendingDraggedNoteFlowIndexes.clear();
    this.dragStrokeMoved = false;
    this.dragStrokeHitIndex = -1;
    this.resizingSelection = false;
    this.resizeSelectionHandle = null;
    this.resizeSelectionStartPoint = null;
    this.resizeSelectionStartClient = null;
    this.resizeSelectionOriginalBounds = null;
    this.resizeSelectionPreviewBounds = null;
    this.resizeSelectionOriginalStrokes = null;
    this.resizeSelectionOriginalMarkdownBlocks = null;
    this.resizeSelectionPointerGeometry = null;
    this.resizeSelectionClientBounds = null;
    this.resizeSelectionMoved = false;
    this.selectingStrokes = false;
    this.selectionStartPoint = null;
    this.selectionCurrentPoint = null;
    this.clearSelectionLongPress();
    this.hideSelectionMenu();
    this.redoStack = [];
    this.selectedStrokeIndex = -1;
    this.selectedStrokeIndexes.clear();
    this.selectedMarkdownBlockIds.clear();
    this.selectionFilterCycle = null;
    this.selectionFrameSnapshot = null;
    this.clearMarkdownBlockPresentation();
    this.embedNodes.forEach((node) => node.remove());
    this.embedNodes.clear();
    this.embedRenderTokens.clear();
    this.embedGeometryTokens.clear();
    this.releaseCanvasImageCache();
    this.responsiveLayoutSignature = "";
    this.responsivePointsInitialized = false;
    this.responsiveLayoutContext = null;
    this.initialReadingLayoutPrepared = false;
    this.readingTouchGuard = createReadingTouchGuardState();
    this.responsiveProjectionPending = null;
    this.invalidateStaticCache();
    this.drawingsLoaded = false;
    this.loadingDrawings = null;
    this.drawingData = createEmptyDrawingData(file);
    await this.prepareInitialReadingLayout();
    if (this.destroyed || !this.previewEl?.isConnected) {
      return;
    }
    await this.ensureDrawingsLoaded();
  }
  resetCanvasSurface() {
    this.previewEl.removeClass("has-notedraw-canvas");
    this.ctx = null;
    this.underlayCtx = null;
    this.staticCtx = null;
    this.canvasCssWidth = 1;
    this.canvasCssHeight = 1;
    this.canvasWindowTop = 0;
    this.canvasRenderHeight = 1;
    this.canvasBackingScale = 1;
    this.responsiveLayoutSignature = "";
    this.responsivePointsInitialized = false;
    this.responsiveLayoutContext = null;
    for (const canvas of [this.underlayCanvas, this.staticCanvas, this.canvas]) {
      if (!canvas) {
        continue;
      }
      canvas.width = 1;
      canvas.height = 1;
      for (const property of ["top", "width", "height", "min-width"]) {
        canvas.style.removeProperty(property);
      }
    }
    this.invalidateStaticCache();
  }
  releaseCanvasImageCache() {
    for (const state of this.canvasImageCache?.values?.() || []) {
      const image = state?.image;
      if (!image) {
        continue;
      }
      image.onload = null;
      image.onerror = null;
      try {
        image.removeAttribute?.("src");
      } catch {
      }
    }
    this.canvasImageCache?.clear?.();
  }
  destroy(options = {}) {
    if (this.destroyed) {
      return;
    }
    const surfaceBeforeDestroy = this.plugin.describeController(this);
    if (options.discardEdits === true) {
      this.endTextEdit({ save: false });
      this.endFloatingTextInput(false);
    } else {
      this.endTextEdit();
      this.endFloatingTextInput(true);
    }
    this.clearDraggedNoteFlowPlacement();
    this.destroyed = true;
    this.drawingLoadGeneration += 1;
    this.layoutRefreshGeneration += 1;
    this.clearButtonLongPress();
    this.cancelRenderFrame();
    this.cancelResizeFrame();
    this.cancelResponsiveProjectionSettle();
    this.cancelPositionFrame();
    this.cancelReadingVirtualSectionSync();
    this.cancelReadingZoomSettle();
    if (this.scrollSettleTimer !== null) {
      window.clearTimeout(this.scrollSettleTimer);
      this.scrollSettleTimer = null;
    }
    this.cancelMultiTouchFrame();
    this.resizeObserver?.disconnect();
    this.markdownRenderObserver?.disconnect();
    this.markdownRenderObserver = null;
    if (this.markdownAnnotationTimer !== null) {
      window.clearTimeout(this.markdownAnnotationTimer);
      this.markdownAnnotationTimer = null;
    }
    this.markdownAnnotationNeedsLayout = false;
    this.scrollEventTarget?.removeEventListener("scroll", this.onScroll);
    this.scrollContainer = null;
    this.scrollEventTarget = null;
    this.layoutMeasureEl = null;
    window.removeEventListener("resize", this.onResize);
    window.visualViewport?.removeEventListener("resize", this.onResize);
    window.visualViewport?.removeEventListener("scroll", this.onResize);
    activeDocument.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    activeDocument.removeEventListener("pointerup", this.onDocumentPointerFinish, true);
    activeDocument.removeEventListener("pointercancel", this.onDocumentPointerFinish, true);
    activeDocument.removeEventListener("selectionchange", this.onDocumentSelectionChange);
    activeDocument.removeEventListener("keydown", this.onDocumentKeyDown, true);
    this.cancelNoteFlowLayout();
    this.cancelFrozenNoteFlowLayoutRestore();
    this.clearNoteFlowLayout();
    this.stopFormatToolbarDrag();
    this.canvas?.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas?.removeEventListener("pointermove", this.onPointerMove);
    this.canvas?.removeEventListener("pointerup", this.onPointerUp);
    this.canvas?.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas?.removeEventListener("lostpointercapture", this.onPointerUp);
    this.canvas?.removeEventListener("dblclick", this.onCanvasDoubleClick);
    this.canvas?.removeEventListener("contextmenu", this.onCanvasContextMenu);
    this.canvas?.removeEventListener("wheel", this.onWheel);
    this.previewEl?.removeEventListener("contextmenu", this.onPreviewContextMenu, true);
    this.previewEl?.removeEventListener("dblclick", this.onPreviewDoubleClick, true);
    this.previewEl?.removeEventListener("pointerdown", this.onReadingTouchPointerDown, true);
    this.previewEl?.removeEventListener("pointermove", this.onReadingTouchPointerMove, true);
    this.previewEl?.removeEventListener("pointerup", this.onReadingTouchPointerFinish, true);
    this.previewEl?.removeEventListener("pointercancel", this.onReadingTouchPointerFinish, true);
    this.previewEl?.removeEventListener("click", this.onReadingClick, true);
    this.previewEl?.removeEventListener("scroll", this.onReadingVirtualScrollCapture, true);
    this.plugin.releaseHeaderButton(this);
    this.toolbar?.remove();
    this.palettePanel?.remove();
    this.brushPanel?.remove();
    this.textPanel?.remove();
    this.selectionMenu?.remove();
    this.formatToolbar?.remove();
    this.noteFlowDropIndicator?.remove();
    this.noteFlowDropIndicator = null;
    this.hiddenFileInput?.remove();
    this.clearMarkdownBlockPresentation();
    this.embedNodes.forEach((node) => node.remove());
    this.underlayEmbedLayer?.remove();
    this.embedLayer?.remove();
    this.embedNodes.clear();
    this.embedRenderTokens.clear();
    this.embedGeometryTokens.clear();
    this.releaseCanvasImageCache();
    this.resetCanvasSurface();
    this.underlayCanvas?.remove();
    this.staticCanvas?.remove();
    this.canvas?.remove();
    this.underlayCanvas = null;
    this.staticCanvas = null;
    this.canvas = null;
    this.clearReadingZoomStyles();
    this.restoreReadingZoomStage();
    this.disposeRegisteredSurfaceViewport?.();
    this.disposeRegisteredSurfaceViewport = null;
    this.readingZoomExtent?.remove();
    this.readingZoomExtent = null;
    this.readingBottomSpacer?.remove();
    this.readingBottomSpacer = null;
    this.readingBottomSpacerHeight = 0;
    this.previewEl.removeClass("notedraw-shell");
    this.previewEl.removeClass("is-notedraw-responsive-layout");
    this.previewEl.removeClass("is-notedraw-controls-visible");
    this.previewEl.removeClass("is-drawing-active");
    this.previewEl.removeClass("is-drawing-hidden");
    this.previewEl.removeClass("is-select-mode");
    this.previewEl.removeClass("is-palette-open");
    this.previewEl.removeClass("is-brush-panel-open");
    this.previewEl.removeClass("is-text-panel-open");
    this.previewEl.removeClass("is-selection-menu-open");
    this.previewEl.removeClass("is-watercolor-mode");
    this.previewEl.removeClass("is-edit-md-mode");
    this.previewEl.removeClass("is-notedraw-source-shell");
    this.previewEl.removeClass("is-notedraw-webview-shell");
    this.previewEl.removeClass("is-notedraw-workspace-shell");
    this.previewEl.removeClass("is-notedraw-registered-shell");
    this.previewEl.removeClass("has-notedraw-body-controls");
    this.previewEl.removeClass("has-notedraw-canvas");
    this.previewEl.removeClass("is-resizing-selection");
    this.previewEl.removeClass("is-native-text-editing");
    this.previewEl.removeClass("is-reading-zoomed");
    this.previewEl.removeClass("is-editing-layout-zoomed");
    this.clearSelectionLongPress();
    if (this.previewEl._noteDrawController === this) {
      delete this.previewEl._noteDrawController;
    }
    if (this.plugin.controllers?.get(this.previewEl) === this) {
      this.plugin.controllers.delete(this.previewEl);
    }
    if (this.plugin.sourceControllers?.get(this.view) === this) {
      this.plugin.sourceControllers.delete(this.view);
    }
    if (this.plugin.webviewControllers?.get(this.previewEl) === this) {
      this.plugin.webviewControllers.delete(this.previewEl);
    }
    if (this.plugin.workspaceControllers?.get(this.view) === this) {
      this.plugin.workspaceControllers.delete(this.view);
    }
    if (this.registeredSurfaceKey && this.plugin.registeredSurfaceControllers?.get(this.registeredSurfaceKey) === this) {
      this.plugin.registeredSurfaceControllers.delete(this.registeredSurfaceKey);
      this.plugin.registeredSurfaceRecords?.delete(this.registeredSurfaceKey);
    }
    this.plugin.liveControllers?.delete(this);
    if (surfaceBeforeDestroy) {
      this.plugin.emitApiEvent("surface-changed", { ...surfaceBeforeDestroy, phase: "unmounted" });
    }
    this.currentStroke = null;
    this.drawingData = null;
    this.markdownBlockElements.clear();
    this.redoStack = [];
  }
  async toggle() {
    if (this.destroyed) {
      return;
    }
    const nextActive = !this.active;
    this.plugin.setControllerActivation(this, nextActive);
    if (!nextActive) {
      return;
    }
    if (nextActive) {
      await this.ensureDrawingsLoaded();
      if (this.destroyed || !this.active) {
        return;
      }
      if (!this.drawingsVisible) {
        this.setDrawingsVisible(true);
      }
      this.prepareNoteFlowForEditing();
    }
  }
  applyActiveState(active, options = {}) {
    if (this.destroyed) {
      return;
    }
    const eager = options.eager !== false;
    const wasActive = this.active;
    this.active = Boolean(active);
    if (this.active && !this.embeddedSurface && isElementVisibleEnough(this.previewEl)) {
      this.plugin.setInteractionController(this);
    }
    this.previewEl.toggleClass("is-drawing-active", this.active);
    this.syncFloatingControlClasses();
    if (this.active && this.controlsShouldBeVisible()) {
      this.plugin.enforceSingleVisibleToolbar(this);
    }
    this.button?.classList.toggle("is-active", this.active);
    if (this.active && !wasActive && this.drawingsLoaded && this.drawingsVisible) {
      this.prepareNoteFlowForEditing();
    }
    if (!this.active && wasActive) {
      this.cancelNoteFlowLayout();
      this.endTextEdit();
      this.endFloatingTextInput(true);
      this.setPaletteOpen(false);
      this.setBrushPanelOpen(false);
      this.setTextPanelOpen(false);
      this.hideSelectionMenu();
      this.clearSelectionLongPress();
      this.cancelCurrentStroke();
      this.cancelSelectionDrag(true);
      this.cancelSelectedStrokeDrag(true);
      this.cancelSelectedStrokeResize(true);
      this.clearSelectedStrokes();
      this.resetTouchGestureState();
      this.render();
    } else if (this.active && eager && (!wasActive || !this.drawingsLoaded)) {
      this.ensureDrawingsLoaded().catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to load drawings`, error);
      });
      if (this.toolMode === TOOL_EDIT_MD) {
        this.scheduleMarkdownAnnotationRefresh({ layout: false });
      }
    } else if (this.active && !eager) {
      this.layoutRefreshGeneration += 1;
    }
    if (wasActive !== this.active && this.drawingsLoaded) {
      this.scheduleResize({ layout: false, measure: false });
    }
  }
  controlsShouldBeVisible() {
    if (this.embeddedSurface || !this.active || this.destroyed || !this.previewEl?.isConnected || isBlockingObsidianOverlayOpen(activeDocument)) {
      return false;
    }
    const activeLeaf = this.plugin.app.workspace?.activeLeaf;
    const ownerLeaf = this.view?.leaf || findOwningLeaf(this.plugin.app, this.view?.containerEl || this.previewEl);
    if (activeLeaf && ownerLeaf && activeLeaf !== ownerLeaf) {
      return false;
    }
    if (this.plugin.interactionController(this) !== this) {
      return false;
    }
    return isElementVisibleEnough(this.previewEl);
  }
  syncFloatingControlClasses() {
    const visible = this.controlsShouldBeVisible();
    this.previewEl?.toggleClass("is-notedraw-controls-visible", visible);
    this.toolbar?.toggleAttribute("aria-hidden", !visible);
    for (const element of [this.toolbar, this.palettePanel, this.brushPanel, this.textPanel, this.selectionMenu, this.formatToolbar]) {
      element?.toggleClass("is-drawing-active", Boolean(this.active));
      element?.toggleClass("is-notedraw-controls-visible", visible);
      element?.toggleClass("is-palette-open", Boolean(this.paletteOpen));
      element?.toggleClass("is-brush-panel-open", Boolean(this.brushPanelOpen));
      element?.toggleClass("is-text-panel-open", Boolean(this.textPanelOpen));
      element?.toggleClass("is-selection-menu-open", Boolean(this.selectionMenuOpen));
    }
    if (visible && this.active && !this.drawingsLoaded && !this.loadingDrawings) {
      this.ensureDrawingsLoaded().then(() => {
        this.scheduleLayoutRefresh({ settle: false });
      }).catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to load drawings`, error);
      });
    }
  }
  async ensureDrawingsLoaded() {
    if (this.drawingsLoaded) {
      return;
    }
    if (this.loadingDrawings) {
      await this.loadingDrawings;
      return;
    }
    const file = this.file;
    const generation = ++this.drawingLoadGeneration;
    const loading = this.plugin.readDrawings(file).then((data) => {
      if (this.destroyed || generation !== this.drawingLoadGeneration || this.file?.path !== file?.path) {
        return;
      }
      this.drawingData = data;
      const clearedUnboundRelations = this.rebuildElementRelations();
      if (clearedUnboundRelations) {
        this.plugin.scheduleDrawingSave(file, this.drawingData, { userOperation: true, replace: true });
      }
      this.drawingsLoaded = true;
      this.applyDrawingsVisibility(data.visible !== false);
      this.invalidateStaticCache();
      this.prepareFrozenNoteFlowLayout().catch((error) => {
        void error;
      });
      this.resizeCanvas({ layout: false, measure: true });
      this.render();
      if (this.markdownBlockRecords().length) {
        this.scheduleMarkdownAnnotationRefresh({ layout: false, delay: 0, force: true });
      }
      if (this.active && this.drawingsVisible) {
        this.prepareNoteFlowForEditing();
      }
    }).finally(() => {
      if (this.loadingDrawings === loading) {
        this.loadingDrawings = null;
      }
    });
    this.loadingDrawings = loading;
    await loading;
  }
  onResize() {
    if (this.embeddedSurface && !isElementLaidOut(this.previewEl)) {
      return;
    }
    this.syncFloatingControlClasses();
    this.applyReadingZoom();
    const previewWidth = Math.max(0, Number(this.previewEl?.clientWidth) || 0);
    const widthChanged = this.lastObservedPreviewWidth > 0 && Math.abs(previewWidth - this.lastObservedPreviewWidth) >= 1;
    this.lastObservedPreviewWidth = previewWidth;
    if (this.active || this.drawingsLoaded || this.ctx) {
      this.scheduleResize({ layout: false, measure: widthChanged });
    }
  }
  onReadingVirtualScrollCapture() {
    if (!this.usesVisualReadingZoom() || Math.abs(this.readingZoomScale() - 1) < 0.001) {
      return;
    }
    const renderer = this.readingPreviewRenderer();
    if (renderer?.previewEl === this.previewEl) {
      renderer.lastScroll = Number(this.previewEl.scrollTop) || 0;
    }
  }
  onScroll() {
    this.lastScrollAt = Date.now();
    recordReadingTouchScroll(this.readingTouchGuard, { now: this.lastScrollAt });
    if (!this.isReadingZoomInteractionActive()) {
      this.scheduleReadingVirtualSectionSync();
    }
    if (this.embeddedSurface && !isElementNearViewport(this.previewEl)) {
      if (this.scrollSettleTimer !== null) {
        window.clearTimeout(this.scrollSettleTimer);
        this.scrollSettleTimer = null;
      }
      return;
    }
    if (!this.embeddedSurface) {
      this.syncFloatingControlClasses();
      this.scheduleFloatingControlsPosition();
      this.plugin.scheduleEmbeddedMarkdownSync();
    }
    if (this.active || this.drawingsLoaded || this.ctx) {
      if (this.multiTouchScrolling) {
        return;
      }
      this.scheduleResize({ layout: false, measure: false });
      if (this.scrollSettleTimer !== null) {
        window.clearTimeout(this.scrollSettleTimer);
      }
      this.scrollSettleTimer = window.setTimeout(() => {
        this.scrollSettleTimer = null;
        if (this.destroyed) {
          return;
        }
        this.scheduleResize({ layout: false, measure: false });
      }, 90);
    }
  }
  isReadingProjectionSettleSurface() {
    return this.surfaceType === "preview" && this.responsivePointsInitialized;
  }
  scheduleResponsiveProjectionSettle(delay = 180, options = {}) {
    if (this.destroyed || !this.isReadingProjectionSettleSurface()) {
      return;
    }
    this.responsiveProjectionPreserveNoteFlowAbsolute = this.responsiveProjectionPreserveNoteFlowAbsolute
      || options.preserveNoteFlowAbsolute === true;
    if (this.responsiveProjectionSettleTimer !== null) {
      window.clearTimeout(this.responsiveProjectionSettleTimer);
    }
    const wait = Math.max(40, Number(delay) || 180);
    this.responsiveProjectionSettleTimer = window.setTimeout(() => {
      this.responsiveProjectionSettleTimer = null;
      if (this.destroyed || !this.previewEl?.isConnected) {
        return;
      }
      const sinceScroll = Date.now() - this.lastScrollAt;
      if (this.lastScrollAt > 0 && sinceScroll < 260) {
        this.scheduleResponsiveProjectionSettle(260 - sinceScroll + 40, {
          preserveNoteFlowAbsolute: this.responsiveProjectionPreserveNoteFlowAbsolute
        });
        return;
      }
      const preserveNoteFlowAbsolute = this.responsiveProjectionPreserveNoteFlowAbsolute;
      this.responsiveProjectionPreserveNoteFlowAbsolute = false;
      this.scheduleResize({ layout: true, preserveNoteFlowAbsolute });
    }, wait);
  }
  cancelResponsiveProjectionSettle() {
    if (this.responsiveProjectionSettleTimer !== null) {
      window.clearTimeout(this.responsiveProjectionSettleTimer);
      this.responsiveProjectionSettleTimer = null;
    }
    this.responsiveProjectionPreserveNoteFlowAbsolute = false;
  }
  scheduleResize(options = {}) {
    const noteFlowResizeSuppressed = Date.now() < this.noteFlowSuppressResizeUntil;
    const readingZoomInteractionActive = this.isReadingZoomInteractionActive();
    const sinceScroll = Date.now() - this.lastScrollAt;
    const readingScrollActive = this.isReadingProjectionSettleSurface()
      && this.lastScrollAt > 0
      && sinceScroll < 260;
    if (readingScrollActive && this.resizeNeedsLayout) {
      this.resizeNeedsLayout = false;
      this.resizePreserveNoteFlowAbsolute = false;
    }
    if (options.layout !== false && readingScrollActive) {
      this.scheduleResponsiveProjectionSettle(260 - sinceScroll + 40, options);
    }
    const wantsLayout = options.layout !== false
      && !this.draggingStroke
      && !this.resizingSelection
      && !noteFlowResizeSuppressed
      && !readingZoomInteractionActive
      && !readingScrollActive;
    const wantsMeasure = options.measure !== false
      && !this.resizingSelection
      && !readingZoomInteractionActive
      && !readingScrollActive;
    if (wantsLayout) {
      if (!this.resizeNeedsLayout) {
        this.resizePreserveNoteFlowAbsolute = options.preserveNoteFlowAbsolute === true;
      } else if (options.preserveNoteFlowAbsolute !== true) {
        this.resizePreserveNoteFlowAbsolute = false;
      }
      this.resizeNeedsLayout = true;
    }
    this.resizePreserveAbsolutePlacement = this.resizePreserveAbsolutePlacement
      || options.preserveAbsolutePlacement === true;
    this.resizeNeedsMeasure = this.resizeNeedsMeasure || wantsMeasure || wantsLayout;
    if (this.resizeFrameId !== null || this.resizeFallbackTimer !== null) {
      return;
    }
    this.resizeFrameId = window.requestAnimationFrame(() => this.flushScheduledResize());
    this.resizeFallbackTimer = window.setTimeout(() => this.flushScheduledResize(), 120);
  }
  flushScheduledResize() {
    if (this.resizeFrameId !== null) {
      window.cancelAnimationFrame(this.resizeFrameId);
      this.resizeFrameId = null;
    }
    if (this.resizeFallbackTimer !== null) {
      window.clearTimeout(this.resizeFallbackTimer);
      this.resizeFallbackTimer = null;
    }
    if (this.destroyed) {
      return;
    }
    const layout = this.resizeNeedsLayout;
    const measure = this.resizeNeedsMeasure;
    const preserveNoteFlowAbsolute = layout && this.resizePreserveNoteFlowAbsolute;
    const preserveAbsolutePlacement = this.resizePreserveAbsolutePlacement;
    this.resizeNeedsLayout = false;
    this.resizeNeedsMeasure = false;
    this.resizePreserveNoteFlowAbsolute = false;
    this.resizePreserveAbsolutePlacement = false;
    const canvasChanged = this.resizeCanvas({ layout, measure, preserveNoteFlowAbsolute, preserveAbsolutePlacement });
    this.updateFloatingControlsPosition();
    this.positionFormatToolbar();
    this.positionFloatingTextInput();
    if (canvasChanged) {
      if (layout) {
        this.render();
      } else {
        this.renderCanvas();
      }
    }
  }
  cancelResizeFrame() {
    if (this.resizeFrameId !== null) {
      window.cancelAnimationFrame(this.resizeFrameId);
      this.resizeFrameId = null;
    }
    if (this.resizeFallbackTimer !== null) {
      window.clearTimeout(this.resizeFallbackTimer);
      this.resizeFallbackTimer = null;
    }
    this.resizeNeedsLayout = false;
    this.resizeNeedsMeasure = false;
    this.resizePreserveNoteFlowAbsolute = false;
    this.resizePreserveAbsolutePlacement = false;
  }
  scheduleFloatingControlsPosition() {
    if (this.positionFrameId !== null) {
      return;
    }
    this.positionFrameId = window.requestAnimationFrame(() => {
      this.positionFrameId = null;
      this.updateFloatingControlsPosition();
      this.positionFormatToolbar();
      this.positionFloatingTextInput();
    });
  }
  cancelPositionFrame() {
    if (this.positionFrameId !== null) {
      window.cancelAnimationFrame(this.positionFrameId);
      this.positionFrameId = null;
    }
  }
  refreshScrollContainer() {
    const nextContainer = findScrollableAncestor(this.previewEl);
    const nextTarget = getScrollEventTarget(nextContainer);
    if (nextContainer === this.scrollContainer && nextTarget === this.scrollEventTarget) {
      return;
    }
    this.scrollEventTarget?.removeEventListener("scroll", this.onScroll);
    this.scrollContainer = nextContainer;
    this.scrollEventTarget = nextTarget;
    this.scrollEventTarget?.addEventListener("scroll", this.onScroll, { passive: true });
  }
  scheduleLayoutRefresh(options = {}) {
    const settle = options.settle !== false;
    const generation = ++this.layoutRefreshGeneration;
    const refresh = () => {
      if (!this.destroyed && generation === this.layoutRefreshGeneration) {
        if (this.active || this.drawingsLoaded || isElementVisibleEnough(this.previewEl)) {
          this.scheduleResize({ layout: options.layout === true, measure: options.measure !== false });
        }
      }
    };
    refresh();
    window.requestAnimationFrame?.(refresh);
    window.setTimeout(refresh, 80);
    window.setTimeout(refresh, 350);
    if (settle) {
      window.requestAnimationFrame?.(() => window.requestAnimationFrame?.(refresh));
      window.setTimeout(refresh, 900);
      if (isMobileRuntime()) {
        window.setTimeout(refresh, 1600);
      }
    }
  }
  scheduleMarkdownAnnotationRefresh(options = {}) {
    const editingLayout = options.force === true || this.active && (
      this.toolMode === TOOL_EDIT_MD
      || this.noteFlowOperationPending
      || this.draggingStroke
      || this.resizingSelection
    );
    if (!editingLayout) {
      return;
    }
    this.markdownAnnotationNeedsLayout = this.markdownAnnotationNeedsLayout || options.layout !== false;
    if (this.markdownAnnotationTimer !== null || this.destroyed) {
      return;
    }
    const delay = Number.isFinite(Number(options.delay))
      ? Math.max(0, Math.min(120, Number(options.delay)))
      : 120;
    this.markdownAnnotationTimer = window.setTimeout(() => {
      this.markdownAnnotationTimer = null;
      const layout = this.markdownAnnotationNeedsLayout;
      this.markdownAnnotationNeedsLayout = false;
      if (this.destroyed || !this.previewEl?.isConnected) {
        return;
      }
      this.applyReadingZoom();
      annotateVisibleMarkdownElements(this.plugin.app, this.previewEl, this.file.path);
      annotateRenderedMarkdownLines(this.plugin.app, this.previewEl, this.file.path, { force: options.force === true }).catch((error) => {
        void error;
      }).finally(() => {
        if (this.destroyed || !this.previewEl?.isConnected) {
          return;
        }
        this.responsiveLayoutContext = null;
        this.syncMarkdownBlockPresentation();
        if (this.noteFlowOperationPending) {
          this.scheduleNoteFlowAnchorRepair();
        }
        if (this.noteFlowOperationPending && this.hasNoteFlowElements()) {
          this.scheduleNoteFlowLayout();
        }
        if (this.drawingsLoaded) {
          if (layout) {
            this.responsiveLayoutSignature = "";
          }
          this.scheduleResize({ layout });
        }
      });
    }, delay);
  }
  updateFloatingControlsPosition() {
    this.syncFloatingControlClasses();
    if (!this.button || !this.toolbar) {
      return;
    }
    const host = this.view?.containerEl || this.previewEl.closest?.(".workspace-leaf-content") || this.previewEl;
    const hostRect = host.getBoundingClientRect();
    const buttonRect = this.button.getBoundingClientRect();
    const viewHeader = this.view?.containerEl?.querySelector?.(".view-header") || this.button.closest?.(".view-header") || null;
    const chromeRect = viewHeader?.getBoundingClientRect?.() || this.button.closest?.(".view-actions")?.getBoundingClientRect?.() || null;
    const toolbarHeight = Math.max(36, this.toolbar.getBoundingClientRect().height || 36);
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportWidth = Math.max(160, viewport?.width || window.innerWidth || 160);
    const viewportHeight = Math.max(120, viewport?.height || window.innerHeight || 120);
    const viewportRight = viewportLeft + viewportWidth;
    const buttonVisible = buttonRect.width > 0 && buttonRect.height > 0 && buttonRect.bottom > viewportTop && buttonRect.top < viewportTop + viewportHeight;
    const anchorRight = hostRect.right > 0 ? hostRect.right : buttonVisible ? buttonRect.right : viewportRight;
    const headerBottom = chromeRect && chromeRect.bottom > 0 ? chromeRect.bottom : 48;
    const anchorBottom = Math.max(
      buttonVisible ? buttonRect.bottom : 0,
      headerBottom
    );
    const compactViewport = isMobileRuntime() || viewportWidth < 640;
    const right = compactViewport ? "auto" : clamp(viewportRight - anchorRight + 10, 8, Math.max(8, viewportWidth - 48));
    const left = compactViewport ? viewportLeft + 8 : "auto";
    const minTop = Math.max(viewportTop + 8, headerBottom + 6);
    const maxTop = Math.max(minTop, viewportTop + viewportHeight - toolbarHeight - 8);
    const topOffset = sanitizeSettings(this.plugin?.noteDrawSettings || {}).toolbarTopOffset;
    const top = clamp(anchorBottom + topOffset, minTop, maxTop);
    const panelTop = top + toolbarHeight + 6;
    const panelLeft = (button, panel, fallbackWidth) => {
      const buttonBounds = button?.getBoundingClientRect?.();
      const measuredWidth = panel?.getBoundingClientRect?.().width || fallbackWidth;
      const width = clamp(measuredWidth, 34, Math.max(34, viewportWidth - 16));
      const rightInset = typeof right === "number" ? right : 8;
      const anchorX = buttonBounds?.width > 0 ? buttonBounds.left + buttonBounds.width / 2 : viewportRight - rightInset - 14;
      return clamp(anchorX - width / 2, viewportLeft + 8, Math.max(viewportLeft + 8, viewportRight - width - 8));
    };
    const props = {
      "--notedraw-toolbar-right": typeof right === "number" ? `${Math.round(right)}px` : right,
      "--notedraw-toolbar-left": typeof left === "number" ? `${Math.round(left)}px` : left,
      "--notedraw-toolbar-top": `${Math.round(top)}px`,
      "--notedraw-palette-top": `${Math.round(panelTop)}px`,
      "--notedraw-palette-left": `${Math.round(panelLeft(this.paletteButton, this.palettePanel, 220))}px`,
      "--notedraw-palette-right": "auto",
      "--notedraw-brush-panel-top": `${Math.round(panelTop)}px`,
      "--notedraw-brush-panel-left": `${Math.round(panelLeft(this.brushPanelMode === BRUSH_WATERCOLOR ? this.watercolorButton : this.penButton, this.brushPanel, this.brushPanelMode === BRUSH_WATERCOLOR ? 114 : 77))}px`,
      "--notedraw-brush-panel-right": "auto",
      "--notedraw-text-panel-top": `${Math.round(panelTop)}px`,
      "--notedraw-text-panel-left": `${Math.round(panelLeft(this.textButton, this.textPanel, 236))}px`,
      "--notedraw-text-panel-right": "auto"
    };
    setNoteDrawCssProps(this.previewEl, props);
    if (this.floatingControlsInBody) {
      for (const element of [this.toolbar, this.palettePanel, this.brushPanel, this.textPanel, this.selectionMenu, this.formatToolbar]) {
        setNoteDrawCssProps(element, props);
      }
    }
  }
  onBrushButtonClick(mode, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (this.brushPanelOpen && this.brushPanelMode === mode) {
      this.setBrushPanelOpen(false);
      return;
    }
    this.setBrushMode(mode);
    this.brushPanelMode = mode;
    this.setBrushPanelOpen(true);
  }
  createBrushPanel() {
    const options = [
      { mode: BRUSH_PEN, variant: BRUSH_VARIANT_DEFAULT, labelKey: "standardPen", icon: "pen-line" },
      { mode: BRUSH_PEN, variant: PEN_VARIANT_FOUNTAIN, labelKey: "fountainPen", icon: "pen-tool" },
      { mode: BRUSH_PEN, variant: PEN_VARIANT_NOTE, labelKey: "notePen", icon: "notebook-pen" },
      { mode: BRUSH_WATERCOLOR, variant: BRUSH_VARIANT_DEFAULT, labelKey: "standardWatercolor", icon: "paintbrush" },
      { mode: BRUSH_WATERCOLOR, variant: WATERCOLOR_VARIANT_TEXT, labelKey: "textWatercolor", icon: "highlighter" },
      { mode: BRUSH_WATERCOLOR, variant: WATERCOLOR_VARIANT_STRAIGHT, labelKey: "straightWatercolor", icon: "ruler" }
    ];
    for (const option of options) {
      const label = this.plugin.t(option.labelKey);
      const button = this.brushPanel.createEl("button", {
        cls: "notedraw-brush-option",
        attr: { type: "button", title: label, "aria-label": label }
      });
      button.dataset.noteDrawBrush = option.mode;
      button.dataset.noteDrawBrushVariant = option.variant;
      setIcon(button, option.icon);
      bindNoteDrawControlTap(button, () => {
        this.brushVariants[option.mode] = option.variant;
        this.setBrushMode(option.mode);
        this.setBrushPanelOpen(false);
      });
    }
    this.syncBrushPanelButtons();
  }
  syncBrushPanelButtons() {
    this.brushPanel?.querySelectorAll(".notedraw-brush-option").forEach((button) => {
      const mode = button.dataset.noteDrawBrush;
      const variant = button.dataset.noteDrawBrushVariant;
      button.toggleAttribute("hidden", mode !== this.brushPanelMode || variant === PEN_VARIANT_NOTE && !this.supportsNoteFlow());
      button.classList.toggle("is-active", mode === this.brushMode && variant === this.currentBrushVariant());
    });
  }
  setBrushPanelOpen(open) {
    this.brushPanelOpen = Boolean(open);
    this.previewEl.toggleClass("is-brush-panel-open", this.brushPanelOpen);
    this.syncFloatingControlClasses();
    if (this.brushPanelOpen) {
      this.syncBrushPanelButtons();
      this.setPaletteOpen(false);
      this.setTextPanelOpen(false);
      this.updateFloatingControlsPosition();
    }
    this.syncSharedToolbarState();
  }
  setBrushMode(mode) {
    if (![BRUSH_PEN, BRUSH_WATERCOLOR].includes(mode)) {
      return;
    }
    this.brushMode = mode;
    this.toolMode = TOOL_DRAW;
    this.previewEl.removeClass("is-select-mode");
    if (this.isNoteFlowPenActive()) {
      this.clearSelectedStrokes();
    } else {
      this.hideSelectionMenu();
    }
    this.endTextEdit();
    this.cancelCurrentStroke();
    this.cancelSelectionDrag(true);
    this.syncCurrentBrushFields();
    this.syncPaletteInputs();
    this.syncBrushPanelButtons();
    this.updateToolButtons();
    this.persistInteractionSettings();
    this.syncSharedToolbarState();
    this.render();
  }
  setTextMode() {
    this.toolMode = TOOL_TEXT;
    this.previewEl.removeClass("is-select-mode");
    this.hideSelectionMenu();
    this.setPaletteOpen(false);
    this.setBrushPanelOpen(false);
    this.setTextPanelOpen(false);
    this.endTextEdit();
    this.cancelCurrentStroke();
    this.cancelSelectionDrag(true);
    this.updateToolButtons();
    this.persistInteractionSettings();
    this.syncSharedToolbarState();
    this.render();
  }
  setEditMarkdownMode() {
    this.toolMode = TOOL_EDIT_MD;
    this.previewEl.removeClass("is-select-mode");
    this.hideSelectionMenu();
    this.clearSelectedStrokes();
    this.setPaletteOpen(false);
    this.setBrushPanelOpen(false);
    this.setTextPanelOpen(false);
    this.endFloatingTextInput(true);
    this.endTextEdit();
    this.cancelCurrentStroke();
    this.cancelSelectionDrag(true);
    this.updateToolButtons();
    this.persistInteractionSettings();
    this.syncSharedToolbarState();
    this.scheduleMarkdownAnnotationRefresh({ layout: false });
    this.render();
  }
  syncSharedToolbarState() {
    this.plugin.setControllerToolbarState(this, {
      brushMode: this.brushMode,
      brushVariants: { ...this.brushVariants },
      brushPanelOpen: this.brushPanelOpen,
      brushPanelMode: this.brushPanelMode,
      brushSettings: {
        [BRUSH_PEN]: { ...this.brushSettings[BRUSH_PEN] },
        [BRUSH_WATERCOLOR]: { ...this.brushSettings[BRUSH_WATERCOLOR] }
      },
      toolMode: this.toolMode,
      paletteOpen: this.paletteOpen,
      textPanelOpen: this.textPanelOpen,
      textPreset: this.textPreset,
      readingZoom: this.readingZoom
    });
  }
  applySharedToolbarState(state) {
    if (!state || this.destroyed) {
      return;
    }
    const previousToolMode = this.toolMode;
    const previousReadingZoom = this.readingZoom;
    this.brushMode = [BRUSH_PEN, BRUSH_WATERCOLOR].includes(state.brushMode) ? state.brushMode : this.brushMode;
    for (const mode of [BRUSH_PEN, BRUSH_WATERCOLOR]) {
      this.brushVariants[mode] = normalizeBrushVariant(mode, state.brushVariants?.[mode] ?? this.brushVariants[mode]);
    }
    for (const mode of [BRUSH_PEN, BRUSH_WATERCOLOR]) {
      if (state.brushSettings?.[mode]) {
        this.brushSettings[mode] = { ...this.brushSettings[mode], ...state.brushSettings[mode] };
      }
    }
    this.toolMode = state.toolMode || this.toolMode;
    this.paletteOpen = Boolean(state.paletteOpen) && this.toolMode !== TOOL_EDIT_MD && (this.toolMode !== TOOL_SELECT || this.hasHybridSelection());
    this.brushPanelOpen = Boolean(state.brushPanelOpen) && this.toolMode === TOOL_DRAW;
    this.brushPanelMode = [BRUSH_PEN, BRUSH_WATERCOLOR].includes(state.brushPanelMode) ? state.brushPanelMode : this.brushPanelMode;
    this.textPanelOpen = Boolean(state.textPanelOpen);
    this.textPreset = state.textPreset || this.textPreset;
    this.readingZoom = clamp(Number(state.readingZoom) || this.readingZoom || 1, MIN_READING_ZOOM, MAX_READING_ZOOM);
    this.syncCurrentBrushFields();
    this.previewEl.toggleClass("is-select-mode", this.toolMode === TOOL_SELECT);
    this.previewEl.toggleClass("is-palette-open", this.paletteOpen);
    this.previewEl.toggleClass("is-brush-panel-open", this.brushPanelOpen);
    this.previewEl.toggleClass("is-text-panel-open", this.textPanelOpen);
    if (this.isNoteFlowPenActive() && this.hasHybridSelection()) {
      this.clearSelectedStrokes();
    }
    this.syncPaletteInputs();
    this.syncBrushPanelButtons?.();
    this.syncTextPanelButtons?.();
    const zoomChanged = Math.abs(this.readingZoom - previousReadingZoom) >= 0.001;
    if (zoomChanged) {
      this.applyReadingZoom();
      this.responsiveLayoutContext = null;
      const visualReadingZoom = this.usesVisualReadingZoom();
      this.scheduleResize({ layout: !visualReadingZoom, measure: !visualReadingZoom });
    }
    this.updateToolButtons();
    this.syncFloatingControlClasses();
    if (previousToolMode !== this.toolMode && (this.ctx || this.drawingsLoaded)) {
      this.requestRender();
    }
  }
  setToolFromApi(tool, options = {}) {
    const normalized = String(tool || "").trim().toLowerCase();
    if (normalized === TOOL_EDIT_MD || normalized === "edit" || normalized === "markdown") {
      if (this.workspaceSurface) {
        return false;
      }
      this.setEditMarkdownMode();
      return true;
    }
    if (normalized === TOOL_SELECT || normalized === "selection") {
      if (this.toolMode !== TOOL_SELECT) {
        this.toggleSelectMode();
      }
      return true;
    }
    if (normalized === TOOL_TEXT) {
      this.textPreset = String(options.preset || "plain");
      this.setTextMode();
      return true;
    }
    if (normalized === TOOL_DRAW || normalized === BRUSH_PEN || normalized === BRUSH_WATERCOLOR) {
      const brush = normalized === BRUSH_WATERCOLOR || options.brush === BRUSH_WATERCOLOR ? BRUSH_WATERCOLOR : BRUSH_PEN;
      this.brushVariants[brush] = normalizeBrushVariant(brush, options.variant);
      this.setBrushMode(brush);
      return true;
    }
    return false;
  }
  currentBrushSettings() {
    if (!this.brushSettings[this.brushMode]) {
      this.brushMode = BRUSH_PEN;
    }
    return this.brushSettings[this.brushMode];
  }
  currentBrushVariant() {
    const variant = normalizeBrushVariant(this.brushMode, this.brushVariants[this.brushMode]);
    return variant === PEN_VARIANT_NOTE && !this.supportsNoteFlow() ? BRUSH_VARIANT_DEFAULT : variant;
  }
  isNoteFlowPenActive() {
    return this.toolMode === TOOL_DRAW
      && this.brushMode === BRUSH_PEN
      && this.currentBrushVariant() === PEN_VARIANT_NOTE
      && this.supportsNoteFlow();
  }
  supportsNoteFlow() {
    return this.surfaceType === "preview" && !this.embeddedSurface;
  }
  hasNoteFlowElements() {
    return (this.drawingData?.strokes || []).some((stroke) => stroke?.noteFlow?.enabled && !isConnectorStroke(stroke));
  }
  prepareNoteFlowForEditing() {
    if (this.destroyed || !this.active || !this.drawingsLoaded || !this.drawingsVisible || !this.supportsNoteFlow() || this.noteFlowActivationRepairAttempted) {
      return false;
    }
    const strokes = this.drawingData?.strokes || [];
    if (!this.hasNoteFlowElements()) {
      return false;
    }
    this.noteFlowActivationRepairAttempted = true;
    const frozen = normalizeFrozenNoteFlowLayout(this.drawingData?.noteFlowLayout);
    if (!noteFlowNeedsActivationRepair(strokes, frozen)) {
      this.restoreFrozenNoteFlowLayout();
      return false;
    }
    this.cancelFrozenNoteFlowLayoutRestore();
    this.noteFlowAnchorRepairReady = false;
    this.noteFlowAnchorRepairComplete = false;
    this.noteFlowPersistencePending = false;
    this.noteFlowOperationPending = true;
    this.scheduleMarkdownAnnotationRefresh({ layout: false, delay: 32 });
    return true;
  }
  syncCurrentBrushFields() {
    const settings = this.currentBrushSettings();
    this.penColor = settings.color;
    this.penWidth = settings.width;
    this.penOpacity = settings.opacity;
    this.penCount = settings.count;
  }
  syncPaletteInputs() {
    const settings = this.currentBrushSettings();
    if (this.colorInput) {
      this.colorInput.value = this.currentPaletteColor();
    }
    const selectedBackground = [
      ...this.selectedWholeElementGroups().map((group) => group.backgroundColor),
      ...this.getSelectedMarkdownBlocks().map((block) => block.backgroundColor)
    ].find((color) => isCssColor(color));
    if (this.markdownBackgroundInput && selectedBackground) {
      this.markdownBackgroundInput.value = selectedBackground;
    }
    this.syncColorSwatches();
    if (this.widthInput) {
      this.widthInput.value = String(brushWidthToPaletteSlider(this.currentPaletteWidth()));
    }
    if (this.opacityInput) {
      this.opacityInput.value = String(opacityToPaletteSlider(this.currentPaletteOpacity()));
    }
  }
  persistCurrentBrushSettings() {
    const settings = this.currentBrushSettings();
    const noteDrawSettings = this.plugin?.noteDrawSettings || {};
    if (this.brushMode === BRUSH_WATERCOLOR) {
      noteDrawSettings.defaultWatercolorColor = settings.color;
      noteDrawSettings.defaultWatercolorWidth = settings.width;
      noteDrawSettings.defaultWatercolorOpacity = settings.opacity;
    } else {
      noteDrawSettings.defaultPenColor = settings.color;
      noteDrawSettings.defaultPenWidth = settings.width;
      noteDrawSettings.defaultPenOpacity = settings.opacity;
    }
    this.plugin.noteDrawSettings = noteDrawSettings;
    this.plugin.scheduleSettingsSave?.();
  }
  persistInteractionSettings() {
    const noteDrawSettings = this.plugin?.noteDrawSettings || {};
    noteDrawSettings.lastToolMode = normalizeToolMode(this.toolMode);
    noteDrawSettings.lastBrushMode = this.brushMode === BRUSH_WATERCOLOR ? BRUSH_WATERCOLOR : BRUSH_PEN;
    noteDrawSettings.lastPenVariant = normalizeBrushVariant(BRUSH_PEN, this.brushVariants[BRUSH_PEN]);
    noteDrawSettings.lastWatercolorVariant = normalizeBrushVariant(BRUSH_WATERCOLOR, this.brushVariants[BRUSH_WATERCOLOR]);
    noteDrawSettings.lastTextPreset = normalizeTextPreset(this.textPreset);
    noteDrawSettings.lastReadingZoom = clamp(Number(this.readingZoom) || 1, MIN_READING_ZOOM, MAX_READING_ZOOM);
    this.plugin.noteDrawSettings = noteDrawSettings;
    this.plugin.scheduleSettingsSave?.();
  }
  updateToolButtons() {
    const penActive = this.toolMode === TOOL_DRAW && this.brushMode === BRUSH_PEN;
    const watercolorActive = this.toolMode === TOOL_DRAW && this.brushMode === BRUSH_WATERCOLOR;
    this.applyBrushButtonState(this.penButton, this.brushSettings?.[BRUSH_PEN], penActive);
    this.applyBrushButtonState(this.watercolorButton, this.brushSettings?.[BRUSH_WATERCOLOR], watercolorActive);
    this.textButton?.classList.toggle("is-active", this.toolMode === TOOL_TEXT || this.textPanelOpen);
    this.textButton?.toggleAttribute("hidden", false);
    this.selectButton?.classList.toggle("is-active", this.toolMode === TOOL_SELECT);
    this.editMarkdownButton?.classList.toggle("is-active", this.toolMode === TOOL_EDIT_MD);
    const selectedElements = this.hasHybridSelection();
    const paletteDisabled = this.toolMode === TOOL_EDIT_MD || this.toolMode === TOOL_SELECT && !selectedElements;
    this.paletteButton?.toggleAttribute("disabled", paletteDisabled);
    this.paletteButton?.classList.toggle("is-selection-available", this.toolMode === TOOL_SELECT && selectedElements);
    const markdownSelected = this.getSelectedMarkdownBlocks().length > 0 || this.selectedWholeElementGroups().some((group) => group.boxed);
    this.markdownBackgroundInput?.toggleAttribute("hidden", !markdownSelected);
    this.clearMarkdownBackgroundButton?.toggleAttribute("hidden", !markdownSelected);
    this.previewEl.toggleClass("is-watercolor-mode", this.toolMode === TOOL_DRAW && this.brushMode === BRUSH_WATERCOLOR);
    this.previewEl.toggleClass("is-edit-md-mode", this.toolMode === TOOL_EDIT_MD);
  }
  createTextPanel() {
    const groups = [
      {
        labelKey: "textGroup",
        items: [
          { id: "plain", labelKey: "textPlain", icon: "type" },
          { id: "rectangle", labelKey: "outlineButton", icon: "square" },
          { id: "circle", labelKey: "pillButton", icon: "square" },
          { id: "arrow", labelKey: "arrow", icon: "move-up-right" }
        ]
      },
      {
        labelKey: "importGroup",
        items: [
          { id: "image", labelKey: "image", icon: "image" },
          { id: "video", labelKey: "video", icon: "film" },
          { id: "attachment", labelKey: "file", icon: "paperclip" }
        ]
      },
      {
        labelKey: "previewGroup",
        items: [
          { id: "markdown", labelKey: "markdown", icon: "pilcrow" },
          { id: "html", labelKey: "html", icon: "code" },
          { id: "note", labelKey: "note", icon: "file-text" },
          { id: "mindMap", labelKey: "mindMap", icon: "git-fork" }
        ]
      }
    ];
    for (const group of groups) {
      const groupEl = this.textPanel.createDiv({ cls: "notedraw-text-group" });
      groupEl.createDiv({ cls: "notedraw-text-group-label", text: this.plugin.t(group.labelKey) });
      const gridEl = groupEl.createDiv({ cls: "notedraw-text-grid" });
      for (const item of group.items) {
        const label = this.plugin.t(item.labelKey);
        const button = gridEl.createEl("button", {
          cls: "notedraw-text-option",
          attr: { type: "button", title: label, "aria-label": label }
        });
        button.dataset.noteDrawTextPreset = item.id;
        setIcon(button, item.icon);
        button.createSpan({ text: label });
        bindNoteDrawControlTap(button, () => {
          if (item.id === "mindMap") {
            this.setTextPanelOpen(false);
            this.scheduleMindMapFilePicker();
            return;
          }
          this.textPreset = item.id;
          this.setTextMode();
          this.setTextPanelOpen(false);
          this.syncTextPanelButtons();
          this.syncSharedToolbarState();
        });
      }
    }
    this.syncTextPanelButtons();
  }
  scheduleMindMapFilePicker() {
    this.plugin.scheduleMindMapFilePicker(this);
  }
  openMindMapFilePicker() {
    this.plugin.openMindMapFilePicker(this);
  }
  syncTextPanelButtons() {
    this.textPanel?.querySelectorAll(".notedraw-text-option").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.noteDrawTextPreset === this.textPreset);
    });
  }
  createSelectionMenu() {
    const actions = [
      { icon: "list-filter", key: "selectFloatingOnly", action: () => this.cycleSelectionFilter() },
      { icon: "copy", key: "copyElement", action: () => this.copySelectedElements() },
      { icon: "clipboard-paste", key: "pasteElement", action: () => this.pasteCopiedElements() },
      { icon: "external-link", key: "openSourceNote", action: () => void this.openSelectedMindMapSource() },
      { icon: "repeat-2", key: "toggleFlowMode", action: () => this.toggleSelectedFlowMode() },
      { icon: "bring-to-front", key: "bringToFront", action: () => this.reorderSelectedStrokes("front") },
      { icon: "move-up", key: "moveForward", action: () => this.reorderSelectedStrokes("forward") },
      { icon: "move-down", key: "moveBackward", action: () => this.reorderSelectedStrokes("backward") },
      { icon: "send-to-back", key: "sendToBack", action: () => this.reorderSelectedStrokes("back") },
      { icon: "group", key: "selectRelatedElements", action: () => this.selectRelatedElements() },
      { icon: "box-select", key: "boxElements", action: () => this.toggleSelectedElementBox() },
      { icon: "lock", key: "lockElement", action: () => this.toggleSelectedStrokeLock() }
    ];
    for (const item of actions) {
      const title = this.plugin.t(item.key);
      const button = this.selectionMenu.createEl("button", {
        cls: "notedraw-selection-menu-button",
        attr: { type: "button", title, "aria-label": title }
      });
      button.dataset.noteDrawTitleKey = item.key;
      setIcon(button, item.icon);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        item.action();
      });
    }
    this.syncSelectionMenuButtons();
  }
  syncSelectionMenuButtons() {
    if (!this.selectionMenu) {
      return;
    }
    const selectedLocks = [
      ...this.getSelectedStrokeIndexes().map((index) => Boolean(this.drawingData.strokes[index]?.locked)),
      ...this.getSelectedMarkdownBlocks().map((block) => Boolean(block.locked))
    ];
    const locked = selectedLocks.length > 0 && selectedLocks.every(Boolean);
    const lockButton = this.selectionMenu.querySelector('[data-note-draw-title-key="lockElement"], [data-note-draw-title-key="unlockElement"]');
    if (lockButton) {
      const key = locked ? "unlockElement" : "lockElement";
      lockButton.dataset.noteDrawTitleKey = key;
      this.plugin.setAccessibleLabel(lockButton, key);
      setIcon(lockButton, locked ? "unlock" : "lock");
    }
    const pasteButton = this.selectionMenu.querySelector('[data-note-draw-title-key="pasteElement"]');
    pasteButton?.toggleAttribute("disabled", !this.plugin.elementClipboard?.strokes?.length);
    const sourceButton = this.selectionMenu.querySelector('[data-note-draw-title-key="openSourceNote"]');
    sourceButton?.toggleAttribute("hidden", !this.selectedMindMapSource());
    const filterContext = this.selectionFilterContext();
    const filterButton = this.selectionMenu.querySelector('[data-note-draw-title-key="selectFloatingOnly"], [data-note-draw-title-key="selectMarkdownOnly"], [data-note-draw-title-key="selectAllElements"]');
    if (filterButton) {
      const nextMode = nextSelectionFilterMode(filterContext.mode);
      const key = nextMode === SELECTION_FILTER_FLOATING
        ? "selectFloatingOnly"
        : nextMode === SELECTION_FILTER_MARKDOWN
          ? "selectMarkdownOnly"
          : "selectAllElements";
      filterButton.dataset.noteDrawTitleKey = key;
      filterButton.dataset.noteDrawSelectionFilter = filterContext.mode;
      this.plugin.setAccessibleLabel(filterButton, key);
      setIcon(filterButton, nextMode === SELECTION_FILTER_FLOATING ? "layers-2" : nextMode === SELECTION_FILTER_MARKDOWN ? "file-text" : "layers-3");
      filterButton.toggleAttribute("hidden", !filterContext.snapshot.hasMixedSelection);
    }
    const flowSelection = this.selectedFlowModeElements();
    const flowModeButton = this.selectionMenu.querySelector('[data-note-draw-title-key="toggleFlowMode"], [data-note-draw-title-key="convertToNoteFlow"], [data-note-draw-title-key="convertToFloating"]');
    if (flowModeButton) {
      const key = flowSelection.noteFlowCount === flowSelection.total
        ? "convertToFloating"
        : flowSelection.floatingCount === flowSelection.total
          ? "convertToNoteFlow"
          : "toggleFlowMode";
      flowModeButton.dataset.noteDrawTitleKey = key;
      this.plugin.setAccessibleLabel(flowModeButton, key);
      setIcon(flowModeButton, key === "convertToFloating" ? "pin" : key === "convertToNoteFlow" ? "wrap-text" : "repeat-2");
      flowModeButton.toggleAttribute("hidden", !this.supportsNoteFlow() || flowSelection.total === 0);
    }
    const boxed = this.selectedWholeElementGroups().some((group) => group.boxed);
    const boxButton = this.selectionMenu.querySelector('[data-note-draw-title-key="boxElements"], [data-note-draw-title-key="unboxElements"]');
    if (boxButton) {
      const key = boxed ? "unboxElements" : "boxElements";
      boxButton.dataset.noteDrawTitleKey = key;
      this.plugin.setAccessibleLabel(boxButton, key);
      setIcon(boxButton, boxed ? "package-open" : "box-select");
    }
  }
  selectedFlowModeElements() {
    const strokes = this.getSelectedStrokeIndexes().filter((index) => {
      const stroke = this.drawingData?.strokes?.[index];
      return stroke && !stroke.locked && !isConnectorStroke(stroke);
    });
    const markdownBlocks = this.getSelectedMarkdownBlocks().filter((block) => !block.locked);
    const noteFlowCount = strokes.filter((index) => Boolean(normalizeNoteFlow(this.drawingData.strokes[index]?.noteFlow))).length
      + markdownBlocks.filter((block) => !block.floating).length;
    const total = strokes.length + markdownBlocks.length;
    return {
      strokes,
      markdownBlocks,
      noteFlowCount,
      floatingCount: total - noteFlowCount,
      total
    };
  }
  selectionFilterContext() {
    const strokeIndexes = this.getSelectedStrokeIndexes();
    const markdownBlockIds = this.getSelectedMarkdownBlocks().map((block) => block.id);
    if (this.selectionFilterCycle
      && selectionMatchesFilterMode(
        this.selectionFilterCycle.snapshot,
        this.selectionFilterCycle.mode,
        strokeIndexes,
        markdownBlockIds
      )) {
      return this.selectionFilterCycle;
    }
    return {
      mode: SELECTION_FILTER_ALL,
      snapshot: createSelectionFilterSnapshot(this.drawingData?.strokes, strokeIndexes, markdownBlockIds)
    };
  }
  cycleSelectionFilter() {
    const context = this.selectionFilterContext();
    if (!context.snapshot.hasMixedSelection) {
      this.selectionFilterCycle = null;
      this.syncSelectionMenuButtons();
      return false;
    }
    const mode = nextSelectionFilterMode(context.mode);
    const selection = selectionForFilterMode(context.snapshot, mode);
    const validMarkdownIds = new Set(this.markdownBlockRecords().map((block) => block.id));
    this.selectionFilterCycle = { mode, snapshot: context.snapshot };
    this.selectedStrokeIndexes = new Set(selection.strokeIndexes);
    this.selectedStrokeIndex = selection.strokeIndexes.length ? selection.strokeIndexes[selection.strokeIndexes.length - 1] : -1;
    this.selectedMarkdownBlockIds = new Set(selection.markdownBlockIds.filter((id) => validMarkdownIds.has(id)));
    this.invalidateSelectionFrameSnapshot();
    this.invalidateStaticCache();
    this.syncPaletteInputs();
    this.updateToolButtons();
    this.syncSelectionMenuButtons();
    this.render();
    return true;
  }
  selectedMindMapSource() {
    for (const index of this.getSelectedStrokeIndexes()) {
      const node = normalizeMindMapNode(this.drawingData.strokes[index]?.mindMapNode);
      if (node?.sourcePath) {
        return node;
      }
    }
    return null;
  }
  async openSelectedMindMapSource() {
    const node = this.selectedMindMapSource();
    const file = node ? this.plugin.resolveApiFile(node.sourcePath, this.file?.path || "") : null;
    if (!file) {
      return false;
    }
    this.hideSelectionMenu();
    const leaf = this.plugin.app.workspace.getLeaf(false);
    await leaf.openFile(file, Number.isFinite(node.sourceLine) && node.sourceLine >= 0 ? { eState: { line: node.sourceLine } } : void 0);
    const editor = leaf.view?.editor;
    if (editor && Number.isFinite(node.sourceLine) && node.sourceLine >= 0) {
      editor.setCursor({ line: node.sourceLine, ch: 0 });
      editor.scrollIntoView?.({ from: { line: node.sourceLine, ch: 0 }, to: { line: node.sourceLine, ch: 0 } }, true);
    }
    return true;
  }
  showSelectionMenu(clientPoint = null) {
    if (!this.hasHybridSelection() || !this.selectionMenu) {
      return;
    }
    this.syncSelectionMenuButtons();
    const fallback = this.getSelectedFrameCanvasRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const x = Number.isFinite(clientPoint?.x) ? clientPoint.x : fallback ? canvasRect.left + fallback.x + fallback.width / 2 : canvasRect.left + 20;
    const y = Number.isFinite(clientPoint?.y) ? clientPoint.y : fallback ? canvasRect.top + fallback.y : canvasRect.top + 20;
    const desiredWidth = Math.max(210, this.selectionMenu.getBoundingClientRect().width || 276);
    const height = Math.max(38, this.selectionMenu.getBoundingClientRect().height || 38);
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportWidth = Math.max(160, viewport?.width || window.innerWidth || 160);
    const viewportHeight = Math.max(120, viewport?.height || window.innerHeight || 120);
    const width = Math.min(desiredWidth, Math.max(144, viewportWidth - 16));
    const left = clamp(Math.round(x - width / 2), viewportLeft + 8, Math.max(viewportLeft + 8, viewportLeft + viewportWidth - width - 8));
    const top = clamp(Math.round(y - height - 14), viewportTop + 8, Math.max(viewportTop + 8, viewportTop + viewportHeight - height - 8));
    setNoteDrawCssProps(this.selectionMenu, {
      "--notedraw-selection-menu-left": `${left}px`,
      "--notedraw-selection-menu-top": `${top}px`
    });
    this.selectionMenuOpen = true;
    this.selectionMenu.addClass("is-visible");
    this.previewEl.addClass("is-selection-menu-open");
    this.syncFloatingControlClasses();
  }
  hideSelectionMenu() {
    this.selectionMenuOpen = false;
    this.selectionMenu?.removeClass("is-visible");
    this.previewEl?.removeClass("is-selection-menu-open");
    this.syncFloatingControlClasses();
  }
  startSelectionLongPress(event) {
    this.clearSelectionLongPress();
    if (!this.hasHybridSelection()) {
      return;
    }
    this.selectionLongPressState = {
      pointerId: event.pointerId,
      client: { x: event.clientX, y: event.clientY }
    };
    this.selectionLongPressTimer = window.setTimeout(() => {
      if (!this.selectionLongPressState || this.selectionLongPressState.pointerId !== this.activePointerId || this.dragStrokeMoved || this.resizeSelectionMoved) {
        return;
      }
      this.releasePointerCapture(this.selectionLongPressState.pointerId);
      this.clearSelectedStrokeDragState();
      this.showSelectionMenu(this.selectionLongPressState.client);
      this.clearSelectionLongPress();
      this.render();
    }, this.longPressDelayMs());
  }
  clearSelectionLongPress() {
    if (this.selectionLongPressTimer) {
      window.clearTimeout(this.selectionLongPressTimer);
      this.selectionLongPressTimer = null;
    }
    this.selectionLongPressState = null;
  }
  onCanvasContextMenu(event) {
    if (!this.active) {
      return;
    }
    if (this.shouldPassThroughHeaderPoint(event)) {
      return;
    }
    if (this.isNoteFlowPenActive()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const point = this.eventToPoint(event);
    const hitStrokeIndex = this.findStrokeAt(point, { x: event.clientX, y: event.clientY });
    if (hitStrokeIndex >= 0) {
      if (!this.isStrokeSelected(hitStrokeIndex)) {
        this.setSelectedStrokes(hitStrokeIndex);
      }
      this.clearSelectionLongPress();
      this.showSelectionMenu({ x: event.clientX, y: event.clientY });
      this.render();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.hasHybridSelection() && this.selectedStrokeFrameContains(point)) {
      this.clearSelectionLongPress();
      this.showSelectionMenu({ x: event.clientX, y: event.clientY });
      event.preventDefault();
      event.stopPropagation();
    }
  }
  onPreviewContextMenu(event) {
    if (!this.active || this.shouldPassThroughHeaderPoint(event)) {
      return;
    }
    if (this.isNoteFlowPenActive()) {
      return;
    }
    const target = event.target;
    const targetShell = target?.closest?.(".notedraw-shell");
    if (targetShell && targetShell !== this.previewEl) {
      return;
    }
    if (target?.closest?.(NOTEDRAW_OWNED_MUTATION_SELECTOR)) {
      const embed = target.closest(".notedraw-embed");
      const index = Number(embed?.dataset?.noteDrawStrokeIndex);
      if (!Number.isInteger(index) || index < 0 || !this.drawingData?.strokes?.[index]) {
        return;
      }
      if (!this.isStrokeSelected(index)) {
        this.setSelectedStrokes(index);
      }
      this.clearSelectionLongPress();
      this.showSelectionMenu({ x: event.clientX, y: event.clientY });
      this.render();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (target?.closest?.(".notedraw-toolbar, .notedraw-palette-panel, .notedraw-brush-panel, .notedraw-text-panel, .notedraw-selection-menu, .notedraw-format-toolbar")) {
      return;
    }
    const point = this.eventToPoint(event);
    const hitStrokeIndex = this.findStrokeAt(point, { x: event.clientX, y: event.clientY });
    if (hitStrokeIndex < 0 && !(this.hasHybridSelection() && this.selectedStrokeFrameContains(point))) {
      return;
    }
    if (hitStrokeIndex >= 0 && !this.isStrokeSelected(hitStrokeIndex)) {
      this.setSelectedStrokes(hitStrokeIndex);
    }
    this.clearSelectionLongPress();
    this.showSelectionMenu({ x: event.clientX, y: event.clientY });
    this.render();
    event.preventDefault();
    event.stopPropagation();
  }
  createFormatToolbar() {
    this.formatToolbar = createNoteDrawControlElement(this.floatingControlsHost || this.previewEl, "notedraw-format-toolbar");
    this.formatToolbar.addEventListener("mousedown", (event) => {
      if (event.target?.closest?.("button")) {
        event.preventDefault();
      }
    });
    this.createFormatMoveButton();
    this.createFormatButton("bold", "bold", "bold", () => this.applyTextInlineFormat("strong"));
    this.createFormatButton("italic", "italic", "italic", () => this.applyTextInlineFormat("em"));
    this.createFormatButton("underline", "underline", "underline", () => this.applyTextInlineFormat("u"));
    this.createFormatButton("code-2", "inlineCode", "code", () => this.applyTextInlineFormat("code"));
    this.createFormatButton("keyboard", "keyboardTag", "kbd", () => this.applyTextInlineFormat("kbd"));
    this.createFormatButton("superscript", "superscript", "sup", () => this.applyTextInlineFormat("sup"));
    this.createFormatButton("subscript", "subscript", "sub", () => this.applyTextInlineFormat("sub"));
    this.createFormatButton("square-code", "codeBlock", "block-code", () => this.applyTextBlockFormat("code"));
    this.createFormatButton("highlighter", "highlight", "mark", () => this.applyTextInlineFormat("mark", { backgroundColor: this.formatHighlightInput?.value || "#fff59d" }));
    this.createFormatButton("wrap-text", "insertBreak", "br", () => this.insertTextBreak());
    this.createFormatButton("eraser", "clearFormat", "clear-format", () => this.clearTextFormat());
    this.formatColorInput = this.formatToolbar.createEl("input", {
      cls: "notedraw-format-color",
      attr: {
        type: "color",
        value: "#e53935",
        title: this.plugin.t("textColor"),
        "aria-label": this.plugin.t("textColor")
      }
    });
    this.formatColorInput.addEventListener("input", () => this.applyTextInlineFormat("span", { color: this.formatColorInput.value }));
    this.formatHighlightInput = this.formatToolbar.createEl("input", {
      cls: "notedraw-format-color",
      attr: {
        type: "color",
        value: "#fff59d",
        title: this.plugin.t("highlightColor"),
        "aria-label": this.plugin.t("highlightColor")
      }
    });
    this.formatHighlightInput.addEventListener("input", () => this.applyTextInlineFormat("mark", { backgroundColor: this.formatHighlightInput.value }));
    this.formatSizeSelect = this.formatToolbar.createEl("select", {
      cls: "notedraw-format-size",
      attr: { title: this.plugin.t("textSize"), "aria-label": this.plugin.t("textSize") }
    });
    [
      ["", this.plugin.t("size")],
      ["0.85em", "S"],
      ["1em", "M"],
      ["1.25em", "L"],
      ["1.5em", "XL"],
      ["2em", "XXL"]
    ].forEach(([value, label]) => {
      this.formatSizeSelect.createEl("option", { text: label, attr: { value } });
    });
    this.formatSizeSelect.addEventListener("change", () => {
      const size = this.formatSizeSelect.value;
      if (size) {
        this.applyTextInlineFormat("span", { fontSize: size });
      }
      this.formatSizeSelect.value = "";
    });
  }
  createFormatMoveButton() {
    const button = this.formatToolbar.createEl("button", {
      cls: "notedraw-format-button notedraw-format-move-button",
      attr: { type: "button", title: this.plugin.t("movePanel"), "aria-label": this.plugin.t("movePanel") }
    });
    setIcon(button, "move");
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("pointerdown", (event) => this.startFormatToolbarDrag(event));
    return button;
  }
  createFormatButton(icon, titleKey, id, action) {
    const title = this.plugin.t(titleKey);
    const button = this.formatToolbar.createEl("button", {
      cls: "notedraw-format-button",
      attr: { type: "button", title, "aria-label": title }
    });
    button.dataset.noteDrawTitleKey = titleKey;
    button.dataset.noteDrawFormat = id;
    setIcon(button, icon);
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    });
    return button;
  }
  onDocumentSelectionChange() {
    if (!this.currentEditor || !this.formatToolbar) {
      return;
    }
    const selection = window.getSelection?.();
    if (!selection || !selection.rangeCount) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!this.currentEditor.contains(range.commonAncestorContainer)) {
      return;
    }
    this.currentTextRange = range.cloneRange();
    this.positionFormatToolbar();
  }
  positionFormatToolbar() {
    if (!this.formatToolbar || !this.currentEditor) {
      return;
    }
    const selection = window.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : this.currentTextRange;
    const rect = range ? rangeLineRect(range) || this.currentEditor.getBoundingClientRect() : this.currentEditor.getBoundingClientRect();
    const toolbarRect = this.formatToolbar.getBoundingClientRect();
    const width = Math.max(180, toolbarRect.width || 280);
    const height = Math.max(34, toolbarRect.height || 34);
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportHeight = Math.max(120, viewport?.height || window.innerHeight || 120);
    const viewportWidth = Math.max(160, viewport?.width || window.innerWidth || 160);
    const minTop = viewportTop + 8;
    const maxTop = Math.max(minTop, viewportTop + viewportHeight - height - 8);
    const gap = 14;
    const preferredLeft = rect.left + rect.width / 2 - width / 2;
    const left = clamp(Math.round(preferredLeft), viewportLeft + 8, Math.max(viewportLeft + 8, viewportLeft + viewportWidth - width - 8));
    if (this.formatToolbarManualPosition) {
      const top = clamp(Math.round(this.formatToolbarManualPosition.top), minTop, maxTop);
      const manualLeft = clamp(Math.round(this.formatToolbarManualPosition.left), viewportLeft + 8, Math.max(viewportLeft + 8, viewportLeft + viewportWidth - width - 8));
      this.formatToolbarManualPosition = { top, left: manualLeft };
      setNoteDrawCssProps(this.formatToolbar, {
        "--notedraw-format-top": `${top}px`,
        "--notedraw-format-left": `${manualLeft}px`
      });
      return;
    }
    const lineStep = Math.max(22, Math.round(rect.height + 6));
    const belowOneLine = rect.bottom + gap + lineStep;
    const above = rect.top - height - gap;
    const below = rect.bottom + gap;
    const top = belowOneLine <= maxTop ? belowOneLine : below <= maxTop ? below : above >= minTop ? above : clamp(Math.round(belowOneLine), minTop, maxTop);
    setNoteDrawCssProps(this.formatToolbar, {
      "--notedraw-format-top": `${top}px`,
      "--notedraw-format-left": `${left}px`
    });
  }
  startFormatToolbarDrag(event) {
    if (!this.formatToolbar) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rect = this.formatToolbar.getBoundingClientRect();
    this.formatToolbarDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTop: rect.top,
      startLeft: rect.left
    };
    this.formatToolbarManualPosition = { top: rect.top, left: rect.left };
    this.formatToolbar.addClass("is-moving");
    activeDocument.addEventListener("pointermove", this.onFormatToolbarDragMove, true);
    activeDocument.addEventListener("pointerup", this.onFormatToolbarDragEnd, true);
    activeDocument.addEventListener("pointercancel", this.onFormatToolbarDragEnd, true);
  }
  onFormatToolbarDragMove(event) {
    if (!this.formatToolbarDrag || !this.formatToolbar || event.pointerId !== this.formatToolbarDrag.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const toolbarRect = this.formatToolbar.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportHeight = Math.max(120, viewport?.height || window.innerHeight || 120);
    const viewportWidth = Math.max(160, viewport?.width || window.innerWidth || 160);
    const top = clamp(
      this.formatToolbarDrag.startTop + event.clientY - this.formatToolbarDrag.startY,
      viewportTop + 8,
      Math.max(viewportTop + 8, viewportTop + viewportHeight - toolbarRect.height - 8)
    );
    const left = clamp(
      this.formatToolbarDrag.startLeft + event.clientX - this.formatToolbarDrag.startX,
      viewportLeft + 8,
      Math.max(viewportLeft + 8, viewportLeft + viewportWidth - toolbarRect.width - 8)
    );
    this.formatToolbarManualPosition = { top, left };
    setNoteDrawCssProps(this.formatToolbar, {
      "--notedraw-format-top": `${Math.round(top)}px`,
      "--notedraw-format-left": `${Math.round(left)}px`
    });
  }
  onFormatToolbarDragEnd(event) {
    if (this.formatToolbarDrag && event?.pointerId !== this.formatToolbarDrag.pointerId) {
      return;
    }
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.stopFormatToolbarDrag();
  }
  stopFormatToolbarDrag() {
    this.formatToolbarDrag = null;
    this.formatToolbar?.removeClass("is-moving");
    activeDocument.removeEventListener("pointermove", this.onFormatToolbarDragMove, true);
    activeDocument.removeEventListener("pointerup", this.onFormatToolbarDragEnd, true);
    activeDocument.removeEventListener("pointercancel", this.onFormatToolbarDragEnd, true);
  }
  restoreTextRange() {
    if (!this.currentEditor || !this.currentTextRange) {
      return false;
    }
    const selection = window.getSelection?.();
    if (!selection) {
      return false;
    }
    selection.removeAllRanges();
    selection.addRange(this.currentTextRange);
    return true;
  }
  applyTextInlineFormat(tagName, styles = {}) {
    if (!this.currentEditor || !this.restoreTextRange()) {
      return;
    }
    const selection = window.getSelection?.();
    if (!selection?.rangeCount) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!this.currentEditor.contains(range.commonAncestorContainer) || range.collapsed) {
      return;
    }
    const wrapper = activeDocument.createElement(tagName);
    applyInlineFormatStyles(wrapper, styles);
    const fragment = range.extractContents();
    wrapper.appendChild(fragment);
    range.insertNode(wrapper);
    selectNodeContents(wrapper);
    this.currentTextRange = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0).cloneRange() : null;
    this.queueCurrentTextSave(true);
    this.positionFormatToolbar();
  }
  applyTextBlockFormat(kind) {
    if (!this.currentEditor || !this.restoreTextRange()) {
      return;
    }
    const selection = window.getSelection?.();
    if (!selection?.rangeCount) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!this.currentEditor.contains(range.commonAncestorContainer)) {
      return;
    }
    const text = selection.toString() || "";
    if (kind === "code") {
      const pre = activeDocument.createElement("pre");
      const code = activeDocument.createElement("code");
      code.textContent = text || "code";
      pre.appendChild(code);
      range.deleteContents();
      range.insertNode(pre);
      selectNodeContents(code);
      this.currentTextRange = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0).cloneRange() : null;
      this.queueCurrentTextSave(true);
      this.positionFormatToolbar();
    }
  }
  insertTextBreak() {
    if (!this.currentEditor || !this.restoreTextRange()) {
      return;
    }
    const selection = window.getSelection?.();
    if (!selection?.rangeCount) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!this.currentEditor.contains(range.commonAncestorContainer)) {
      return;
    }
    range.deleteContents();
    const br = activeDocument.createElement("br");
    range.insertNode(br);
    range.setStartAfter(br);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    this.currentTextRange = range.cloneRange();
    this.queueCurrentTextSave(true);
    this.positionFormatToolbar();
  }
  clearTextFormat() {
    if (!this.currentEditor || !this.restoreTextRange()) {
      return;
    }
    const selection = window.getSelection?.();
    if (!selection?.rangeCount) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (!this.currentEditor.contains(range.commonAncestorContainer)) {
      return;
    }
    const clearWholeEditor = range.collapsed;
    const plainText = clearWholeEditor ? this.currentEditor.innerText || this.currentEditor.textContent || "" : selection.toString() || range.cloneContents().textContent || "";
    const textNode = activeDocument.createTextNode(plainText);
    if (clearWholeEditor) {
      this.currentEditor.replaceChildren(textNode);
    } else {
      const marker = activeDocument.createElement("span");
      marker.dataset.noteDrawClearFormat = "true";
      marker.textContent = plainText;
      range.deleteContents();
      range.insertNode(marker);
      hoistPlainTextMarker(marker, this.currentEditor, isClearableInlineFormattingElement);
      marker.replaceWith(textNode);
    }
    const nextRange = activeDocument.createRange();
    nextRange.setStart(textNode, 0);
    nextRange.setEnd(textNode, textNode.nodeValue?.length || 0);
    selection.removeAllRanges();
    selection.addRange(nextRange);
    this.currentTextRange = nextRange.cloneRange();
    this.queueCurrentTextSave(true);
    this.positionFormatToolbar();
  }
  queueTextSaveAndWait(file, original, editedSource, element) {
    const scheduled = this.plugin.scheduleTextSaveNow(file, original, editedSource, element, this);
    return this.textCommitBarrier.track(Promise.resolve(scheduled).then(() => this.plugin.flushTextSaveAndWait(element)));
  }
  queueCurrentTextSave(immediate = true) {
    const element = this.currentEditor;
    if (!element || this.surfaceType === "webview") {
      return;
    }
    const original = element.dataset.noteDrawOriginal || "";
    const editedSource = serializeControllerEditableSource(element, this.currentEditorEmbedded);
    const file = this.currentEditorFile || this.file;
    if (this.currentEditorEmbedded) {
      this.plugin.stageTextSave(file, original, editedSource, element, this);
    } else if (immediate) {
      this.queueTextSaveAndWait(file, original, editedSource, element);
    } else {
      this.plugin.scheduleTextSave(file, original, editedSource, element, this);
    }
  }
  toggleTextPanel() {
    this.setTextPanelOpen(!this.textPanelOpen);
  }
  setTextPanelOpen(open) {
    this.textPanelOpen = Boolean(open);
    this.previewEl.toggleClass("is-text-panel-open", this.textPanelOpen);
    this.syncFloatingControlClasses();
    this.textButton?.classList.toggle("is-active", this.toolMode === TOOL_TEXT || this.textPanelOpen);
    if (this.textPanelOpen) {
      this.setPaletteOpen(false);
      this.setBrushPanelOpen(false);
      this.updateFloatingControlsPosition();
      this.syncTextPanelButtons();
    }
    this.syncSharedToolbarState();
  }
  createColorPalette() {
    const row = this.palettePanel.createDiv({ cls: "notedraw-palette-row notedraw-color-row" });
    const iconEl = row.createSpan({ cls: "notedraw-palette-icon" });
    setIcon(iconEl, "palette");
    this.colorSwatchGrid = row.createDiv({ cls: "notedraw-color-grid" });
    this.colorSwatchButtons = COMMON_COLORS.map((color) => {
      const button = this.colorSwatchGrid.createEl("button", {
        cls: "notedraw-color-swatch",
        attr: {
          type: "button",
          title: color,
          "aria-label": this.plugin.t("useColor", { color })
        }
      });
      setNoteDrawCssProps(button, { "--notedraw-swatch-color": color });
      bindNoteDrawControlTap(button, () => {
        this.setCurrentBrushColor(color);
      });
      return button;
    });
    this.advancedColorButton = this.colorSwatchGrid.createEl("button", {
      cls: "notedraw-color-advanced",
      attr: {
        type: "button",
        title: this.plugin.t("advancedColor"),
        "aria-label": this.plugin.t("advancedColor")
      }
    });
    setIcon(this.advancedColorButton, "sliders-horizontal");
    bindNoteDrawControlTap(this.advancedColorButton, () => {
      this.colorInput?.click();
    });
  }
  setCurrentBrushColor(color) {
    if (!isCssColor(color)) {
      return;
    }
    this.currentBrushSettings().color = color;
    this.applyColorToSelectedStrokes(color);
    this.syncCurrentBrushFields();
    this.syncPaletteInputs();
    this.updateToolButtons();
    this.persistCurrentBrushSettings();
    this.syncSharedToolbarState();
  }
  currentPaletteColor() {
    if (this.toolMode === TOOL_SELECT) {
      const selectedGroupColor = this.selectedWholeElementGroups().filter((group) => group.boxed).map((group) => group.borderColor).find((color) => isCssColor(color));
      if (selectedGroupColor) {
        return selectedGroupColor;
      }
      const selectedColor = this.getSelectedStrokeIndexes().map((index) => this.drawingData.strokes[index]?.color).find((color) => isCssColor(color));
      if (selectedColor) {
        return selectedColor;
      }
      const selectedBorder = this.getSelectedMarkdownBlocks().map((block) => block.borderColor).find((color) => isCssColor(color));
      if (selectedBorder) {
        return selectedBorder;
      }
    }
    return this.currentBrushSettings().color;
  }
  currentPaletteWidth() {
    if (this.toolMode === TOOL_SELECT) {
      const selectedWidth = this.getSelectedStrokeIndexes().map((index) => this.drawingData.strokes[index]?.width).find((width) => Number.isFinite(Number(width)));
      if (Number.isFinite(Number(selectedWidth))) {
        return clamp(Number(selectedWidth), MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH);
      }
    }
    return this.currentBrushSettings().width;
  }
  currentPaletteOpacity() {
    if (this.toolMode === TOOL_SELECT) {
      const selectedOpacity = this.getSelectedStrokeIndexes().map((index) => this.drawingData.strokes[index]?.opacity).find((opacity) => Number.isFinite(Number(opacity)));
      if (Number.isFinite(Number(selectedOpacity))) {
        return clamp(Number(selectedOpacity), 0, 1);
      }
    }
    return this.currentBrushSettings().opacity;
  }
  applyColorToSelectedStrokes(color) {
    const indexes = this.getSelectedStrokeIndexes();
    const boxedGroups = this.selectedWholeElementGroups().filter((group) => group.boxed);
    const boxedGroupIds = new Set(boxedGroups.map((group) => group.id));
    const changed = indexes.filter((index) => {
      const stroke = this.drawingData.strokes[index];
      return stroke && !boxedGroupIds.has(stroke.groupId) && stroke.color !== color;
    });
    const changedBlocks = this.getSelectedMarkdownBlocks().filter((block) => !boxedGroupIds.has(block.groupId) && block.borderColor !== color);
    const changedGroups = boxedGroups.filter((group) => group.borderColor !== color);
    if (!changed.length && !changedBlocks.length && !changedGroups.length) {
      return false;
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    for (const index of changed) {
      this.drawingData.strokes[index].color = color;
    }
    for (const block of changedBlocks) {
      block.borderColor = color;
    }
    for (const group of changedGroups) {
      group.borderColor = color;
    }
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.render();
    return true;
  }
  applyBackgroundToSelectedMarkdownBlocks(color) {
    const groups = this.selectedWholeElementGroups().filter((group) => group.boxed);
    const boxedGroupIds = new Set(groups.map((group) => group.id));
    const blocks = this.getSelectedMarkdownBlocks().filter((block) => !boxedGroupIds.has(block.groupId) && block.backgroundColor !== color);
    const changedGroups = groups.filter((group) => group.backgroundColor !== color);
    if (!blocks.length && !changedGroups.length) {
      return false;
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    for (const block of blocks) {
      block.backgroundColor = color;
    }
    for (const group of changedGroups) {
      group.backgroundColor = color;
    }
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.render();
    return true;
  }
  applyOpacityToSelectedStrokes(opacity) {
    const nextOpacity = clamp(Number(opacity), 0, 1);
    const indexes = this.getSelectedStrokeIndexes();
    const changed = indexes.filter((index) => {
      const stroke = this.drawingData.strokes[index];
      return stroke && Math.abs(clamp(Number(stroke.opacity ?? 1), 0, 1) - nextOpacity) >= 0.001;
    });
    if (!changed.length) {
      return false;
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    for (const index of changed) {
      this.drawingData.strokes[index].opacity = nextOpacity;
    }
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.render();
    return true;
  }
  applySizeToSelectedStrokes(width) {
    const nextWidth = clamp(Number(width), MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH);
    const indexes = this.getSelectedStrokeIndexes();
    const changed = indexes.filter((index) => {
      const stroke = this.drawingData.strokes[index];
      return stroke && Math.abs(clamp(Number(stroke.width || this.penWidth), MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH) - nextWidth) >= 0.01;
    });
    if (!changed.length) {
      return false;
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    for (const index of changed) {
      const stroke = this.drawingData.strokes[index];
      const previousWidth = clamp(Number(stroke.width || this.penWidth), MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH);
      const scale = clamp(nextWidth / Math.max(MIN_BRUSH_WIDTH, previousWidth), 0.15, 8);
      stroke.width = nextWidth;
      if (isTextStroke(stroke)) {
        stroke.fontSize = clamp(Number(stroke.fontSize || 18) * scale, 10, 72);
        if (Number(stroke.textWidth) > 0) {
          stroke.textWidth = clamp(Number(stroke.textWidth) * scale, 24, 900);
        }
      }
      if (isTextLikeStroke(stroke) || isEmbedStroke(stroke)) {
        stroke.previewWidth = clamp(Number(stroke.previewWidth || 260) * scale, 80, 900);
        stroke.previewHeight = clamp(Number(stroke.previewHeight || 160) * scale, 40, 700);
      }
      if (isConnectorStroke(stroke)) {
        stroke.width = nextWidth;
      }
    }
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.render();
    return true;
  }
  syncColorSwatches() {
    if (!this.colorSwatchButtons?.length) {
      return;
    }
    const currentColor = this.currentPaletteColor()?.toLowerCase?.();
    this.colorSwatchButtons.forEach((button, index) => {
      const color = COMMON_COLORS[index].toLowerCase();
      button.classList.toggle("is-active", color === currentColor);
    });
    this.advancedColorButton?.classList.toggle(
      "is-active",
      Boolean(currentColor) && !COMMON_COLORS.some((color) => color.toLowerCase() === currentColor)
    );
  }
  applyBrushButtonState(button, settings, active) {
    if (!button) {
      return;
    }
    const color = isCssColor(settings?.color) ? settings.color : DEFAULT_SETTINGS.defaultPenColor;
    button.classList.add("notedraw-brush-button");
    button.classList.toggle("is-active", active);
    button.classList.toggle("is-brush-color-active", active);
    setNoteDrawCssProps(button, {
      "--notedraw-brush-button-color": color,
      "--notedraw-brush-button-contrast": contrastTextColor(color)
    });
  }
  toggleSelectMode() {
    this.toolMode = this.toolMode === TOOL_SELECT ? TOOL_DRAW : TOOL_SELECT;
    this.previewEl.toggleClass("is-select-mode", this.toolMode === TOOL_SELECT);
    if (this.toolMode === TOOL_SELECT) {
      this.setPaletteOpen(false);
      this.setBrushPanelOpen(false);
      this.setTextPanelOpen(false);
    } else {
      this.hideSelectionMenu();
    }
    this.updateToolButtons();
    this.endTextEdit();
    this.cancelCurrentStroke();
    this.cancelSelectionDrag(true);
    this.persistInteractionSettings();
    this.syncSharedToolbarState();
    this.render();
  }
  togglePalettePanel() {
    if (this.toolMode === TOOL_EDIT_MD || this.toolMode === TOOL_SELECT && !this.hasHybridSelection()) {
      this.setPaletteOpen(false);
      return;
    }
    this.setPaletteOpen(!this.paletteOpen);
    if (this.paletteOpen) {
      this.setTextPanelOpen(false);
    }
  }
  setPaletteOpen(open) {
    this.paletteOpen = Boolean(open);
    this.previewEl.toggleClass("is-palette-open", this.paletteOpen);
    this.syncFloatingControlClasses();
    this.paletteButton?.classList.toggle("is-active", this.paletteOpen);
    if (this.paletteOpen) {
      this.setBrushPanelOpen(false);
      this.updateFloatingControlsPosition();
    }
    this.syncSharedToolbarState();
  }
  onDocumentPointerDown(event) {
    if (!this.paletteOpen && !this.brushPanelOpen && !this.textPanelOpen && !this.selectionMenuOpen && !this.currentEditor) {
      return;
    }
    if (!this.controlsShouldBeVisible()) {
      return;
    }
    const target = event.target;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const containsEvent = (element) => Boolean(element) && (path.includes(element) || element.contains?.(target));
    if ([
      this.palettePanel,
      this.paletteButton,
      this.brushPanel,
      this.penButton,
      this.watercolorButton,
      this.textPanel,
      this.textButton,
      this.selectionMenu,
      this.formatToolbar,
      this.currentEditor,
      this.floatingTextInput?.element
    ].some(containsEvent)) {
      return;
    }
    this.setPaletteOpen(false);
    this.setBrushPanelOpen(false);
    this.setTextPanelOpen(false);
    this.hideSelectionMenu();
    if (this.currentEditor) {
      this.endTextEdit();
    }
  }
  onButtonPointerDown(event) {
    if (event?.button !== void 0 && event.button !== 0) {
      return;
    }
    this.clearButtonLongPress();
    this.buttonLongPressTimer = window.setTimeout(() => {
      this.buttonLongPressed = true;
      this.toggleDrawingsVisiblePersisted().catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to toggle NoteDraw visibility`, error);
      });
    }, this.longPressDelayMs());
  }
  onButtonPointerUp() {
    this.clearButtonLongPress();
  }
  onButtonTouchEnd(event) {
    this.clearButtonLongPress();
    if (!isAppleMobileRuntime()) {
      return;
    }
    if (this.buttonLongPressed) {
      this.buttonLongPressed = false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return;
    }
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.suppressNextButtonClick = true;
    window.setTimeout(() => {
      this.suppressNextButtonClick = false;
    }, 500);
    this.toggle().catch((error) => {
      console.error(`[${PLUGIN_ID}] Failed to toggle NoteDraw`, error);
    });
  }
  onButtonClick(event) {
    if (this.suppressNextButtonClick) {
      this.suppressNextButtonClick = false;
      event?.preventDefault?.();
      event?.stopPropagation?.();
      return;
    }
    if (this.buttonLongPressed) {
      this.buttonLongPressed = false;
      event?.preventDefault();
      event?.stopPropagation();
      return;
    }
    this.toggle().catch((error) => {
      console.error(`[${PLUGIN_ID}] Failed to toggle NoteDraw`, error);
    });
  }
  onButtonContextMenu(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    this.clearButtonLongPress();
    this.buttonLongPressed = false;
    this.toggleDrawingsVisiblePersisted().catch((error) => {
      console.error(`[${PLUGIN_ID}] Failed to toggle NoteDraw visibility`, error);
    });
  }
  clearButtonLongPress() {
    if (this.buttonLongPressTimer) {
      window.clearTimeout(this.buttonLongPressTimer);
      this.buttonLongPressTimer = null;
    }
  }
  toggleDrawingsVisible() {
    this.setDrawingsVisible(!this.drawingsVisible, { persist: true });
  }
  async toggleDrawingsVisiblePersisted() {
    await this.ensureDrawingsLoaded();
    this.toggleDrawingsVisible();
  }
  setDrawingsVisible(visible, options = {}) {
    this.applyDrawingsVisibility(visible);
    this.drawingData.visible = this.drawingsVisible;
    if (options.persist === true) {
      this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    }
    this.syncSharedToolbarState();
  }
  applyDrawingsVisibility(visible) {
    this.drawingsVisible = Boolean(visible);
    this.previewEl.toggleClass("is-drawing-hidden", !this.drawingsVisible);
    if (this.drawingsVisible) {
      this.scheduleFrozenNoteFlowLayoutRestore();
    } else {
      this.cancelFrozenNoteFlowLayoutRestore();
      this.clearNoteFlowLayout();
    }
    if (this.drawingsLoaded) {
      this.scheduleResize({ layout: false, measure: false });
    }
    this.plugin.setAccessibleLabel(
      this.button,
      this.surfaceType === "webview" ? "editWebviewDraw" : this.drawingsVisible ? "editTextDraw" : "editTextDrawHidden"
    );
  }
  getResponsiveContentFrame() {
    return measureResponsiveContentFrame(this.previewEl, this.surfaceType, this.canvasWidth(), this.canvas, this.readingZoomScale());
  }
  responsiveViewportScale() {
    return this.usesVisualReadingZoom() ? 1 : this.readingZoomScale();
  }
  getResponsiveLayoutContext(refresh = false) {
    if (this.responsiveLayoutContext && !refresh) {
      return this.responsiveLayoutContext;
    }
    this.responsiveLayoutContext = {
      frame: this.getResponsiveContentFrame(),
      viewportHeight: measureResponsiveViewportHeight(this.previewEl, this.scrollContainer, this.responsiveViewportScale()),
      lineAnchors: [
        ...collectRenderedLineAnchors(this.previewEl, this.canvas, this.canvasWindowTop, this.readingZoomScale()),
        ...collectVirtualMarkdownLineAnchors(this.view, this.previewEl, this.canvas, this.canvasWindowTop, this.file?.path || "", this.readingZoomScale())
      ],
      codeMirror: this.surfaceType === "source" ? getCodeMirrorView(this.view, this.previewEl) : null
    };
    return this.responsiveLayoutContext;
  }
  captureLineLocation(canvasX, canvasY, context = this.getResponsiveLayoutContext(), options = {}) {
    const rendered = captureRenderedLineLocation(context.lineAnchors, canvasX, canvasY, options);
    if (rendered) {
      return rendered;
    }
    if (!context.codeMirror || !this.canvas) {
      return null;
    }
    const canvasRect = this.canvas.getBoundingClientRect();
    const canvasScaleX = canvasRect.width > 0 ? canvasRect.width / this.canvasWidth() : 1;
    const canvasScaleY = canvasRect.height > 0 ? canvasRect.height / Math.max(1, this.canvasRenderHeight) : 1;
    return captureCodeMirrorLineLocation(
      context.codeMirror,
      canvasRect.left + canvasX * canvasScaleX,
      canvasRect.top + (canvasY - this.canvasWindowTop) * canvasScaleY,
      this.file?.path || ""
    );
  }
  projectLineLocation(path, line, context = this.getResponsiveLayoutContext()) {
    const renderedY = projectRenderedLineLocation(context.lineAnchors, path, line);
    if (Number.isFinite(renderedY)) {
      return renderedY;
    }
    if (!context.codeMirror || normalizeVaultPath(path) !== normalizeVaultPath(this.file?.path) || !this.canvas) {
      return NaN;
    }
    const clientY = projectCodeMirrorLineLocation(context.codeMirror, line);
    if (!Number.isFinite(clientY)) {
      return NaN;
    }
    const canvasRect = this.canvas.getBoundingClientRect();
    const canvasScaleY = canvasRect.height > 0 ? canvasRect.height / Math.max(1, this.canvasRenderHeight) : 1;
    return (clientY - canvasRect.top) / Math.max(0.01, canvasScaleY) + this.canvasWindowTop;
  }
  captureResponsivePoint(point, context = this.getResponsiveLayoutContext()) {
    const canvasX = clamp(Number(point?.x || 0), 0, 1) * this.canvasWidth();
    const canvasY = clamp(Number(point?.y || 0), 0, 1) * this.canvasHeight();
    const lineLocation = this.captureLineLocation(canvasX, canvasY, context);
    return {
      ...point,
      ...createResponsivePoint({
        canvasX,
        canvasY,
        canvasWidth: this.canvasWidth(),
        canvasHeight: this.canvasHeight(),
        frame: context.frame,
        sourcePath: lineLocation?.path || this.file?.path || "",
        linePosition: lineLocation?.line ?? null,
        lineConfidence: lineLocation?.lineConfidence ?? null,
        time: point?.t
      })
    };
  }
  captureResponsiveAnchorsForIndexes(indexes) {
    const context = this.getResponsiveLayoutContext(true);
    for (const index of indexes) {
      const stroke = this.drawingData?.strokes?.[index];
      if (stroke?.points?.length && !isConnectorStroke(stroke)) {
        stroke.points = stroke.points.map((point) => this.captureResponsivePoint(point, context));
        this.captureNoteFlowResponsiveAnchors(stroke, context);
        this.captureElementLayoutForStroke(stroke, context, index);
      }
    }
    this.rebuildElementRelations();
  }
  captureNoteFlowResponsiveAnchors(stroke, context = this.getResponsiveLayoutContext()) {
    const noteFlow = normalizeNoteFlow(stroke?.noteFlow);
    if (!noteFlow || !stroke?.points?.length) {
      return false;
    }
    const linePosition = noteFlow.positionBasis === "above" && Number.isFinite(noteFlow.positionLine)
      ? noteFlow.positionLine + 0.999999
      : null;
    const anchorY = linePosition === null
      ? NaN
      : this.projectLineLocation(noteFlow.positionPath, linePosition, context);
    const useLineAnchor = linePosition !== null && Number.isFinite(anchorY);
    const useDocumentAnchor = noteFlow.positionBasis === "document" && noteFlow.positionVersion >= 1;
    stroke.points = stroke.points.map((point) => {
      const canvasX = clamp(Number(point?.x || 0), 0, 1) * this.canvasWidth();
      const canvasY = clamp(Number(point?.y || 0), 0, 1) * this.canvasHeight();
      return {
        ...point,
        ...createResponsivePoint({
          canvasX,
          canvasY,
          canvasWidth: this.canvasWidth(),
          canvasHeight: this.canvasHeight(),
          frame: context.frame,
          sourcePath: useLineAnchor ? noteFlow.positionPath : this.file?.path || "",
          linePosition: useLineAnchor ? linePosition : null,
          lineConfidence: useLineAnchor ? 1 : null,
          lineOffsetY: useLineAnchor ? canvasY - anchorY : useDocumentAnchor ? canvasY : 0,
          time: point?.t
        })
      };
    });
    return true;
  }
  captureElementLayoutForStroke(stroke, context = this.getResponsiveLayoutContext(), index = -1, options = {}) {
    const bounds = getStrokeBounds(stroke, this.canvasWidth(), this.canvasHeight());
    if (!bounds) {
      return null;
    }
    const cornerPoints = {
      topLeft: { x: bounds.minX, y: bounds.minY },
      topRight: { x: bounds.maxX, y: bounds.minY },
      bottomRight: { x: bounds.maxX, y: bounds.maxY },
      bottomLeft: { x: bounds.minX, y: bounds.maxY }
    };
    const cornerLocations = Object.fromEntries(Object.entries(cornerPoints).map(([name, point]) => [
      name,
      this.captureLineLocation(point.x, point.y, context, { maxDistance: 112 }) || { path: this.file?.path || "", line: null }
    ]));
    const previous = normalizeElementLayout(stroke.layout);
    const elementId = strokeElementId(stroke) || createElementLayoutId(index);
    stroke.layout = createElementLayout({
      id: previous?.id || elementId,
      bounds,
      canvasWidth: this.canvasWidth(),
      canvasHeight: this.canvasHeight(),
      frame: context.frame,
      viewportHeight: context.viewportHeight,
      sourcePath: this.file?.path || "",
      cornerLocations,
      metrics: {
        width: stroke.width,
        fontSize: stroke.fontSize,
        textWidth: stroke.textWidth,
        previewWidth: stroke.previewWidth,
        previewHeight: stroke.previewHeight
      },
      // Proximity is not a binding. Only explicit groups/connectors may move
      // other elements together, so layout projection must stay independent.
      relations: []
    });
    stroke.elementId = stroke.layout?.id || elementId;
    return stroke.layout;
  }
  rebuildElementRelations() {
    let changed = false;
    for (const stroke of this.drawingData?.strokes || []) {
      if (isConnectorStroke(stroke)) {
        continue;
      }
      const layout = normalizeElementLayout(stroke.layout);
      if (layout?.id) {
        if (layout.relations.length) {
          stroke.layout = { ...layout, relations: [] };
          changed = true;
        }
      }
    }
    return changed;
  }
  onDocumentPointerFinish(event) {
    if (event.pointerType === "touch" && this.touchPointers.has(event.pointerId)) {
      this.completeTrackedTouch(event.pointerId);
    }
  }
  projectStrokePointsForLayoutRepair(stroke, context, layout) {
    const lineToCanvasY = (path, line) => this.projectLineLocation(path, line, context);
    const sourceFrame = layout?.sourceFrame;
    const trustAnchorX = Boolean(sourceFrame) && isStableResponsiveCaptureFrame(sourceFrame.surfaceWidth, { width: sourceFrame.contentWidth });
    return (Array.isArray(stroke?.points) ? stroke.points : []).map((point) => {
      const projected = projectResponsivePoint(point, {
        canvasWidth: this.canvasWidth(),
        canvasHeight: this.canvasHeight(),
        frame: context.frame,
        lineToCanvasY
      });
      if (trustAnchorX || !point?.anchor) {
        return projected;
      }
      return {
        ...projected,
        x: clamp(Number(point.x), 0, 1)
      };
    });
  }
  preserveAbsoluteStrokePlacement(previousWidth, previousHeight) {
    const nextWidth = this.canvasWidth();
    const nextHeight = this.canvasHeight();
    const sourceWidth = Math.max(1, Number(previousWidth) || nextWidth);
    const sourceHeight = Math.max(1, Number(previousHeight) || nextHeight);
    if (Math.abs(sourceWidth - nextWidth) < 0.01 && Math.abs(sourceHeight - nextHeight) < 0.01) {
      return;
    }
    const preserve = (points) => (Array.isArray(points) ? points : []).map((point) => ({
      ...point,
      x: clamp(Number(point?.x || 0) * sourceWidth / Math.max(1, nextWidth), 0, 1),
      y: clamp(Number(point?.y || 0) * sourceHeight / Math.max(1, nextHeight), 0, 1)
    }));
    for (const stroke of this.drawingData?.strokes || []) {
      stroke.points = preserve(stroke.points);
    }
    if (this.currentStroke?.points?.length) {
      this.currentStroke.points = preserve(this.currentStroke.points);
    }
  }
  initializeAndProjectResponsivePoints(context, signature, options = {}) {
    const hadResponsivePoints = this.responsivePointsInitialized;
    const previousCanvasWidth = Number(options.previousCanvasWidth) > 1 ? Number(options.previousCanvasWidth) : this.canvasWidth();
    const previousCanvasHeight = Number(options.previousCanvasHeight) > 1 ? Number(options.previousCanvasHeight) : this.canvasHeight();
    let migrated = false;
    const elementIds = new Set();
    if (needsElementLayoutMigration(this.drawingData?.strokes) && !isStableResponsiveCaptureFrame(this.canvasWidth(), context.frame)) {
      this.responsivePointsInitialized = false;
      this.responsiveLayoutSignature = "";
      return;
    }
    const lineToCanvasY = (path, line) => this.projectLineLocation(path, line, context);
    for (const [index, stroke] of (this.drawingData?.strokes || []).entries()) {
      if (isConnectorStroke(stroke)) {
        continue;
      }
      const noteFlow = normalizeNoteFlow(stroke?.noteFlow);
      if (noteFlow && (!noteFlow.positionBasis || noteFlow.positionVersion < 1)) {
        const recaptured = this.captureNoteFlowAnchor(stroke, { preservePlacement: true });
        stroke.noteFlow = recaptured;
        if (recaptured?.positionBasis) {
          this.captureNoteFlowResponsiveAnchors(stroke, context);
        }
      }
      const existingLayout = normalizeElementLayout(stroke.layout);
      const needsLayoutRepair = Boolean(existingLayout) && (
        elementLayoutNeedsRepair(existingLayout) || elementLayoutExceedsTarget(existingLayout, this.canvasHeight())
      );
      const hasUniqueElementLayout = Boolean(existingLayout?.id) && !elementIds.has(existingLayout.id) && !needsLayoutRepair;
      if (!hasUniqueElementLayout) {
        if (needsLayoutRepair) {
          stroke.points = this.projectStrokePointsForLayoutRepair(stroke, context, existingLayout);
          stroke.layout = null;
        } else if (existingLayout) {
          stroke.layout = { ...existingLayout, id: "" };
        }
        if (!needsLayoutRepair) {
          stroke.points = stroke.points.map((point) => this.captureResponsivePoint(point, context));
        }
        this.captureElementLayoutForStroke(stroke, context, index, { preserveRelations: !needsLayoutRepair });
        migrated = true;
      }
      const elementId = normalizeElementLayout(stroke.layout)?.id;
      if (elementId) {
        elementIds.add(elementId);
      }
    }
    if (migrated) {
      this.rebuildElementRelations();
    }
    const projected = [];
    const layoutsById = new Map();
    const currentBoundsById = new Map();
    for (const stroke of this.drawingData?.strokes || []) {
      if (isConnectorStroke(stroke)) {
        continue;
      }
      const layout = normalizeElementLayout(stroke.layout);
      if (layout?.id) {
        const currentBounds = getStrokeBounds(stroke, previousCanvasWidth, previousCanvasHeight);
        if (currentBounds) {
          currentBoundsById.set(layout.id, currentBounds);
        }
      }
      if (normalizeNoteFlow(stroke?.noteFlow)) {
        continue;
      }
      const box = projectElementLayout(layout, {
        canvasWidth: this.canvasWidth(),
        canvasHeight: this.canvasHeight(),
        frame: context.frame,
        viewportHeight: context.viewportHeight,
        lineToCanvasY,
        preferDocumentFlow: isMobileRuntime()
      });
      if (layout?.id && box) {
        projected.push(box);
        layoutsById.set(layout.id, layout);
      }
    }
    // Nearby elements are independent unless the user explicitly groups them
    // or connects them. Never let legacy proximity relations move content.
    const transitionProjected = [...projected];
    const noteFlowProjectedById = new Map();
    for (const [index, stroke] of (this.drawingData?.strokes || []).entries()) {
      let noteFlow = normalizeNoteFlow(stroke?.noteFlow);
      if (!noteFlow || isConnectorStroke(stroke)) {
        continue;
      }
      const transitionId = `note-flow:${strokeElementId(stroke) || index}`;
      const previousBounds = getStrokeBounds(stroke, previousCanvasWidth, previousCanvasHeight);
      const layout = normalizeElementLayout(stroke.layout);
      if (previousBounds && !(noteFlow.boxWidthRatio > 0 && noteFlow.boxHeightRatio > 0)) {
        const sourceLeft = Number(layout?.sourceFrame?.contentLeft ?? context.frame?.left ?? 0);
        const sourceWidth = Math.max(1, Number(layout?.sourceFrame?.contentWidth ?? context.frame?.width ?? previousCanvasWidth));
        stroke.noteFlow = {
          ...stroke.noteFlow,
          boxLeftRatio: (previousBounds.minX - sourceLeft) / sourceWidth,
          boxWidthRatio: Math.max(2 / sourceWidth, (previousBounds.maxX - previousBounds.minX) / sourceWidth),
          boxHeightRatio: Math.max(2 / sourceWidth, (previousBounds.maxY - previousBounds.minY) / sourceWidth)
        };
        noteFlow = normalizeNoteFlow(stroke.noteFlow);
        migrated = true;
      }
      const projectedPoints = (stroke.points || []).map((point) => {
        const projectedPoint = projectResponsivePoint(point, {
          canvasWidth: this.canvasWidth(),
          canvasHeight: this.canvasHeight(),
          frame: context.frame,
          lineToCanvasY
        });
        return noteFlow.positionBasis === "document" && noteFlow.positionVersion >= 1
          ? projectNoteFlowDocumentPoint(point, projectedPoint, { canvasHeight: this.canvasHeight() })
          : projectedPoint;
      });
      const projectedBounds = getStrokeBounds({ ...stroke, points: projectedPoints }, this.canvasWidth(), this.canvasHeight());
      const layoutBox = projectElementLayout(layout, {
        canvasWidth: this.canvasWidth(),
        canvasHeight: this.canvasHeight(),
        frame: context.frame,
        viewportHeight: context.viewportHeight,
        lineToCanvasY,
        preferDocumentFlow: isMobileRuntime()
      });
      const projectedBox = layoutBox && projectedBounds ? {
        ...layoutBox,
        y: clamp(projectedBounds.minY, 0, Math.max(0, this.canvasHeight() - layoutBox.height)),
        anchorY: clamp(projectedBounds.minY, 0, Math.max(0, this.canvasHeight() - layoutBox.height))
      } : null;
      if (projectedBox) {
        noteFlowProjectedById.set(transitionId, projectedBox);
      }
      if (previousBounds && (projectedBox || projectedBounds)) {
        const transitionBox = projectedBox || {
          x: projectedBounds.minX,
          y: projectedBounds.minY,
          width: projectedBounds.maxX - projectedBounds.minX,
          height: projectedBounds.maxY - projectedBounds.minY
        };
        currentBoundsById.set(transitionId, previousBounds);
        transitionProjected.push({
          ...transitionBox,
          id: transitionId,
        });
      }
    }
    if (this.surfaceType === "preview" && hadResponsivePoints && !migrated) {
      const transition = settleProjectedElementTransition(
        transitionProjected,
        currentBoundsById,
        this.responsiveProjectionPending,
        { now: Date.now() }
      );
      this.responsiveProjectionPending = transition.pending;
      if (!transition.commit) {
        this.preserveAbsoluteStrokePlacement(previousCanvasWidth, previousCanvasHeight);
        this.scheduleResponsiveProjectionSettle(200, {
          preserveNoteFlowAbsolute: options.preserveNoteFlowAbsolute === true
        });
        return false;
      }
      this.cancelResponsiveProjectionSettle();
    } else {
      this.responsiveProjectionPending = null;
    }
    const projectedById = new Map(projected.map((box) => {
      const stabilized = stabilizeProjectedElementBox(box, currentBoundsById.get(box.id));
      return [box.id, {
        ...stabilized,
        x: clamp(stabilized.x, 0, Math.max(0, this.canvasWidth() - stabilized.width)),
        y: clamp(stabilized.y, 0, Math.max(0, this.canvasHeight() - stabilized.height))
      }];
    }));
    for (const [index, stroke] of (this.drawingData?.strokes || []).entries()) {
      if (isConnectorStroke(stroke)) {
        continue;
      }
      if (normalizeNoteFlow(stroke?.noteFlow)) {
        if (options.preserveNoteFlowAbsolute) {
          stroke.points = preserveAbsoluteNoteFlowPoints(stroke.points, {
            previousWidth: options.previousCanvasWidth,
            previousHeight: options.previousCanvasHeight,
            nextWidth: this.canvasWidth(),
            nextHeight: this.canvasHeight()
          });
          continue;
        }
        const noteFlow = normalizeNoteFlow(stroke.noteFlow);
        const layout = normalizeElementLayout(stroke.layout);
        const transitionId = `note-flow:${strokeElementId(stroke) || index}`;
        const projectedBox = noteFlowProjectedById.get(transitionId);
        const box = projectedBox
          ? stabilizeProjectedElementBox(projectedBox, currentBoundsById.get(transitionId))
          : null;
        const stableFlowBox = noteFlow?.boxWidthRatio > 0 && noteFlow?.boxHeightRatio > 0
          ? {
            ...(box || {}),
            ...projectStableNoteFlowBox({
              boxLeftRatio: noteFlow.boxLeftRatio,
              boxWidthRatio: noteFlow.boxWidthRatio,
              boxHeightRatio: noteFlow.boxHeightRatio,
              contentLeft: context.frame?.left,
              contentWidth: context.frame?.width,
              canvasWidth: this.canvasWidth(),
              y: this.noteFlowStoredRowCanvasY(noteFlow) ?? box?.y ?? layout?.box?.y ?? 0
            })
          }
          : box;
        if (layout && stableFlowBox) {
          stroke.points = projectElementPoints(stroke.points, layout, stableFlowBox, {
            canvasWidth: this.canvasWidth(),
            canvasHeight: this.canvasHeight()
          });
          const metrics = scaleElementMetrics(layout.metrics, stableFlowBox);
          if (metrics.width) {
            stroke.width = metrics.width;
          }
          continue;
        }
        const previousPoints = stroke.points;
        const projectedPoints = stroke.points.map((point) => {
          const projectedPoint = projectResponsivePoint(point, {
            canvasWidth: this.canvasWidth(),
            canvasHeight: this.canvasHeight(),
            frame: context.frame,
            lineToCanvasY
          });
          return noteFlow.positionBasis === "document" && noteFlow.positionVersion >= 1
            ? projectNoteFlowDocumentPoint(point, projectedPoint, { canvasHeight: this.canvasHeight() })
            : projectedPoint;
        });
        stroke.points = stabilizeNoteFlowPointProjection(previousPoints, projectedPoints, {
          canvasWidth: this.canvasWidth(),
          canvasHeight: this.canvasHeight()
        });
        continue;
      }
      const layout = normalizeElementLayout(stroke.layout);
      const box = layout?.id ? projectedById.get(layout.id) : null;
      if (layout && box) {
        stroke.points = projectElementPoints(stroke.points, layout, box, {
          canvasWidth: this.canvasWidth(),
          canvasHeight: this.canvasHeight()
        });
        const metrics = scaleElementMetrics(layout.metrics, box);
        if (metrics.width) {
          stroke.width = metrics.width;
        }
        if (isTextLikeStroke(stroke) && metrics.fontSize) {
          stroke.fontSize = metrics.fontSize;
        }
        if (isTextStroke(stroke)) {
          stroke.textWidth = metrics.textWidth || null;
        }
        if ((isTextLikeStroke(stroke) || isEmbedStroke(stroke)) && metrics.previewWidth && metrics.previewHeight) {
          stroke.previewWidth = metrics.previewWidth;
          stroke.previewHeight = metrics.previewHeight;
        }
      } else {
        stroke.points = stroke.points.map((point) => projectResponsivePoint(point, {
          canvasWidth: this.canvasWidth(),
          canvasHeight: this.canvasHeight(),
          frame: context.frame,
          lineToCanvasY
        }));
      }
    }
    this.syncBoundConnectors({ recover: true });
    if (this.currentStroke?.points?.length) {
      this.currentStroke.points = this.currentStroke.points.map((point) => projectResponsivePoint(point, {
        canvasWidth: this.canvasWidth(),
        canvasHeight: this.canvasHeight(),
        frame: context.frame,
        lineToCanvasY
      }));
    }
    this.responsivePointsInitialized = true;
    this.responsiveLayoutSignature = signature;
    this.responsiveProjectionPending = null;
    return true;
  }
  resizeCanvas(options = {}) {
    this.refreshScrollContainer();
    const previousCanvasWidth = this.canvasCssWidth;
    const previousCanvasHeight = this.canvasCssHeight;
    const initialMeasure = this.canvasCssWidth <= 1 || this.canvasCssHeight <= 1;
    const interactionActive = this.isReadingZoomInteractionActive();
    const refreshGeometry = options.measure !== false && !interactionActive || initialMeasure;
    const refreshLayout = options.layout === true && !interactionActive;
    const visualScale = this.readingZoomScale();
    let measured;
    let width;
    let height;
    if (refreshGeometry) {
      this.layoutMeasureEl = findLayoutMeasureElement(this.previewEl);
      measured = measureCanvasExtent(this.previewEl, this.layoutMeasureEl, visualScale);
      width = Math.max(1, Math.round(measured.width));
      const measuredHeight = Math.max(1, Math.round(measured.height));
      const extentFrame = measureResponsiveContentFrame(this.previewEl, this.surfaceType, width, this.canvas, visualScale);
      height = this.drawingsLoaded
        ? estimateStableElementLayoutExtent((this.drawingData?.strokes || []).map((stroke) => stroke.layout), {
          canvasWidth: width,
          frame: extentFrame,
          minHeight: measuredHeight
        })
        : measuredHeight;
    } else {
      width = this.canvasCssWidth;
      height = this.canvasCssHeight;
      measured = { visibleWidth: Math.max(1, this.previewEl.getBoundingClientRect?.().width || width) };
    }
    const visible = measureVisibleSurfaceWindow(this.previewEl, this.scrollContainer, height, visualScale);
    const isMobile = isMobileRuntime();
    const devicePixelRatio = window.devicePixelRatio || 1;
    const maxDevicePixelRatio = isMobile ? 4 : 3;
    const maxPixels = isMobile ? 6 * 1024 * 1024 : 16 * 1024 * 1024;
    const maxWindowHeight = calculateQualityWindowLimit({
      cssWidth: width,
      viewportHeight: visible.height,
      devicePixelRatio,
      maxDevicePixelRatio,
      maxPixels
    });
    // A whole-note bitmap can exhaust mobile GPU memory on long notes.
    const canvasWindow = calculateCanvasWindow({
      documentHeight: height,
      viewportTop: visible.top,
      viewportHeight: visible.height,
      previousTop: this.canvasWindowTop,
      previousHeight: this.canvasRenderHeight,
      minWindowHeight: calculateZoomAwareWindowFloor({ visualScale }),
      maxWindowHeight
    });
    const backingStore = calculateCanvasBackingStore({
      cssWidth: width,
      cssHeight: canvasWindow.height,
      devicePixelRatio,
      maxDevicePixelRatio,
      maxDimension: isMobile ? 8192 : 16384,
      maxPixels
    });
    const geometryChanged = width !== this.canvasCssWidth || height !== this.canvasCssHeight || canvasWindow.changed || Math.abs(backingStore.scale - this.canvasBackingScale) > 1e-6;
    const layerBacking = this.drawingsVisible && this.drawingsLoaded ? backingStore : { width: 1, height: 1, scale: 1 };
    const activeBacking = this.drawingsVisible && this.drawingsLoaded && this.active ? backingStore : { width: 1, height: 1, scale: 1 };
    const backingStoreChanged = this.canvas.width !== activeBacking.width
      || this.canvas.height !== activeBacking.height
      || this.underlayCanvas.width !== layerBacking.width
      || this.underlayCanvas.height !== layerBacking.height
      || this.staticCanvas.width !== layerBacking.width
      || this.staticCanvas.height !== layerBacking.height;
    this.canvasCssWidth = width;
    this.canvasCssHeight = height;
    this.canvasWindowTop = canvasWindow.top;
    this.canvasRenderHeight = canvasWindow.height;
    this.canvasBackingScale = backingStore.scale;
    if (options.preserveAbsolutePlacement === true && previousCanvasWidth > 1 && previousCanvasHeight > 1) {
      this.preserveAbsoluteStrokePlacement(previousCanvasWidth, previousCanvasHeight);
    }
    applyElementStyles(this.embedLayer, {
      width: `${width}px`,
      height: `${height}px`
    });
    applyElementStyles(this.underlayEmbedLayer, {
      width: `${width}px`,
      height: `${height}px`
    });
    for (const canvas of [this.underlayCanvas, this.staticCanvas, this.canvas]) {
      applyElementStyles(canvas, {
        top: `${canvasWindow.top}px`,
        width: `${width}px`,
        height: `${canvasWindow.height}px`
      });
    }
    if (this.canvas.width !== activeBacking.width || this.canvas.height !== activeBacking.height) {
      this.canvas.width = activeBacking.width;
      this.canvas.height = activeBacking.height;
    }
    this.ctx = this.canvas.getContext("2d");
    if (!this.ctx) {
      return false;
    }
    this.ctx.setTransform(activeBacking.scale, 0, 0, activeBacking.scale, 0, -canvasWindow.top * activeBacking.scale);
    if (this.underlayCanvas.width !== layerBacking.width || this.underlayCanvas.height !== layerBacking.height) {
      this.underlayCanvas.width = layerBacking.width;
      this.underlayCanvas.height = layerBacking.height;
      this.underlayCtx = this.underlayCanvas.getContext("2d");
    }
    if (!this.underlayCtx) {
      this.underlayCtx = this.underlayCanvas.getContext("2d");
    }
    if (!this.underlayCtx) {
      return false;
    }
    this.underlayCtx.setTransform(layerBacking.scale, 0, 0, layerBacking.scale, 0, -canvasWindow.top * layerBacking.scale);
    if (this.staticCanvas.width !== layerBacking.width || this.staticCanvas.height !== layerBacking.height) {
      this.staticCanvas.width = layerBacking.width;
      this.staticCanvas.height = layerBacking.height;
      this.staticCtx = this.staticCanvas.getContext("2d");
    }
    if (!this.staticCtx) {
      this.staticCtx = this.staticCanvas.getContext("2d");
    }
    if (!this.staticCtx) {
      return false;
    }
    this.staticCtx.setTransform(layerBacking.scale, 0, 0, layerBacking.scale, 0, -canvasWindow.top * layerBacking.scale);
    if (this.drawingsLoaded && refreshLayout) {
      const frame = this.getResponsiveContentFrame();
      const viewportHeight = measureResponsiveViewportHeight(this.previewEl, this.scrollContainer, this.responsiveViewportScale());
      const signature = responsiveLayoutSignature(width, height, frame, this.surfaceType, viewportHeight);
      if (!this.responsivePointsInitialized || signature !== this.responsiveLayoutSignature) {
        this.responsiveLayoutContext = null;
        const context = this.getResponsiveLayoutContext(true);
        this.initializeAndProjectResponsivePoints(context, signature, {
          preserveNoteFlowAbsolute: options.preserveNoteFlowAbsolute === true && previousCanvasWidth > 1 && previousCanvasHeight > 1,
          previousCanvasWidth,
          previousCanvasHeight
        });
      } else if (this.responsiveProjectionPending) {
        this.preserveAbsoluteStrokePlacement(previousCanvasWidth, previousCanvasHeight);
        this.responsiveProjectionPending = null;
        this.cancelResponsiveProjectionSettle();
      }
    }
    if (geometryChanged || backingStoreChanged) {
      this.invalidateStaticCache();
    }
    if (measured.visibleWidth > 0) {
      for (const canvas of [this.underlayCanvas, this.staticCanvas, this.canvas]) {
        applyElementStyles(canvas, { minWidth: `${Math.round(measured.visibleWidth)}px` });
      }
    }
    this.updateReadingZoomExtent(visualScale, this.readingZoomTarget);
    this.previewEl.addClass("has-notedraw-canvas");
    return geometryChanged || backingStoreChanged;
  }
  onPointerDown(event, routed = false) {
    if (!this.active || event.button !== 0) {
      return;
    }
    let ownedBlankSpaceStrokeIndex = -1;
    if (!routed) {
      this.plugin.setInteractionController(this);
      const ownPoint = this.eventToPoint(event);
      if (this.toolMode === TOOL_SELECT) {
        ownedBlankSpaceStrokeIndex = this.findOwnedBlankSpaceStrokeAtClientPoint(event.clientX, event.clientY);
      }
      if (this.findStrokeAt(ownPoint, { x: event.clientX, y: event.clientY }) < 0 && ownedBlankSpaceStrokeIndex < 0) {
        const embeddedController = this.plugin.findEmbeddedStrokeControllerAtPoint(this, event);
        if (embeddedController) {
          this.routedPointerController = embeddedController;
          embeddedController.routedPointerHost = this;
          this.activePointerId = event.pointerId;
          try {
            this.canvas.setPointerCapture(event.pointerId);
          } catch (error) {
            void error;
          }
          embeddedController.onPointerDown(event, true);
          return;
        }
      }
    }
    if (this.shouldPassThroughHeaderPoint(event)) {
      return;
    }
    if (event.pointerType === "touch") {
      if (event.isPrimary && this.touchPointers.size && !this.pointerDown && this.activePointerId === null) {
        this.resetTouchGestureState();
      }
      this.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.suppressTouchDrawing || this.touchPointers.size >= 2) {
        this.startMultiTouchScroll(event);
        return;
      }
    }
    const target = this.elementBelowCanvas(event.clientX, event.clientY);
    const canEditMarkdownText = this.toolMode === TOOL_EDIT_MD;
    const clientPoint = { x: event.clientX, y: event.clientY };
    const editableCandidate = canEditMarkdownText ? findEditableTarget(target, this.previewEl, clientPoint) : null;
    const markdownSelectionCandidate = this.toolMode === TOOL_SELECT ? this.markdownBlockElementForTarget(target, clientPoint) : null;
    const selectedMarkdownEditableCandidate = markdownSelectionCandidate
      ? findEditableTarget(markdownSelectionCandidate, this.previewEl, clientPoint)
      : null;
    const editableFile = editableCandidate ? this.plugin.resolveEditableFile(editableCandidate, this.file) : null;
    const editsEmbeddedFile = Boolean(editableFile?.path && editableFile.path !== this.file?.path);
    const editable = editableCandidate && (this.allowTextEdit || editsEmbeddedFile) ? editableCandidate : null;
    const sourceTextTarget = this.surfaceType === "source" && canEditMarkdownText && isSourceTextTarget(target, this.previewEl);
    const point = this.eventToPoint(event);
    const noteFlowPenActive = this.isNoteFlowPenActive();
    if (noteFlowPenActive && this.hasHybridSelection()) {
      this.clearSelectedStrokes();
    }
    let hitStrokeIndex = noteFlowPenActive ? -1 : this.findStrokeAt(point, clientPoint);
    if (markdownSelectionCandidate && hitStrokeIndex >= 0 && shouldPlaceStrokeBelowMarkdown(this.drawingData.strokes[hitStrokeIndex])) {
      hitStrokeIndex = -1;
    }
    const markdownSelectionRecord = markdownSelectionCandidate
      ? this.findMarkdownBlockRecordForElement(markdownSelectionCandidate)
      : null;
    const markdownCandidateSelected = Boolean(markdownSelectionRecord && this.selectedMarkdownBlockIds.has(markdownSelectionRecord.id));
    let resizeHandle = noteFlowPenActive ? null : this.findSelectionHandleAt(point);
    if (markdownSelectionCandidate && !markdownCandidateSelected && hitStrokeIndex < 0) {
      resizeHandle = null;
    }
    if (this.toolMode === TOOL_SELECT && hitStrokeIndex < 0 && !resizeHandle && !markdownSelectionCandidate) {
      hitStrokeIndex = ownedBlankSpaceStrokeIndex >= 0
        ? ownedBlankSpaceStrokeIndex
        : this.findOwnedBlankSpaceStrokeAtClientPoint(event.clientX, event.clientY);
    }
    const hadSelection = this.hasHybridSelection();
    const selectedDrawGesture = resolveSelectedDrawGesture({
      toolMode: this.toolMode,
      hasSelection: hadSelection,
      hitStrokeIndex,
      insideSelectionFrame: this.selectedStrokeFrameContains(point)
    });
    if (this.toolMode === TOOL_TEXT && this.textPreset === "arrow") {
      this.startConnectorGesture(event, point, routed);
      return;
    }
    if (resizeHandle) {
      this.startSelectedStrokeResize(event, resizeHandle);
      return;
    }
    if (canEditMarkdownText) {
      this.currentStroke = null;
      this.pointerDown = false;
      this.pointerStartEditable = null;
      this.clearSelectedStrokes();
      if (editable) {
        this.startTextEdit(editable, { x: event.clientX, y: event.clientY });
      } else if (sourceTextTarget) {
        this.endTextEdit();
        this.focusSourceEditorAt({ x: event.clientX, y: event.clientY });
      } else {
        this.endTextEdit();
        this.render();
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (hitStrokeIndex >= 0 && isTextLikeStroke(this.drawingData.strokes[hitStrokeIndex])) {
      const repeatedSelectionTap = this.toolMode === TOOL_SELECT && this.isRepeatTextTap(hitStrokeIndex, point, event);
      if (event.detail >= 2 || repeatedSelectionTap) {
        this.editFloatingTextStroke(hitStrokeIndex);
        this.lastTextTap = null;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (this.toolMode === TOOL_SELECT) {
        this.rememberTextTap(hitStrokeIndex, point, event);
      }
    }
    if (this.toolMode === TOOL_SELECT && hitStrokeIndex >= 0) {
      const additiveSelect = event.shiftKey || event.ctrlKey || event.metaKey;
      const hitGroupId = this.drawingData.strokes[hitStrokeIndex]?.groupId || "";
      if (!additiveSelect && hitGroupId && this.isElementGroupFullySelected(hitGroupId) && !this.enteredElementGroupIds.has(hitGroupId)) {
        this.startPendingSelectionTap(event, {
          type: "enter-stroke-group",
          index: hitStrokeIndex,
          groupId: hitGroupId
        });
        return;
      }
      if (additiveSelect) {
        this.startPendingSelectionTap(event, { type: "toggle-stroke", index: hitStrokeIndex });
        return;
      }
      const wasSelected = this.isStrokeSelected(hitStrokeIndex);
      if (!wasSelected) {
        this.startPendingSelectionTap(event, { type: "select-stroke", index: hitStrokeIndex });
        return;
      }
      const preserveGroupSelection = Boolean(hitGroupId && this.isElementGroupFullySelected(hitGroupId));
      if (!additiveSelect && isTextLikeStroke(this.drawingData.strokes[hitStrokeIndex])) {
        this.startPendingSelectionTap(event, {
          type: "edit-stroke-or-drag",
          index: hitStrokeIndex,
          preserveSelection: preserveGroupSelection
        });
        return;
      }
      this.startSelectedStrokeDrag(event, point, hitStrokeIndex, { preserveSelection: preserveGroupSelection });
      return;
    }
    if (this.toolMode === TOOL_SELECT && hitStrokeIndex < 0 && markdownSelectionCandidate) {
      const additiveSelect = event.shiftKey || event.ctrlKey || event.metaKey;
      const existing = markdownSelectionRecord;
      const wasSelected = Boolean(existing && this.selectedMarkdownBlockIds.has(existing.id));
      const hitGroupId = existing?.groupId || "";
      if (!additiveSelect && hitGroupId && this.isElementGroupFullySelected(hitGroupId) && !this.enteredElementGroupIds.has(hitGroupId)) {
        this.startPendingSelectionTap(event, {
          type: "enter-markdown-group",
          element: markdownSelectionCandidate,
          groupId: hitGroupId
        });
        return;
      }
      if (additiveSelect) {
        this.startPendingSelectionTap(event, {
          type: "toggle-markdown",
          element: markdownSelectionCandidate
        });
        return;
      } else if (!wasSelected) {
        this.startPendingSelectionTap(event, {
          type: "select-markdown",
          element: markdownSelectionCandidate
        });
        return;
      }
      if (!additiveSelect && selectedMarkdownEditableCandidate) {
        this.startPendingSelectionTap(event, {
          type: "edit-markdown-or-drag",
          element: markdownSelectionCandidate,
          editable: selectedMarkdownEditableCandidate,
          preserveSelection: Boolean(hitGroupId && this.isElementGroupFullySelected(hitGroupId))
        });
        return;
      }
      this.startSelectedStrokeDrag(event, point, -1, { preserveSelection: additiveSelect });
      return;
    }
    if (this.toolMode === TOOL_SELECT && hitStrokeIndex < 0 && !markdownSelectionCandidate) {
      const boxedGroup = this.findBoxedElementGroupAtPoint(point);
      if (boxedGroup) {
        if (!this.isElementGroupFullySelected(boxedGroup.id)) {
          this.startPendingSelectionTap(event, {
            type: "select-group",
            groupId: boxedGroup.id
          });
          return;
        }
        this.startSelectedStrokeDrag(event, point);
        return;
      }
    }
    if (selectedDrawGesture === SELECTED_DRAW_GESTURE_MANIPULATE && hitStrokeIndex >= 0 && !this.isStrokeSelected(hitStrokeIndex)) {
      this.setSelectedStrokes(hitStrokeIndex);
      this.startSelectedStrokeDrag(event, point, hitStrokeIndex);
      return;
    }
    if (this.hasHybridSelection() && !this.selectedStrokeFrameContains(point) && hitStrokeIndex < 0) {
      if (selectedDrawGesture !== SELECTED_DRAW_GESTURE_DRAW_OR_DESELECT) {
        this.clearSelectedStrokes();
        if (!editable && this.toolMode !== TOOL_SELECT && this.toolMode !== TOOL_TEXT) {
          this.render();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }
    }
    if (hitStrokeIndex >= 0 && isTextLikeStroke(this.drawingData.strokes[hitStrokeIndex]) && event.detail >= 2) {
      this.editFloatingTextStroke(hitStrokeIndex, point);
      this.lastTextTap = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (hitStrokeIndex >= 0 && isTextLikeStroke(this.drawingData.strokes[hitStrokeIndex]) && this.toolMode === TOOL_TEXT) {
      if (this.isRepeatTextTap(hitStrokeIndex, point, event)) {
        this.editFloatingTextStroke(hitStrokeIndex, point);
        this.lastTextTap = null;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      this.rememberTextTap(hitStrokeIndex, point, event);
      if (this.isStrokeSelected(hitStrokeIndex)) {
        this.startSelectedStrokeDrag(event, point, hitStrokeIndex);
        return;
      }
      this.setSelectedStrokes(hitStrokeIndex);
      this.render();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const selectedTextIndex = this.getSelectedStrokeIndexes().find((index) => isTextLikeStroke(this.drawingData.strokes[index]));
    if (event.detail >= 2 && selectedTextIndex >= 0 && this.selectedStrokeFrameContains(point)) {
      this.editFloatingTextStroke(selectedTextIndex, point);
      this.lastTextTap = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.selectedStrokeFrameContains(point)) {
      this.startSelectedStrokeDrag(event, point, hitStrokeIndex);
      return;
    }
    if (this.toolMode === TOOL_SELECT) {
      this.startSelectionDrag(event, point);
      return;
    }
    this.startedOnText = Boolean(editable);
    this.pointerDown = true;
    this.didMove = false;
    this.pointerStartClient = { x: event.clientX, y: event.clientY };
    this.pointerStartPoint = point;
    this.pointerStartEditable = editable;
    this.pointerStartSourceText = sourceTextTarget;
    this.activePointerId = event.pointerId;
    if (!editable) {
      this.endTextEdit();
    }
    if (!routed) {
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        void error;
      }
    }
    if (this.toolMode === TOOL_TEXT) {
      this.currentStroke = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const brush = this.currentBrushSettings();
    this.currentStroke = {
      brush: this.brushMode,
      variant: this.currentBrushVariant(),
      color: brush.color,
      width: brush.width,
      opacity: brush.opacity,
      count: brush.count,
      noteFlow: this.currentBrushVariant() === PEN_VARIANT_NOTE && this.supportsNoteFlow() ? {
        enabled: true,
        path: this.file?.path || "",
        line: null,
        side: null,
        positionBasis: null,
        positionPath: this.file?.path || "",
        positionLine: null,
        gap: 12
      } : null,
      belowMarkdown: this.currentBrushVariant() === PEN_VARIANT_NOTE && this.supportsNoteFlow(),
      points: [this.pointerStartPoint]
    };
    if (this.isTextHighlightStroke(this.currentStroke)) {
      this.prepareTextHighlightGesture({ x: event.clientX, y: event.clientY });
    }
    event.preventDefault();
    event.stopPropagation();
  }
  startConnectorGesture(event, point, routed = false) {
    this.endFloatingTextInput(true);
    this.endTextEdit();
    this.clearSelectedStrokes();
    this.ensureSnapElementIds();
    const snapTargets = this.collectSnapTargets();
    const snapBoundsById = new Map(snapTargets.map((target) => [target.id, target.bounds]));
    this.pointerDown = true;
    this.didMove = false;
    this.pointerStartPoint = { ...point };
    this.pointerStartClient = { x: event.clientX, y: event.clientY };
    this.pointerStartEditable = null;
    this.pointerStartSourceText = false;
    this.activePointerId = event.pointerId;
    const fromId = this.findSnapElementIdAtPoint(point, "", snapTargets);
    const brush = this.currentBrushSettings();
    this.connectorGesture = {
      fromId,
      snapTargets,
      snapBoundsById,
      historyBefore: this.captureDrawingHistorySnapshot()
    };
    this.currentStroke = {
      elementId: createElementLayoutId(this.drawingData.strokes.length),
      brush: BRUSH_PEN,
      color: brush.color || this.penColor,
      width: clamp(Number(brush.width || 2.5), 1, 8),
      opacity: clamp(Number(brush.opacity ?? 0.9), 0, 1),
      count: 1,
      connector: { kind: "connector", fromId, toId: "", style: "curve", arrow: true },
      points: buildFreeConnectorPoints(point, point, this.canvasWidth(), this.canvasHeight())
    };
    if (!routed) {
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch (error) {
        void error;
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }
  updateConnectorGesture(event) {
    const endPoint = this.eventToPoint(event);
    const movedDistance = this.pointerStartClient ? pointerDistance(this.pointerStartClient, { x: event.clientX, y: event.clientY }) : 0;
    this.didMove = movedDistance > this.tapDistancePx();
    if (this.currentStroke && this.pointerStartPoint) {
      const snapTargets = this.connectorGesture?.snapTargets;
      const fromId = this.connectorGesture?.fromId || this.findSnapElementIdAtPoint(this.pointerStartPoint, "", snapTargets);
      let toId = this.findSnapElementIdAtPoint(endPoint, fromId, snapTargets);
      if (toId === fromId) {
        toId = "";
      }
      this.connectorGesture.fromId = fromId;
      this.connectorGesture.toId = toId;
      this.currentStroke.connector = { kind: "connector", fromId, toId, style: "curve", arrow: true };
      this.currentStroke.points = this.buildConnectorPointsForBindings(fromId, toId, this.pointerStartPoint, endPoint, this.connectorGesture?.snapBoundsById);
      this.requestRender();
    }
    event.preventDefault();
    event.stopPropagation();
  }
  finishConnectorGesture(event) {
    const startPoint = this.pointerStartPoint || this.eventToPoint(event);
    let endPoint = this.eventToPoint(event);
    if (!this.didMove) {
      endPoint = {
        ...startPoint,
        x: clamp(startPoint.x + Math.min(0.22, 96 / this.canvasWidth()), 0, 1),
        t: Date.now(),
        anchor: null
      };
    }
    const snapTargets = this.connectorGesture?.snapTargets;
    const fromId = this.connectorGesture?.fromId || this.findSnapElementIdAtPoint(startPoint, "", snapTargets);
    let toId = this.connectorGesture?.toId || this.findSnapElementIdAtPoint(endPoint, fromId, snapTargets);
    if (toId === fromId) {
      toId = "";
    }
    const stroke = normalizeStroke({
      ...this.currentStroke,
      connector: { kind: "connector", fromId, toId, style: "curve", arrow: true },
      points: this.buildConnectorPointsForBindings(fromId, toId, startPoint, endPoint, this.connectorGesture?.snapBoundsById)
    });
    this.drawingData.strokes.push(stroke);
    const insertedIndex = this.drawingData.strokes.length - 1;
    this.syncBoundConnectors();
    this.setSelectedStrokes(insertedIndex);
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(this.connectorGesture?.historyBefore);
    this.currentStroke = null;
    this.connectorGesture = null;
    this.pointerDown = false;
    this.finishPointerInteraction(event);
  }
  findSnapElementIdAtPoint(point, excludeId = "", targets = null) {
    const canvasPoint = this.pointToCanvas(point);
    const threshold = connectorSnapThreshold(this.selectionHitPaddingPx());
    let best = null;
    const candidates = Array.isArray(targets) ? targets : this.collectSnapTargets();
    for (const target of candidates) {
      if (target.id === excludeId) {
        continue;
      }
      const dx = Math.max(target.bounds.minX - canvasPoint.x, 0, canvasPoint.x - target.bounds.maxX);
      const dy = Math.max(target.bounds.minY - canvasPoint.y, 0, canvasPoint.y - target.bounds.maxY);
      const distance = Math.hypot(dx, dy);
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { id: target.id, distance };
      }
    }
    return best?.id || "";
  }
  collectSnapTargets() {
    const targets = [];
    for (let index = (this.drawingData?.strokes?.length || 0) - 1; index >= 0; index -= 1) {
      const stroke = this.drawingData.strokes[index];
      const id = strokeElementId(stroke);
      if (!id || isConnectorStroke(stroke) || !isSnapStroke(stroke)) {
        continue;
      }
      const bounds = getStrokeBounds(stroke, this.canvasWidth(), this.canvasHeight());
      if (bounds) {
        targets.push({ id, bounds });
      }
    }
    return targets;
  }
  ensureSnapElementIds() {
    const strokes = this.drawingData?.strokes || [];
    const idCounts = new Map();
    for (const stroke of strokes) {
      const id = strokeElementId(stroke);
      if (id) {
        idCounts.set(id, (idCounts.get(id) || 0) + 1);
      }
    }
    const occupied = new Set(idCounts.keys());
    let changed = false;
    for (const [index, stroke] of strokes.entries()) {
      if (!stroke || isConnectorStroke(stroke) || !isSnapStroke(stroke)) {
        continue;
      }
      const existingId = strokeElementId(stroke);
      let elementId = existingId;
      if (!elementId || (idCounts.get(elementId) || 0) > 1) {
        do {
          elementId = createElementLayoutId(index);
        } while (occupied.has(elementId));
        occupied.add(elementId);
      }
      if (stroke.elementId !== elementId) {
        stroke.elementId = elementId;
        changed = true;
      }
      const layout = normalizeElementLayout(stroke.layout);
      if (layout && layout.id !== elementId) {
        stroke.layout = { ...layout, id: elementId };
        changed = true;
      }
    }
    return changed;
  }
  buildConnectorPointsForBindings(fromId, toId, fromPoint, toPoint, boundsById = null) {
    const resolvedBounds = boundsById || new Map(this.collectSnapTargets().map((target) => [target.id, target.bounds]));
    return buildSnappedConnectorPoints({
      fromBounds: fromId ? resolvedBounds.get(fromId) || null : null,
      toBounds: toId ? resolvedBounds.get(toId) || null : null,
      fromPoint,
      toPoint,
      canvasWidth: this.canvasWidth(),
      canvasHeight: this.canvasHeight()
    });
  }
  shouldPassThroughHeaderPoint(event) {
    if (this.surfaceType !== "preview" || !isAppleMobileRuntime()) {
      return false;
    }
    const header = this.view?.containerEl?.querySelector?.(".view-header") || this.button?.closest?.(".view-header");
    const headerRect = header?.getBoundingClientRect?.();
    if (!headerRect || event.clientY > headerRect.bottom + 4) {
      return false;
    }
    const target = this.elementBelowCanvas(event.clientX, event.clientY);
    const noteDrawButton = target?.closest?.(".notedraw-header-button, .notedraw-fallback-button, .notedraw-webview-button");
    this.toggle().catch((error) => {
      console.error(`[${PLUGIN_ID}] Failed to toggle NoteDraw`, error);
    });
    if (!noteDrawButton) {
      dispatchMouseClickThroughOverlay(this.canvas, { x: event.clientX, y: event.clientY });
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  elementBelowCanvas(clientX, clientY) {
    const previous = this.canvas.style.pointerEvents;
    applyElementStyles(this.canvas, { pointerEvents: "none" });
    const target = activeDocument.elementFromPoint(clientX, clientY);
    applyElementStyles(this.canvas, { pointerEvents: previous || "" });
    return target;
  }
  onPointerMove(event) {
    if (this.routedPointerController && event.pointerId === this.activePointerId) {
      this.routedPointerController.onPointerMove(event);
      return;
    }
    if (event.pointerType === "touch" && this.touchPointers.has(event.pointerId)) {
      this.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.multiTouchScrolling) {
        this.handleMultiTouchScroll(event);
        return;
      }
    }
    if (this.draggingStroke && event.pointerId === this.activePointerId) {
      this.moveSelectedStroke(event);
      return;
    }
    if (this.pendingSelectionTap && event.pointerId === this.activePointerId) {
      this.updatePendingSelectionTap(event);
      return;
    }
    if (this.resizingSelection && event.pointerId === this.activePointerId) {
      this.moveSelectedStrokeResize(event);
      return;
    }
    if (this.selectingStrokes && event.pointerId === this.activePointerId) {
      this.updateSelectionDrag(event);
      return;
    }
    if (this.connectorGesture && event.pointerId === this.activePointerId) {
      this.updateConnectorGesture(event);
      return;
    }
    if (!this.active || !this.pointerDown || event.pointerId !== this.activePointerId) {
      return;
    }
    if (this.toolMode === TOOL_TEXT && !this.currentStroke) {
      const movedDistance = this.pointerStartClient ? pointerDistance(this.pointerStartClient, { x: event.clientX, y: event.clientY }) : 0;
      this.didMove = movedDistance > this.tapDistancePx();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!this.currentStroke) {
      return;
    }
    const wasDrawing = this.didMove;
    this.addPointerSamples(event);
    if (this.didMove && !wasDrawing) {
      this.endTextEdit();
      this.clearSelectedStrokes();
      if (this.currentStroke.noteFlow?.enabled) {
        this.noteFlowOperationPending = true;
        this.scheduleMarkdownAnnotationRefresh({ layout: false });
      }
    }
    if (this.didMove) {
      this.requestRender();
    }
    event.preventDefault();
    event.stopPropagation();
  }
  onPointerUp(event) {
    if (this.routedPointerHost) {
      this.routedPointerHost.routedPointerController = null;
      this.routedPointerHost.activePointerId = null;
      this.routedPointerHost = null;
    }
    if (this.routedPointerController && event.pointerId === this.activePointerId) {
      const routedController = this.routedPointerController;
      this.routedPointerController = null;
      routedController.onPointerUp(event);
      this.activePointerId = null;
      try {
        if (this.canvas.hasPointerCapture?.(event.pointerId)) {
          this.canvas.releasePointerCapture(event.pointerId);
        }
      } catch (error) {
        void error;
      }
      return;
    }
    if (event.type === "lostpointercapture" && this.multiTouchScrolling) {
      return;
    }
    if (event.pointerType === "touch") {
      this.completeTrackedTouch(event.pointerId);
      if (this.multiTouchScrolling || this.suppressTouchDrawing) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (this.draggingStroke && event.pointerId === this.activePointerId) {
      this.finishSelectedStrokeDrag(event);
      return;
    }
    if (this.pendingSelectionTap && event.pointerId === this.activePointerId) {
      if (event.type !== "pointerup") {
        this.cancelPendingSelectionTap();
      } else {
        this.finishPendingSelectionTap(event);
      }
      return;
    }
    if (this.resizingSelection && event.pointerId === this.activePointerId) {
      this.finishSelectedStrokeResize(event);
      return;
    }
    if (this.selectingStrokes && event.pointerId === this.activePointerId) {
      this.finishSelectionDrag(event);
      return;
    }
    if (this.connectorGesture && event.pointerId === this.activePointerId) {
      this.finishConnectorGesture(event);
      return;
    }
    if (!this.active || !this.pointerDown || event.pointerId !== this.activePointerId) {
      return;
    }
    this.pointerDown = false;
    const movedDistance = this.pointerStartClient ? pointerDistance(this.pointerStartClient, { x: event.clientX, y: event.clientY }) : 0;
    const editable = this.pointerStartEditable;
    const canEditMarkdownText = this.toolMode === TOOL_EDIT_MD;
    if (this.toolMode === TOOL_TEXT && !this.currentStroke) {
      const point = this.pointerStartPoint || this.eventToPoint(event);
      if (movedDistance <= this.tapDistancePx() && !this.didMove) {
        this.handleTextToolTap(point);
      }
      this.finishPointerInteraction(event);
      return;
    }
    if (!this.currentStroke) {
      this.finishPointerInteraction(event);
      return;
    }
    this.addPointerSamples(event);
    if (!this.didMove || movedDistance <= this.tapDistancePx() || this.currentStroke.points.length < 2) {
      const point = this.pointerStartPoint || this.eventToPoint(event);
      this.currentStroke = null;
      if (editable && canEditMarkdownText) {
        this.startTextEdit(editable, this.pointerStartClient || { x: event.clientX, y: event.clientY });
      } else if (this.pointerStartSourceText && canEditMarkdownText) {
        this.focusSourceEditorAt(this.pointerStartClient || { x: event.clientX, y: event.clientY });
        this.clearSelectedStrokes();
      } else if (this.toolMode === TOOL_TEXT) {
        this.handleTextToolTap(point);
      } else if (this.isNoteFlowPenActive()) {
        this.clearSelectedStrokes();
      } else {
        this.setSelectedStrokes(this.findStrokeAt(point, { x: event.clientX, y: event.clientY }));
      }
    } else if (this.currentStroke.kind === TOOL_TEXT) {
      this.currentStroke = null;
    } else {
      const historyBefore = this.captureDrawingHistorySnapshot();
      this.finalizeBrushVariant(this.currentStroke);
      const responsiveContext = this.getResponsiveLayoutContext();
      this.currentStroke.points = this.currentStroke.points.map((point) => this.captureResponsivePoint(point, responsiveContext));
      this.drawingData.strokes.push(this.currentStroke);
      const insertedIndex = this.drawingData.strokes.length - 1;
      if (this.currentStroke.noteFlow?.enabled) {
        this.resetNoteFlowSettle();
        this.currentStroke.noteFlow = this.captureNoteFlowAnchor(this.currentStroke);
      }
      this.captureResponsiveAnchorsForIndexes([insertedIndex]);
      this.clearSelectedStrokes();
      this.redoStack = [];
      this.invalidateStaticCache();
      this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
      this.recordDrawingHistory(historyBefore);
      this.scheduleNoteFlowLayout({ operation: Boolean(this.currentStroke.noteFlow?.enabled) });
      this.currentStroke = null;
    }
    this.finishPointerInteraction(event);
  }
  finishPointerInteraction(event) {
    try {
      if (event && this.canvas.hasPointerCapture?.(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    } catch (error) {
      void error;
    }
    this.pointerStartPoint = null;
    this.pointerStartClient = null;
    this.pointerStartEditable = null;
    this.pointerStartSourceText = false;
    this.activePointerId = null;
    this.didMove = false;
    this.resetTextHighlightGesture();
    this.render();
    event?.preventDefault();
    event?.stopPropagation();
  }
  onCanvasDoubleClick(event) {
    if (!this.active || event.button !== 0) {
      return;
    }
    if (this.isNoteFlowPenActive()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const point = this.eventToPoint(event);
    const hitStrokeIndex = this.findStrokeAt(point, { x: event.clientX, y: event.clientY });
    if (hitStrokeIndex >= 0 && isTextLikeStroke(this.drawingData.strokes[hitStrokeIndex])) {
      this.editFloatingTextStroke(hitStrokeIndex, point);
      this.lastTextTap = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const selectedTextIndex = this.getSelectedStrokeIndexes().find((index) => isTextLikeStroke(this.drawingData.strokes[index]));
    if (selectedTextIndex >= 0 && this.selectedStrokeFrameContains(point)) {
      this.editFloatingTextStroke(selectedTextIndex, point);
      this.lastTextTap = null;
      event.preventDefault();
      event.stopPropagation();
    }
  }
  onPreviewDoubleClick(event) {
    if (!this.active || this.surfaceType !== "preview" || event.button !== 0) {
      return;
    }
    this.onCanvasDoubleClick(event);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }
  rememberTextTap(index, point, event) {
    this.lastTextTap = {
      index,
      point,
      time: Number(event?.timeStamp) || Date.now()
    };
  }
  isRepeatTextTap(index, point, event) {
    if (!this.lastTextTap || this.lastTextTap.index !== index) {
      return false;
    }
    const now = Number(event?.timeStamp) || Date.now();
    const elapsed = now - this.lastTextTap.time;
    if (elapsed < 0 || elapsed > 500) {
      return false;
    }
    const distance = pointDistanceOnCanvas(
      this.lastTextTap.point,
      point,
      this.canvasWidth(),
      this.canvasHeight()
    );
    return distance <= this.tapDistancePx() * 2;
  }
  floatingTextPointToClient(point) {
    const canvasPoint = this.pointToCanvas(point);
    const canvasRect = this.canvas.getBoundingClientRect();
    const scaleX = canvasRect.width > 0 ? canvasRect.width / this.canvasWidth() : 1;
    const scaleY = canvasRect.height > 0 ? canvasRect.height / Math.max(1, this.canvasRenderHeight) : 1;
    return {
      x: canvasRect.left + canvasPoint.x * scaleX,
      y: canvasRect.top + (canvasPoint.y - this.canvasWindowTop) * scaleY
    };
  }
  floatingTextEditorInsets(element) {
    const view = element?.ownerDocument?.defaultView || window;
    const style = view.getComputedStyle(element);
    const number = (property) => Number.parseFloat(style.getPropertyValue(property)) || 0;
    return {
      left: number("border-left-width") + number("padding-left"),
      top: number("border-top-width") + number("padding-top"),
      horizontal: number("border-left-width") + number("padding-left") + number("padding-right") + number("border-right-width"),
      vertical: number("border-top-width") + number("padding-top") + number("padding-bottom") + number("border-bottom-width")
    };
  }
  positionFloatingTextInput(state = this.floatingTextInput) {
    if (!state?.element?.isConnected || !state.point || !this.canvas?.isConnected) {
      return;
    }
    const textarea = state.element;
    const view = textarea.ownerDocument?.defaultView || window.activeWindow || window;
    const anchor = this.floatingTextPointToClient(state.point);
    const rect = textarea.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const viewport = view.visualViewport;
    const viewportLeft = viewport?.offsetLeft || 0;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportWidth = viewport?.width || view.innerWidth || 1;
    const viewportHeight = viewport?.height || view.innerHeight || 1;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const anchorVisible = anchor.x >= Math.max(viewportLeft, canvasRect.left) &&
      anchor.x <= Math.min(viewportRight, canvasRect.right) &&
      anchor.y >= Math.max(viewportTop, canvasRect.top) &&
      anchor.y <= Math.min(viewportBottom, canvasRect.bottom);
    const insets = this.floatingTextEditorInsets(textarea);
    const placement = placeFloatingTextEditor({
      anchorX: anchor.x,
      anchorY: anchor.y,
      width: rect.width,
      height: rect.height,
      viewportWidth,
      viewportHeight,
      viewportOffsetLeft: viewportLeft,
      viewportOffsetTop: viewportTop,
      contentInsetX: insets.left,
      contentInsetY: insets.top,
      margin: 8,
      anchorVisible
    });
    applyElementStyles(textarea, {
      left: `${Math.round(placement.left)}px`,
      top: `${Math.round(placement.top)}px`,
      width: `${Math.round(placement.width)}px`,
      height: `${Math.round(placement.height)}px`
    });
    state.centered = placement.centered;
    if (state.index < 0) {
      if (placement.centered) {
        const placedRect = textarea.getBoundingClientRect();
        state.commitPoint = this.eventToPoint({
          clientX: placedRect.left + insets.left,
          clientY: placedRect.top + insets.top
        });
      } else {
        state.commitPoint = { ...state.point };
      }
    }
  }
  floatingTextContentWidth(element) {
    const rect = element.getBoundingClientRect();
    const insets = this.floatingTextEditorInsets(element);
    return clamp(rect.width - insets.horizontal, 24, 900);
  }
  openFloatingTextInput(point, index = -1) {
    this.endFloatingTextInput(true);
    this.endTextEdit();
    const existing = index >= 0 ? this.drawingData.strokes[index] : null;
    const brushColor = this.currentBrushSettings().color || this.penColor;
    const preset = isTextLikeStroke(existing) ? existing : createTextPreset(this.textPreset, " ", brushColor);
    const editorDocument = this.canvas?.ownerDocument || this.previewEl?.ownerDocument || activeDocument;
    const editorWindow = editorDocument.defaultView || window.activeWindow || window;
    const textarea = editorDocument.body.createEl("textarea", {
      cls: "notedraw-floating-text-input",
      attr: {
        rows: "1",
        spellcheck: "true"
      }
    });
    textarea.value = isTextLikeStroke(existing) ? existing.text : "";
    applyElementStyles(textarea, {
      color: isTextLikeStroke(existing) ? existing.color : brushColor,
      fontSize: `${isTextLikeStroke(existing) ? clamp(Number(existing.fontSize || 18), 10, 72) : 18}px`,
      fontWeight: isTextLikeStroke(existing) && existing.bold ? "700" : "400",
      fontFamily: isTextLikeStroke(existing) && existing.code ? "monospace" : "sans-serif"
    });
    const preferredContentWidth = isRichTextStroke(existing)
      ? existing.previewWidth
      : Number(existing?.textWidth) > 0
        ? Number(existing.textWidth)
        : isRichTextStroke(preset) && Number(preset.previewWidth) > 0
          ? Number(preset.previewWidth)
          : null;
    const state = {
      element: textarea,
      point: { ...point, t: Date.now() },
      commitPoint: null,
      preferredContentWidth,
      index,
      committed: false,
      cancelled: false,
      composing: false,
      commitAfterComposition: false,
      centered: false
    };
    this.floatingTextInput = state;
    const resize = () => {
      if (!textarea.isConnected) {
        return;
      }
      const viewport = editorWindow.visualViewport;
      const maxWidth = Math.max(96, Math.min(520, (viewport?.width || editorWindow.innerWidth || 320) - 16));
      const maxHeight = Math.max(64, (viewport?.height || editorWindow.innerHeight || 480) - 16);
      const insets = this.floatingTextEditorInsets(textarea);
      applyElementStyles(textarea, { height: "auto", width: "auto", overflowY: "hidden" });
      const naturalWidth = textarea.scrollWidth + 2;
      const preferredWidth = Number(state.preferredContentWidth) > 0 ? Number(state.preferredContentWidth) + insets.horizontal : 0;
      const width = Math.min(maxWidth, Math.max(120, preferredWidth, naturalWidth));
      applyElementStyles(textarea, { width: `${Math.round(width)}px`, height: "auto" });
      const wantedHeight = Math.max(32, textarea.scrollHeight + 2);
      applyElementStyles(textarea, {
        height: `${Math.round(Math.min(maxHeight, wantedHeight))}px`,
        overflowY: wantedHeight > maxHeight ? "auto" : "hidden"
      });
      this.positionFloatingTextInput(state);
    };
    const commit = () => this.commitFloatingTextInput(state);
    const cancel = () => this.endFloatingTextInput(false, state);
    textarea.addEventListener("input", resize);
    textarea.addEventListener("compositionstart", () => {
      state.composing = true;
    });
    textarea.addEventListener("compositionend", () => {
      state.composing = false;
      resize();
      if (state.commitAfterComposition) {
        state.commitAfterComposition = false;
        editorWindow.setTimeout(commit, 0);
      }
    });
    textarea.addEventListener("blur", () => editorWindow.setTimeout(commit, 0));
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    });
    state.reposition = resize;
    editorWindow.addEventListener("resize", resize);
    editorWindow.visualViewport?.addEventListener("resize", resize);
    editorWindow.visualViewport?.addEventListener("scroll", resize);
    editorWindow.requestAnimationFrame(() => {
      resize();
      textarea.focus();
      textarea.select();
    });
  }
  commitFloatingTextInput(state = this.floatingTextInput) {
    if (!state || state.committed || state.cancelled) {
      return;
    }
    if (state.composing) {
      state.commitAfterComposition = true;
      return;
    }
    state.committed = true;
    const text = state.element.value.trim();
    if (!text) {
      this.endFloatingTextInput(false, state);
      return;
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    let mindMapStrokeToSync = null;
    if (state.index >= 0 && isTextLikeStroke(this.drawingData.strokes[state.index])) {
      const stroke = this.drawingData.strokes[state.index];
      const textChanged = stroke.text !== text;
      stroke.text = text;
      stroke.render = normalizeTextRenderMode(stroke.render);
      stroke.fontSize = clamp(Number(stroke.fontSize || 18), 10, 72);
      if (isRichTextStroke(stroke)) {
        stroke.previewWidth = stroke.previewWidth || 300;
        stroke.previewHeight = stroke.previewHeight || 180;
      } else {
        stroke.textWidth = this.floatingTextContentWidth(state.element);
      }
      this.setSelectedStrokes(state.index);
      if (textChanged && normalizeMindMapNode(stroke.mindMapNode)?.affectsSource) {
        mindMapStrokeToSync = stroke;
      }
    } else {
      const brush = this.currentBrushSettings();
      const preset = createTextPreset(this.textPreset, text, brush.color || this.penColor);
      const stroke = {
        kind: preset.kind || TOOL_TEXT,
        brush: BRUSH_PEN,
        color: preset.color,
        width: 3,
        opacity: 1,
        count: 1,
        text: preset.text,
        render: preset.render || TEXT_RENDER_PLAIN,
        fontSize: clamp(Number(preset.fontSize || 18), 10, 72),
        bold: preset.bold,
        code: preset.code,
        boxed: preset.boxed,
        file: preset.file,
        previewWidth: preset.previewWidth,
        previewHeight: preset.previewHeight,
        uiRole: preset.uiRole,
        buttonStyle: preset.buttonStyle,
        snap: preset.snap,
        locked: false,
        textWidth: normalizeTextRenderMode(preset.render) === TEXT_RENDER_PLAIN ? this.floatingTextContentWidth(state.element) : null,
        points: [{ ...(state.commitPoint || state.point), t: Date.now() }]
      };
      this.drawingData.strokes.push(stroke);
      this.setSelectedStrokes(this.drawingData.strokes.length - 1);
    }
    this.captureResponsiveAnchorsForIndexes(this.getSelectedStrokeIndexes());
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    if (mindMapStrokeToSync) {
      this.textCommitBarrier.track(this.syncMindMapNodeToSource(mindMapStrokeToSync, text, { drawingBefore: historyBefore }));
    } else {
      this.recordDrawingHistory(historyBefore);
    }
    this.scheduleLayoutRefresh({ settle: false });
    this.endFloatingTextInput(false, state);
    this.render();
    this.requestRender(true);
  }
  endFloatingTextInput(commit = true, state = this.floatingTextInput) {
    if (!state) {
      return;
    }
    if (commit && !state.committed) {
      if (state.composing) {
        state.composing = false;
        state.commitAfterComposition = false;
      }
      this.commitFloatingTextInput(state);
      return;
    }
    if (!commit && !state.committed) {
      state.cancelled = true;
    }
    const view = state.element?.ownerDocument?.defaultView;
    if (view && state.reposition) {
      view.removeEventListener("resize", state.reposition);
      view.visualViewport?.removeEventListener("resize", state.reposition);
      view.visualViewport?.removeEventListener("scroll", state.reposition);
    }
    state.element?.remove();
    if (this.floatingTextInput === state) {
      this.floatingTextInput = null;
    }
  }
  editFloatingTextStroke(index) {
    const stroke = this.drawingData.strokes[index];
    if (!isTextLikeStroke(stroke) || stroke.locked) {
      return;
    }
    this.setSelectedStrokes(index);
    this.openFloatingTextInput(stroke.points[0], index);
  }
  handleTextToolTap(point) {
    const snappedPoint = this.snapPointForPreset(point, this.textPreset);
    if (this.textPreset === "mindMap") {
      if (!this.pendingMindMapFile) {
        this.openMindMapFilePicker();
        return;
      }
      const sourceFile = this.pendingMindMapFile;
      const options = this.pendingMindMapOptions || { affectsSource: this.plugin.noteDrawSettings?.mindMapAffectsSource !== false };
      this.pendingMindMapFile = null;
      this.pendingMindMapOptions = null;
      void this.insertMindMapAt(snappedPoint, sourceFile, options);
      return;
    }
    if (isAssetTextPreset(this.textPreset)) {
      this.pendingEmbedTool = { preset: this.textPreset, point: snappedPoint };
      if (this.hiddenFileInput) {
        this.hiddenFileInput.accept = filePickerAcceptForPreset(this.textPreset);
        this.hiddenFileInput.click();
      }
      return;
    }
    const instantText = instantTextForPreset(this.textPreset);
    if (instantText) {
      this.insertTextPresetAt(snappedPoint, this.textPreset, instantText);
      return;
    }
    this.openFloatingTextInput(snappedPoint);
  }
  async insertMindMapAt(point, sourceFile, options = {}) {
    const file = this.plugin.resolveApiFile(sourceFile, this.file?.path || "");
    if (!file) {
      return { ok: false, reason: "source-not-found" };
    }
    const source = await this.plugin.app.vault.cachedRead(file);
    const model = parseMarkdownMindMap(source, { title: file.basename || file.name || "Mind map", maxNodes: 240 });
    if (model.nodes.length <= 1 && !String(source || "").trim()) {
      if (!options.quiet) {
        new Notice(this.plugin.t("emptyMindMap"));
      }
      return { ok: false, reason: "empty-source" };
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    const width = this.canvasWidth();
    const height = this.canvasHeight();
    const frame = this.getResponsiveContentFrame();
    const originX = clamp(Number(point?.x) * width, Math.max(8, frame.left + 8), Math.max(8, width - 260));
    const originY = clamp(Number(point?.y) * height, 12, Math.max(12, height - 80));
    const geometry = layoutMindMap(model, {
      originX,
      originY,
      canvasWidth: width,
      canvasHeight: height,
      nodeWidth: 176,
      columnGap: 72,
      rowGap: 18
    });
    const mapId = `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const affectsSource = options.affectsSource !== false;
    const idMap = new Map();
    const depthColors = ["#2563eb", "#0f766e", "#b45309", "#be123c", "#4338ca", "#047857"];
    const nodeStrokes = geometry.nodes.map((node, index) => {
      const elementId = createElementLayoutId(this.drawingData.strokes.length + index);
      idMap.set(node.id, elementId);
      const color = depthColors[Math.min(node.depth, depthColors.length - 1) % depthColors.length];
      return normalizeStroke({
        elementId,
        kind: TOOL_TEXT,
        brush: BRUSH_PEN,
        color,
        width: node.type === "root" ? 2.4 : 1.8,
        opacity: 1,
        count: 1,
        text: node.markdown || node.text,
        render: TEXT_RENDER_MARKDOWN,
        fontSize: node.fontSize,
        bold: node.type === "root" || node.type === "heading",
        code: node.type === "code",
        boxed: true,
        file: false,
        previewWidth: Math.max(104, node.width),
        previewHeight: Math.max(40, node.height),
        buttonStyle: "outline",
        snap: true,
        locked: false,
        textWidth: null,
        mindMapNode: {
          mapId,
          nodeId: node.id,
          parentId: node.parentId || "",
          depth: node.depth,
          role: node.type === "root" ? "root" : node.type === "heading" ? "heading" : "node",
          type: node.type,
          sourcePath: file.path,
          sourceLine: node.sourceLine,
          sourceEndLine: node.sourceEndLine,
          sourceText: node.sourceText,
          affectsSource
        },
        points: [{
          x: clamp(node.x / width, 0, 1),
          y: clamp(node.y / height, 0, 1),
          t: Date.now(),
          anchor: null
        }]
      });
    });
    const connectorStrokes = geometry.edges.map((edge, index) => normalizeStroke({
      elementId: createElementLayoutId(this.drawingData.strokes.length + nodeStrokes.length + index),
      brush: BRUSH_PEN,
      color: depthColors[Math.min(edge.depth, depthColors.length - 1) % depthColors.length],
      width: edge.depth <= 1 ? 2.6 : 2,
      opacity: 0.88,
      count: 1,
      connector: {
        fromId: idMap.get(edge.fromId),
        toId: idMap.get(edge.toId),
        style: "mindmap",
        arrow: true
      },
      points: [
        { x: clamp(originX / width, 0, 1), y: clamp(originY / height, 0, 1), t: Date.now(), anchor: null },
        { x: clamp((originX + 1) / width, 0, 1), y: clamp((originY + 1) / height, 0, 1), t: Date.now(), anchor: null }
      ]
    }));
    const startIndex = this.drawingData.strokes.length;
    this.drawingData.strokes.push(...connectorStrokes, ...nodeStrokes);
    const connectorIndexes = connectorStrokes.map((_, index) => startIndex + index);
    const nodeIndexes = nodeStrokes.map((_, index) => startIndex + connectorStrokes.length + index);
    this.captureResponsiveAnchorsForIndexes(nodeIndexes);
    this.syncBoundConnectors();
    this.setSelectedStrokes([...connectorIndexes, ...nodeIndexes]);
    this.syncTextPanelButtons();
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.scheduleLayoutRefresh({ settle: false });
    this.render();
    if (model.truncated && !options.quiet) {
      new Notice(this.plugin.t("mindMapTruncated"));
    }
    return { ok: true, nodes: nodeStrokes.length, connectors: connectorStrokes.length, truncated: model.truncated, affectsSource };
  }
  async syncMindMapNodeToSource(stroke, text, options = {}) {
    const fallbackToDrawingHistory = () => {
      if (options.drawingBefore) {
        this.recordDrawingHistory(options.drawingBefore);
      }
      return false;
    };
    const node = normalizeMindMapNode(stroke?.mindMapNode);
    if (!node?.affectsSource || node.role === "root" || !node.sourcePath) {
      return fallbackToDrawingHistory();
    }
    const file = this.plugin.resolveApiFile(node.sourcePath, this.file?.path || "");
    if (!file) {
      return fallbackToDrawingHistory();
    }
    try {
      const source = await this.plugin.app.vault.cachedRead(file);
      const currentModel = parseMarkdownMindMap(source, { title: file.basename || file.name || "Mind map", maxNodes: 240 });
      const currentSourceNode = currentModel.nodes.find((candidate) => candidate.id === node.nodeId);
      const result = replaceMarkdownMindMapNodeText(source, { ...node, ...(currentSourceNode || {}) }, text);
      if (!result.changed) {
        if (result.reason === "source-range-not-found") {
          new Notice(this.plugin.t("sourceNoteUpdateFailed"));
        }
        return fallbackToDrawingHistory();
      }
      await this.plugin.app.vault.modify(file, result.source);
      this.refreshMindMapSourceMetadata(node.mapId, node.sourcePath, result.source);
      this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
      if (options.drawingBefore) {
        this.recordCompoundHistory(file, source, result.source, options.drawingBefore);
      }
      return true;
    } catch (error) {
      console.error(`[${PLUGIN_ID}] Failed to update mind map source note`, error);
      new Notice(this.plugin.t("sourceNoteUpdateFailed"));
      return fallbackToDrawingHistory();
    }
  }
  refreshMindMapSourceMetadata(mapId, sourcePath, source) {
    const file = this.plugin.resolveApiFile(sourcePath, this.file?.path || "");
    const model = parseMarkdownMindMap(source, { title: file?.basename || file?.name || "Mind map", maxNodes: 240 });
    const byId = new Map(model.nodes.map((node) => [node.id, node]));
    for (const stroke of this.drawingData.strokes) {
      const linked = normalizeMindMapNode(stroke.mindMapNode);
      const sourceNode = linked?.mapId === mapId ? byId.get(linked.nodeId) : null;
      if (!sourceNode) {
        continue;
      }
      stroke.mindMapNode = {
        ...linked,
        sourceLine: sourceNode.sourceLine,
        sourceEndLine: sourceNode.sourceEndLine,
        sourceText: sourceNode.sourceText,
        type: sourceNode.type
      };
    }
  }
  insertTextPresetAt(point, presetId, text) {
    const historyBefore = this.captureDrawingHistorySnapshot();
    const brush = this.currentBrushSettings();
    const preset = createTextPreset(presetId, text, brush.color || this.penColor);
    const stroke = {
      kind: preset.kind || TOOL_TEXT,
      brush: BRUSH_PEN,
      color: preset.color,
      width: 3,
      opacity: 1,
      count: 1,
      text: preset.text,
      render: preset.render || TEXT_RENDER_PLAIN,
      fontSize: clamp(Number(preset.fontSize || 18), 10, 72),
      bold: preset.bold,
      code: preset.code,
      boxed: preset.boxed,
      file: preset.file,
      previewWidth: preset.previewWidth,
      previewHeight: preset.previewHeight,
      uiRole: preset.uiRole,
      buttonStyle: preset.buttonStyle,
      snap: preset.snap,
      locked: false,
      points: [{ ...point, t: Date.now() }]
    };
    this.drawingData.strokes.push(stroke);
    this.setSelectedStrokes(this.drawingData.strokes.length - 1);
    this.captureResponsiveAnchorsForIndexes([this.drawingData.strokes.length - 1]);
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.scheduleLayoutRefresh({ settle: false });
    this.render();
  }
  async insertImportedAsset(fileLike, point) {
    const asset = await this.plugin.importLocalAsset(fileLike);
    if (!asset) {
      return;
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    const previewRenderMode = classifyImportedPreviewRender(asset);
    if (previewRenderMode) {
      const isHtmlPreview = previewRenderMode === TEXT_RENDER_HTML;
      const stroke = {
        kind: TOOL_TEXT,
        brush: BRUSH_PEN,
        color: "#1f2937",
        width: 3,
        opacity: 1,
        count: 1,
        text: asset.text || asset.name,
        render: previewRenderMode,
        fontSize: 16,
        bold: false,
        code: isHtmlPreview,
        boxed: true,
        file: true,
        assetPath: asset.path,
        assetName: asset.name,
        assetMime: asset.mime,
        assetSize: asset.size,
        previewWidth: 320,
        previewHeight: isHtmlPreview ? 200 : 220,
        locked: false,
        points: [{ ...point, t: Date.now() }]
      };
      this.pendingEmbedTool = null;
      this.drawingData.strokes.push(stroke);
      this.setSelectedStrokes(this.drawingData.strokes.length - 1);
      this.captureResponsiveAnchorsForIndexes([this.drawingData.strokes.length - 1]);
      this.redoStack = [];
      this.invalidateStaticCache();
      this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
      this.recordDrawingHistory(historyBefore);
      this.render();
      return;
    }
    const kind = classifyImportedAsset(asset);
    const stroke = {
      kind: TOOL_EMBED,
      embedType: kind,
      brush: BRUSH_PEN,
      color: this.currentBrushSettings().color || this.penColor,
      width: 3,
      opacity: 1,
      count: 1,
      text: asset.name,
      assetPath: asset.path,
      assetName: asset.name,
      assetMime: asset.mime,
      assetSize: asset.size,
      exportImageDataUrl: kind === EMBED_IMAGE ? asset.imageDataUrl || "" : "",
      previewWidth: kind === EMBED_FILE ? 260 : 320,
      previewHeight: kind === EMBED_FILE ? 74 : 200,
      locked: false,
      points: [{ ...point, t: Date.now() }]
    };
    this.pendingEmbedTool = null;
    this.drawingData.strokes.push(stroke);
    this.setSelectedStrokes(this.drawingData.strokes.length - 1);
    this.captureResponsiveAnchorsForIndexes([this.drawingData.strokes.length - 1]);
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.render();
  }
  onWheel(event) {
    if (!this.active) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && this.canZoomReadingSurface()) {
      const factor = Math.exp(-clamp(Number(event.deltaY) || 0, -80, 80) * 0.0025);
      this.setReadingZoom(this.readingZoom * factor, { x: event.clientX, y: event.clientY });
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.scheduleFloatingControlsPosition();
  }
  onReadingTouchPointerDown(event) {
    if (this.active || event.pointerType !== "touch" || event.isPrimary === false) {
      return;
    }
    beginReadingTouch(this.readingTouchGuard, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      now: Date.now()
    });
  }
  onReadingTouchPointerMove(event) {
    if (this.active || event.pointerType !== "touch") {
      return;
    }
    moveReadingTouch(this.readingTouchGuard, {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      now: Date.now()
    });
  }
  onReadingTouchPointerFinish(event) {
    if (this.active || event.pointerType !== "touch") {
      return;
    }
    const moved = finishReadingTouch(this.readingTouchGuard, {
      id: event.pointerId,
      now: Date.now()
    });
    if (moved && event.type !== "pointercancel") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    }
  }
  onReadingClick(event) {
    if (this.active || !shouldSuppressReadingClick(this.readingTouchGuard, Date.now())) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }
  canZoomReadingSurface() {
    return ["preview", "source"].includes(this.surfaceType) && !this.embeddedSurface;
  }
  usesVisualReadingZoom() {
    return this.surfaceType === "preview" && !this.embeddedSurface;
  }
  readingZoomScale() {
    return this.canZoomReadingSurface() ? clamp(Number(this.readingZoom) || 1, MIN_READING_ZOOM, MAX_READING_ZOOM) : 1;
  }
  isReadingZoomInteractionActive() {
    return Boolean(this.multiTouchScrolling) || Date.now() < this.readingZoomInteractionUntil;
  }
  scheduleReadingZoomSettle(delay = 180) {
    if (!this.usesVisualReadingZoom() || this.destroyed) {
      return;
    }
    const wait = Math.max(40, Number(delay) || 180);
    this.readingZoomInteractionUntil = Math.max(this.readingZoomInteractionUntil, Date.now() + wait);
    if (this.readingZoomSettleTimer !== null) {
      window.clearTimeout(this.readingZoomSettleTimer);
    }
    this.readingZoomSettleTimer = window.setTimeout(() => {
      this.readingZoomSettleTimer = null;
      const remaining = this.readingZoomInteractionUntil - Date.now();
      if (remaining > 0 || this.multiTouchScrolling) {
        this.scheduleReadingZoomSettle(Math.max(40, remaining));
        return;
      }
      this.readingZoomInteractionUntil = 0;
      if (Math.abs(this.readingZoomScale() - 1) < 0.001) {
        this.restoreReadingVirtualSections();
        this.readingZoomBaseTarget = null;
        this.readingZoomBaseOrigin = null;
      } else {
        this.scheduleReadingVirtualSectionSync();
      }
      this.scheduleResize({ layout: false, measure: false });
      this.requestRender(true);
    }, wait);
  }
  cancelReadingZoomSettle() {
    if (this.readingZoomSettleTimer !== null) {
      window.clearTimeout(this.readingZoomSettleTimer);
      this.readingZoomSettleTimer = null;
    }
    this.readingZoomInteractionUntil = 0;
  }
  readingZoomElements(target = this.readingZoomTarget) {
    const elements = this.usesVisualReadingZoom()
      ? [this.ensureReadingZoomStage(target)]
      : [target];
    return Array.from(new Set(elements.filter(Boolean))).filter((element) => !elements.some((parent) => parent && parent !== element && parent.contains?.(element)));
  }
  applyVisualReadingZoomElement(element, zoom) {
    if (!element?.isConnected) {
      return;
    }
    this.rememberReadingZoomStyles(element);
    const state = this.readingZoomStyleState.get(element);
    const originalTransform = state?.transform?.value;
    const origin = this.readingZoomOrigin(element);
    element.style.setProperty("transform", `scale(${zoom})${originalTransform && originalTransform !== "none" ? ` ${originalTransform}` : ""}`);
    element.style.setProperty("transform-origin", `${-origin.x}px ${-origin.y}px`);
  }
  readingPreviewRenderer() {
    const renderer = this.view?.previewMode?.renderer;
    return renderer?.previewEl === this.previewEl && Array.isArray(renderer?.sections) ? renderer : null;
  }
  repairConnectedReadingSections(renderer = this.readingPreviewRenderer()) {
    if (!renderer || !this.previewEl?.isConnected) {
      return 0;
    }
    let repaired = 0;
    try {
      renderer.updateVirtualDisplay?.();
      for (const section of renderer.sections || []) {
        if (section?.shown === false || !section?.el?.isConnected || section.rendered !== false) {
          continue;
        }
        section.render?.();
        renderer.measureSection?.(section);
        repaired += 1;
      }
      renderer.updateVirtualDisplay?.();
    } catch (error) {
      void error;
    }
    return repaired;
  }
  captureReadingLogicalSizerHeight(renderer = this.readingPreviewRenderer(), options = {}) {
    const sizer = renderer?.sizerEl;
    const allowGrowth = options.allowGrowth === true;
    const frozenByZoom = Math.abs(this.readingZoomScale() - 1) >= 0.001
      && this.readingLogicalSizerHeight > 0;
    if (!sizer?.isConnected || !allowGrowth && (this.readingVirtualSectionsManaged || frozenByZoom)) {
      return this.readingLogicalSizerHeight;
    }
    const sectionHeight = (renderer.sections || []).reduce((total, section) => {
      return total + (section?.shown === false ? 0 : Math.max(0, Number(section?.height) || 0));
    }, Math.max(0, Number(renderer.topSpace) || 0));
    const viewportHeight = Math.max(1, Number(this.previewEl?.clientHeight) || 1);
    const orphanedManagedHeight = sizer.hasAttribute("data-note-draw-virtual-height")
      && !this.readingVirtualStyleState.has(sizer);
    const staleLegacyHeight = !sizer.hasAttribute("data-note-draw-virtual-height")
      && shouldClearStaleReadingVirtualMinHeight({
        inlineMinHeight: Number.parseFloat(sizer.style.minHeight) || 0,
        sectionHeight,
        viewportHeight
      });
    if (orphanedManagedHeight || staleLegacyHeight) {
      sizer.style.removeProperty("min-height");
      sizer.removeAttribute("data-note-draw-virtual-height");
    }
    const observedHeight = Math.max(
      sectionHeight,
      Math.max(0, Number(sizer.scrollHeight) || 0) - Math.max(0, Number(this.readingBottomSpacerHeight) || 0),
      Math.max(0, Number(sizer.offsetHeight) || 0)
    );
    const runawayThreshold = Math.max(8_000, sectionHeight * 4, viewportHeight * 8);
    const priorHeight = this.readingLogicalSizerHeight;
    const transientGrowth = observedHeight > runawayThreshold && sectionHeight > 0 && observedHeight > sectionHeight * 4;
    const staleGrowth = priorHeight > runawayThreshold && sectionHeight > 0 && observedHeight < priorHeight * 0.55;
    const candidate = transientGrowth || staleGrowth
      ? sectionHeight + Math.max(192, Math.min(640, sectionHeight * 0.35))
      : observedHeight;
    this.readingLogicalSizerHeight = staleGrowth || transientGrowth
      ? Math.max(sectionHeight, Math.ceil(candidate))
      : Math.max(this.readingLogicalSizerHeight, candidate);
    return this.readingLogicalSizerHeight;
  }
  readingVirtualZoomOrigin(target) {
    void target;
    return 0;
  }
  readingViewportMetrics() {
    const scroller = this.scrollContainer?.isConnected
      ? this.scrollContainer
      : findScrollableAncestor(this.previewEl);
    const previewRect = this.previewEl?.getBoundingClientRect?.();
    const scrollerRect = scroller?.getBoundingClientRect?.();
    if (!scroller || scroller === this.previewEl || !previewRect || !scrollerRect) {
      return {
        scroller: this.previewEl,
        scrollTop: Math.max(0, Number(this.previewEl?.scrollTop) || 0),
        scrollLeft: Math.max(0, Number(this.previewEl?.scrollLeft) || 0),
        viewportHeight: Math.max(1, Number(this.previewEl?.clientHeight) || Number(previewRect?.height) || 1),
        viewportWidth: Math.max(1, Number(this.previewEl?.clientWidth) || Number(previewRect?.width) || 1)
      };
    }
    return {
      scroller,
      scrollTop: Math.max(0, scrollerRect.top - previewRect.top),
      scrollLeft: Math.max(0, scrollerRect.left - previewRect.left),
      viewportHeight: Math.max(1, Number(scroller.clientHeight) || Number(scrollerRect.height) || 1),
      viewportWidth: Math.max(1, Number(scroller.clientWidth) || Number(scrollerRect.width) || 1)
    };
  }
  scheduleReadingVirtualSectionSync() {
    if (this.destroyed || !this.usesVisualReadingZoom() || Math.abs(this.readingZoomScale() - 1) < 0.001 || !this.readingPreviewRenderer()) {
      return;
    }
    if (this.isReadingZoomInteractionActive()) {
      return;
    }
    if (this.readingVirtualSectionFrameId !== null) {
      return;
    }
    this.readingVirtualSectionFrameId = window.requestAnimationFrame(() => {
      this.readingVirtualSectionFrameId = null;
      this.syncReadingVirtualSections();
    });
  }
  cancelReadingVirtualSectionSync() {
    if (this.readingVirtualSectionFrameId !== null) {
      window.cancelAnimationFrame(this.readingVirtualSectionFrameId);
      this.readingVirtualSectionFrameId = null;
    }
  }
  restoreReadingVirtualSections() {
    this.cancelReadingVirtualSectionSync();
    if (!this.readingVirtualSectionsManaged && !this.readingVirtualStyleState.size) {
      return;
    }
    this.readingVirtualSectionsManaged = false;
    this.readingVirtualSectionSignature = "";
    this.restoreReadingVirtualStyles();
    const renderer = this.readingPreviewRenderer();
    if (!renderer || !this.previewEl?.isConnected) {
      return;
    }
    this.repairConnectedReadingSections(renderer);
    this.readingLogicalSizerHeight = 0;
    this.captureReadingLogicalSizerHeight(renderer);
    if (this.readingBottomSpacerHeight > 0) {
      this.ensureReadingBottomSpacer();
    }
  }
  rememberReadingVirtualStyle(element, property) {
    if (!element?.style) {
      return;
    }
    let properties = this.readingVirtualStyleState.get(element);
    if (!properties) {
      properties = /* @__PURE__ */ new Map();
      this.readingVirtualStyleState.set(element, properties);
    }
    if (!properties.has(property)) {
      properties.set(property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      });
    }
  }
  restoreReadingVirtualStyles() {
    for (const [element, properties] of this.readingVirtualStyleState) {
      for (const [property, state] of properties) {
        if (state.value) {
          element.style?.setProperty(property, state.value, state.priority || "");
        } else {
          element.style?.removeProperty(property);
        }
      }
      element.removeAttribute?.("data-note-draw-virtual-height");
      element.removeAttribute?.("data-note-draw-virtual-pusher");
    }
    this.readingVirtualStyleState.clear();
  }
  syncReadingVirtualSections() {
    if (this.isReadingZoomInteractionActive()) {
      return false;
    }
    const renderer = this.readingPreviewRenderer();
    const target = this.readingZoomTarget;
    const zoom = this.readingZoomScale();
    const sizer = renderer?.sizerEl || rootPreviewSizer(this.previewEl);
    const pusher = renderer?.pusherEl;
    const sections = renderer?.sections || [];
    if (!renderer || target !== sizer || !target?.isConnected || !this.readingZoomStage?.contains?.(sizer) || !pusher || !sections.length || Math.abs(zoom - 1) < 0.001) {
      return false;
    }
    this.rememberReadingVirtualStyle(sizer, "min-height");
    this.rememberReadingVirtualStyle(pusher, "margin-bottom");

    const shown = sections.filter((section) => section?.shown !== false && section?.el);
    const knownHeights = shown.map((section) => Number(section.height) || 0).filter((height) => height > 0);
    const averageHeight = knownHeights.length ? knownHeights.reduce((sum, height) => sum + height, 0) / knownHeights.length : 48;
    const topSpace = Math.max(0, Number(renderer.topSpace) || 0);
    let cursor = topSpace;
    const records = [];
    for (const section of shown) {
      const height = Math.max(1, Number(section.height) || averageHeight);
      records.push({ section, start: cursor, end: cursor + height, height });
      cursor += height;
    }
    const documentHeight = Math.max(1, cursor - topSpace, this.captureReadingLogicalSizerHeight(renderer));
    const metrics = this.readingViewportMetrics();
    const viewport = calculateVisualZoomLogicalWindow({
      scrollTop: metrics.scrollTop,
      viewportHeight: metrics.viewportHeight,
      zoom,
      origin: 0
    });
    const logicalTop = clamp(viewport.top, 0, Math.max(0, documentHeight - viewport.height));
    const logicalBottom = logicalTop + viewport.height;
    const buffer = Math.max(
      240,
      viewport.height * Math.max(0.5, Number(renderer.renderExtra) || 1),
      (Number(renderer.renderExtraMinPx) || 0) / zoom
    );
    let visible = records.filter((record) => record.end >= logicalTop - buffer && record.start <= logicalBottom + buffer);
    if (!visible.length && records.length) {
      visible = [records.reduce((nearest, record) => {
        const distance = Math.min(Math.abs(record.start - logicalTop), Math.abs(record.end - logicalTop));
        return !nearest || distance < nearest.distance ? { record, distance } : nearest;
      }, null).record];
    }

    const selection = this.previewEl.ownerDocument?.defaultView?.getSelection?.();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (!range.collapsed && this.previewEl.contains(range.commonAncestorContainer)) {
        visible = records.filter((record) => {
          return visible.includes(record)
            || record.section.el === range.startContainer
            || record.section.el === range.endContainer
            || record.section.el.contains?.(range.startContainer)
            || record.section.el.contains?.(range.endContainer);
        });
      }
    }
    const selectedIndexes = visible.map((record) => records.indexOf(record)).filter((index) => index >= 0);
    if (selectedIndexes.length > 1) {
      const firstSelected = Math.min(...selectedIndexes);
      const lastSelected = Math.max(...selectedIndexes);
      visible = records.slice(firstSelected, lastSelected + 1);
    }
    visible.sort((a, b) => sections.indexOf(a.section) - sections.indexOf(b.section));
    for (const record of visible) {
      record.section.render?.();
    }

    const first = visible[0] || records[0];
    const sectionElements = visible.map((record) => record.section.el);
    const validSectionElements = sectionElements.length > 0 && sectionElements.every((element) => (
      element
      && element !== sizer
      && element.ownerDocument === sizer.ownerDocument
      && !element.contains?.(sizer)
    ));
    if (!validSectionElements || typeof sizer.setChildrenInPlace !== "function") {
      return false;
    }
    const bottomSpacer = this.readingBottomSpacerHeight > 0 ? this.readingBottomSpacer : null;
    const desiredChildren = [pusher, ...sectionElements, ...(bottomSpacer ? [bottomSpacer] : [])];
    const currentChildren = Array.from(sizer.children || []);
    const childrenChanged = currentChildren.length !== desiredChildren.length
      || currentChildren.some((child, index) => child !== desiredChildren[index]);
    if (childrenChanged) {
      sizer.setChildrenInPlace(desiredChildren);
    }

    const pusherOffset = Math.max(0, (first?.start || topSpace) - topSpace);
    const pusherMargin = `${pusherOffset}px`;
    if (pusher.style.marginBottom !== pusherMargin) {
      pusher.style.marginBottom = pusherMargin;
    }
    const minimumHeight = `${Math.max(0, documentHeight + Number(this.readingBottomSpacerHeight || 0) - 1)}px`;
    if (sizer.style.minHeight !== minimumHeight) {
      sizer.style.minHeight = minimumHeight;
    }
    sizer.setAttribute("data-note-draw-virtual-height", "true");
    pusher.setAttribute("data-note-draw-virtual-pusher", "true");

    const visibleIndexes = visible.map((record) => sections.indexOf(record.section)).filter((index) => index >= 0);
    const firstIndex = visibleIndexes[0] ?? 0;
    const lastIndex = visibleIndexes[visibleIndexes.length - 1] ?? firstIndex;
    const measureThrough = lastIndex === sections.length - 1 ? lastIndex : lastIndex - 1;
    for (let index = firstIndex; index <= measureThrough; index += 1) {
      if (sections[index]?.shown !== false && sections[index]?.el?.isConnected) {
        renderer.measureSection?.(sections[index]);
      }
    }
    renderer.renderHighlights?.(firstIndex, lastIndex);
    this.readingVirtualSectionsManaged = true;
    const signature = visibleIndexes.join(",");
    if (signature !== this.readingVirtualSectionSignature) {
      this.readingVirtualSectionSignature = signature;
    }
    const hasRenderedAnchors = sectionElements.some((element) => element.querySelector?.("[data-note-draw-line-start]"));
    if (this.noteFlowOperationPending && this.hasNoteFlowElements() && !hasRenderedAnchors) {
      this.scheduleMarkdownAnnotationRefresh({ layout: false });
    }
    return true;
  }
  rememberReadingZoomStyles(element) {
    if (!element || this.readingZoomStyleState.has(element)) {
      return;
    }
    const properties = ["zoom", "transform", "transform-origin", "margin-bottom"];
    const computedStyle = window.getComputedStyle(element);
    this.readingZoomStyleState.set(element, Object.fromEntries(properties.map((property) => [property, {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
      computedValue: computedStyle.getPropertyValue(property)
    }])));
  }
  restoreReadingZoomStyles() {
    for (const [element, properties] of this.readingZoomStyleState) {
      for (const [property, state] of Object.entries(properties)) {
        if (state.value) {
          element.style.setProperty(property, state.value, state.priority || "");
        } else {
          element.style.removeProperty(property);
        }
      }
    }
    this.readingZoomStyleState.clear();
  }
  measureReadingZoomOrigin(element) {
    if (element === this.readingZoomStage) {
      return { x: 0, y: 0 };
    }
    if (this.readingZoomStage?.contains?.(element)) {
      let x = 0;
      let y = 0;
      let current = element;
      while (current && current !== this.readingZoomStage) {
        x += Number(current.offsetLeft) || 0;
        y += Number(current.offsetTop) || 0;
        current = current.offsetParent;
      }
      return { x, y };
    }
    const previewRect = this.previewEl?.getBoundingClientRect?.();
    const elementRect = element?.getBoundingClientRect?.();
    if (!previewRect || !elementRect) {
      return { x: 0, y: 0 };
    }
    return {
      x: elementRect.left - previewRect.left + (Number(this.previewEl.scrollLeft) || 0),
      y: elementRect.top - previewRect.top + (Number(this.previewEl.scrollTop) || 0)
    };
  }
  readingZoomOrigin(element) {
    if (element === this.readingZoomBaseTarget && this.readingZoomBaseOrigin) {
      return { ...this.readingZoomBaseOrigin };
    }
    return this.measureReadingZoomOrigin(element);
  }
  captureReadingZoomBaseOrigin(target) {
    if (!target?.isConnected) {
      return { x: 0, y: 0 };
    }
    if (this.readingZoomBaseTarget !== target || !this.readingZoomBaseOrigin) {
      this.readingZoomBaseTarget = target;
      this.readingZoomBaseOrigin = this.measureReadingZoomOrigin(target);
    }
    return { ...this.readingZoomBaseOrigin };
  }
  readingZoomScrollerOrigin(scroller, target = this.readingZoomTarget) {
    void target;
    if (!scroller || scroller === this.previewEl) {
      return { x: 0, y: 0 };
    }
    const previewRect = this.previewEl?.getBoundingClientRect?.();
    const scrollerRect = scroller?.getBoundingClientRect?.();
    if (!previewRect || !scrollerRect) {
      return { x: 0, y: 0 };
    }
    return {
      x: previewRect.left - scrollerRect.left + (Number(scroller.scrollLeft) || 0),
      y: previewRect.top - scrollerRect.top + (Number(scroller.scrollTop) || 0)
    };
  }
  updateReadingZoomExtent(zoom, target) {
    if (!this.readingZoomExtent) {
      return;
    }
    if (!this.usesVisualReadingZoom() || Math.abs(zoom - 1) < 0.001) {
      this.readingZoomExtent.style.removeProperty("width");
      this.readingZoomExtent.style.removeProperty("height");
      this.readingZoomExtent.removeAttribute("data-active");
      return;
    }
    const targetOrigin = this.readingZoomOrigin(target);
    const logicalWidth = Math.max(this.canvasCssWidth || 0, targetOrigin.x + (target?.scrollWidth || target?.offsetWidth || 0), this.previewEl.clientWidth || 0);
    const logicalHeight = Math.max(this.canvasCssHeight || 0, targetOrigin.y + (target?.scrollHeight || target?.offsetHeight || 0), this.previewEl.clientHeight || 0);
    const width = `${Math.max(1, Math.ceil(logicalWidth * zoom))}px`;
    const height = `${Math.max(1, Math.ceil(logicalHeight * zoom))}px`;
    if (this.readingZoomExtent.style.width !== width) {
      this.readingZoomExtent.style.setProperty("width", width);
    }
    if (this.readingZoomExtent.style.height !== height) {
      this.readingZoomExtent.style.setProperty("height", height);
    }
    this.readingZoomExtent.setAttribute("data-active", "true");
  }
  applyReadingZoom() {
    if (!this.canZoomReadingSurface()) {
      return false;
    }
    const target = findResponsiveContentElement(this.previewEl, this.surfaceType);
    if (!target) {
      return false;
    }
    const previousTarget = this.readingZoomTarget;
    this.readingZoomTarget = target;
    this.captureReadingLogicalSizerHeight();
    const visualTarget = this.usesVisualReadingZoom() ? this.ensureReadingZoomStage(target) : target;
    if (!visualTarget) {
      return false;
    }
    const zoom = this.readingZoomScale();
    this.readingZoom = zoom;
    if (previousTarget && previousTarget !== target) {
      this.restoreReadingZoomStyles();
      this.readingZoomBaseTarget = null;
      this.readingZoomBaseOrigin = null;
    }
    if (Math.abs(zoom - 1) >= 0.001) {
      this.captureReadingZoomBaseOrigin(target);
    }
    const elements = this.readingZoomElements(target);
    if (Math.abs(zoom - 1) < 0.001) {
      this.restoreReadingZoomStyles();
      if (!this.isReadingZoomInteractionActive()) {
        this.restoreReadingVirtualSections();
        this.readingZoomBaseTarget = null;
        this.readingZoomBaseOrigin = null;
      }
      this.previewEl.removeClass("is-reading-zoomed");
      this.previewEl.removeClass("is-editing-layout-zoomed");
    } else {
      if (this.usesVisualReadingZoom()) {
        for (const element of elements) {
          this.applyVisualReadingZoomElement(element, zoom);
        }
        const targetState = this.readingZoomStyleState.get(visualTarget);
        const originalMarginBottom = Number.parseFloat(targetState?.["margin-bottom"]?.computedValue || targetState?.["margin-bottom"]?.value) || 0;
        const targetHeight = Math.max(1, visualTarget?.offsetHeight || visualTarget?.scrollHeight || 1);
        if (zoom < 1) {
          visualTarget.style.setProperty("margin-bottom", `${calculateReadingZoomMargin(originalMarginBottom, targetHeight, zoom)}px`);
        } else if (targetState?.["margin-bottom"]?.value) {
          visualTarget.style.setProperty("margin-bottom", targetState["margin-bottom"].value, targetState["margin-bottom"].priority || "");
        } else {
          visualTarget.style.removeProperty("margin-bottom");
        }
      } else {
        for (const element of elements) {
          this.rememberReadingZoomStyles(element);
          element.style.setProperty("zoom", String(zoom));
          element.style.setProperty("transform-origin", "top left");
        }
      }
      this.previewEl.toggleClass("is-reading-zoomed", this.usesVisualReadingZoom());
      this.previewEl.toggleClass("is-editing-layout-zoomed", !this.usesVisualReadingZoom());
    }
    this.updateReadingZoomExtent(zoom, target);
    this.scheduleReadingVirtualSectionSync();
    return true;
  }
  clearReadingZoomStyles() {
    this.cancelReadingZoomSettle();
    this.restoreReadingZoomStyles();
    this.restoreReadingVirtualSections();
    this.updateReadingZoomExtent(1, this.readingZoomTarget);
    this.previewEl?.removeClass("is-reading-zoomed");
    this.previewEl?.removeClass("is-editing-layout-zoomed");
    this.readingZoomTarget = null;
    this.readingZoomBaseTarget = null;
    this.readingZoomBaseOrigin = null;
  }
  setReadingZoom(value, clientPoint = null, options = {}) {
    if (!this.canZoomReadingSurface()) {
      return false;
    }
    const next = clamp(Number(value) || 1, MIN_READING_ZOOM, MAX_READING_ZOOM);
    const previous = this.readingZoom || 1;
    const zoomChanged = Math.abs(next - previous) >= 0.001;
    const previousClientPoint = options.previousClientPoint || clientPoint;
    if (!zoomChanged && !previousClientPoint) {
      return true;
    }
    const scroller = findScrollableAncestor(this.previewEl);
    const scrollerRect = scroller?.getBoundingClientRect?.();
    const center = (point) => ({
      x: Number.isFinite(point?.x) && scrollerRect ? point.x - scrollerRect.left : (scroller?.clientWidth || 0) / 2,
      y: Number.isFinite(point?.y) && scrollerRect ? point.y - scrollerRect.top : (scroller?.clientHeight || 0) / 2
    });
    const previousCenter = center(previousClientPoint);
    const nextCenter = center(clientPoint);
    const scrollLeft = Number(scroller?.scrollLeft) || 0;
    const scrollTop = Number(scroller?.scrollTop) || 0;
    if (this.usesVisualReadingZoom() && (zoomChanged || previousClientPoint)) {
      this.scheduleReadingZoomSettle(options.settleDelay);
    }
    if (zoomChanged) {
      this.readingZoom = next;
      this.applyReadingZoom();
    }
    const ratio = next / previous;
    if (scroller && Number.isFinite(ratio)) {
      const origin = this.usesVisualReadingZoom() ? this.readingZoomScrollerOrigin(scroller) : { x: 0, y: 0 };
      const scroll = calculatePinchPanScroll({
        scrollLeft,
        scrollTop,
        previousCenter,
        nextCenter,
        zoomRatio: ratio,
        originX: origin.x,
        originY: origin.y,
        maxScrollLeft: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
        maxScrollTop: Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      });
      if (Math.abs(scroller.scrollLeft - scroll.left) >= 0.25) {
        scroller.scrollLeft = scroll.left;
      }
      if (Math.abs(scroller.scrollTop - scroll.top) >= 0.25) {
        scroller.scrollTop = scroll.top;
      }
    }
    if (zoomChanged) {
      if (!this.usesVisualReadingZoom()) {
        this.responsiveLayoutContext = null;
      }
      if (options.resize !== false) {
        const visualReadingZoom = this.usesVisualReadingZoom();
        this.scheduleResize({ layout: !visualReadingZoom, measure: !visualReadingZoom });
      }
      if (options.persist !== false) {
        this.persistInteractionSettings();
      }
      if (options.share !== false) {
        this.syncSharedToolbarState();
      }
    }
    return true;
  }
  startMultiTouchScroll(event) {
    this.suppressTouchDrawing = true;
    this.multiTouchScrolling = true;
    this.multiTouchLastCenter = this.getTouchCenter();
    this.multiTouchLastDistance = this.getTouchDistance();
    this.multiTouchInitialDistance = this.multiTouchLastDistance;
    this.multiTouchGestureMode = "undecided";
    this.multiTouchPendingCenter = null;
    this.multiTouchPendingDistance = null;
    this.multiTouchPinching = false;
    if (this.scrollSettleTimer !== null) {
      window.clearTimeout(this.scrollSettleTimer);
      this.scrollSettleTimer = null;
    }
    this.previewEl.addClass("is-two-finger-scroll");
    this.cancelCurrentStroke();
    this.cancelSelectedStrokeDrag(true);
    event.preventDefault();
    event.stopPropagation();
  }
  completeTrackedTouch(pointerId) {
    if (!this.touchPointers.has(pointerId)) {
      return false;
    }
    const finishingMultiTouch = this.multiTouchScrolling || this.multiTouchPinching || this.suppressTouchDrawing;
    if (this.multiTouchScrolling && this.touchPointers.size >= 2) {
      this.flushMultiTouchGesture();
    }
    this.touchPointers.delete(pointerId);
    if (this.touchPointers.size < 2) {
      this.multiTouchScrolling = false;
      this.multiTouchLastCenter = null;
      this.multiTouchLastDistance = null;
      this.multiTouchInitialDistance = null;
      this.multiTouchGestureMode = "undecided";
      this.multiTouchPendingCenter = null;
      this.multiTouchPendingDistance = null;
      this.previewEl.removeClass("is-two-finger-scroll");
    }
    if (this.touchPointers.size === 0) {
      this.suppressTouchDrawing = false;
      if (finishingMultiTouch && this.multiTouchPinching) {
        this.persistInteractionSettings();
        this.syncSharedToolbarState();
      }
      this.multiTouchPinching = false;
      if (finishingMultiTouch) {
        this.scheduleReadingZoomSettle(80);
        this.scheduleResize({ layout: false, measure: false });
        this.requestRender(true);
      }
    }
    return true;
  }
  resetTouchGestureState() {
    this.cancelMultiTouchFrame();
    this.touchPointers.clear();
    this.multiTouchScrolling = false;
    this.multiTouchGestureMode = "undecided";
    this.multiTouchInitialDistance = null;
    this.multiTouchLastCenter = null;
    this.multiTouchLastDistance = null;
    this.multiTouchPendingCenter = null;
    this.multiTouchPendingDistance = null;
    this.multiTouchPinching = false;
    this.suppressTouchDrawing = false;
    this.previewEl?.removeClass("is-two-finger-scroll");
  }
  handleMultiTouchScroll(event) {
    if (!this.multiTouchScrolling || this.touchPointers.size < 2) {
      return;
    }
    this.multiTouchPendingCenter = this.getTouchCenter();
    this.multiTouchPendingDistance = this.getTouchDistance();
    if (this.multiTouchFrameId === null) {
      this.multiTouchFrameId = window.requestAnimationFrame(() => {
        this.multiTouchFrameId = null;
        this.flushMultiTouchGesture();
      });
    }
    event.preventDefault();
    event.stopPropagation();
  }
  cancelMultiTouchFrame() {
    if (this.multiTouchFrameId !== null) {
      window.cancelAnimationFrame(this.multiTouchFrameId);
      this.multiTouchFrameId = null;
    }
  }
  flushMultiTouchGesture() {
    this.cancelMultiTouchFrame();
    const center = this.multiTouchPendingCenter;
    const previous = this.multiTouchLastCenter;
    const distance = this.multiTouchPendingDistance;
    const previousDistance = this.multiTouchLastDistance;
    this.multiTouchPendingCenter = null;
    this.multiTouchPendingDistance = null;
    if (!this.multiTouchScrolling || this.touchPointers.size < 2 || !center || !previous) {
      return;
    }
    let nextZoom = this.readingZoom;
    this.multiTouchGestureMode = resolveMultiTouchGestureMode({
      mode: this.multiTouchGestureMode,
      initialDistance: this.multiTouchInitialDistance,
      distance
    });
    if (this.canZoomReadingSurface() && this.multiTouchGestureMode === "pinch" && distance && previousDistance) {
      this.multiTouchPinching = true;
      nextZoom = this.readingZoom * distance / previousDistance;
    }
    this.setReadingZoom(nextZoom, center, {
      previousClientPoint: previous,
      persist: false,
      resize: false,
      share: false
    });
    this.multiTouchLastCenter = center;
    if (distance) {
      this.multiTouchLastDistance = distance;
    }
  }
  getTouchCenter() {
    if (!this.touchPointers.size) {
      return null;
    }
    let x = 0;
    let y = 0;
    for (const point of this.touchPointers.values()) {
      x += point.x;
      y += point.y;
    }
    return {
      x: x / this.touchPointers.size,
      y: y / this.touchPointers.size
    };
  }
  getTouchDistance() {
    if (this.touchPointers.size < 2) {
      return null;
    }
    const points = Array.from(this.touchPointers.values());
    return pointerDistance(points[0], points[1]);
  }
  cancelCurrentStroke() {
    if (this.activePointerId !== null) {
      try {
        if (this.canvas.hasPointerCapture?.(this.activePointerId)) {
          this.canvas.releasePointerCapture(this.activePointerId);
        }
      } catch (error) {
        void error;
      }
    }
    this.currentStroke = null;
    this.connectorGesture = null;
    this.pointerDown = false;
    this.pointerStartPoint = null;
    this.pointerStartClient = null;
    this.pointerStartEditable = null;
    this.pointerStartSourceText = false;
    this.activePointerId = null;
    this.pendingSelectionTap = null;
    this.didMove = false;
    this.resetTextHighlightGesture();
    this.render();
  }
  startPendingSelectionTap(event, action) {
    this.endTextEdit();
    this.cancelCurrentStroke();
    this.pendingSelectionTap = {
      ...action,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      moved: false
    };
    this.pointerStartClient = { x: event.clientX, y: event.clientY };
    this.activePointerId = event.pointerId;
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      void error;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  updatePendingSelectionTap(event) {
    const pending = this.pendingSelectionTap;
    if (!pending || event.pointerId !== pending.pointerId) {
      return;
    }
    if (pointerDistance(pending.startClient, { x: event.clientX, y: event.clientY }) > this.tapDistancePx()) {
      pending.moved = true;
      if (pending.type === "edit-markdown-or-drag" || pending.type === "edit-stroke-or-drag") {
        this.pendingSelectionTap = null;
        this.startSelectedStrokeDrag(event, this.eventToPoint(event), pending.index ?? -1, {
          preserveSelection: pending.preserveSelection
        });
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }
  applyPendingSelectionTap(pending) {
    if (!pending) {
      return;
    }
    if (pending.type === "select-stroke") {
      this.setSelectedStrokes(pending.index);
    } else if (pending.type === "toggle-stroke") {
      this.toggleStrokeSelection(pending.index);
    } else if (pending.type === "enter-stroke-group") {
      this.enteredElementGroupIds.add(pending.groupId);
      this.selectedMarkdownBlockIds.clear();
      this.setSelectedStrokes(pending.index, { skipGroupExpansion: true });
    } else if (pending.type === "select-markdown") {
      this.selectMarkdownBlock(pending.element);
    } else if (pending.type === "toggle-markdown") {
      this.toggleMarkdownBlockSelection(pending.element);
    } else if (pending.type === "enter-markdown-group") {
      this.enteredElementGroupIds.add(pending.groupId);
      this.selectedStrokeIndexes.clear();
      this.selectedStrokeIndex = -1;
      this.selectMarkdownBlock(pending.element, { skipGroupExpansion: true });
    } else if (pending.type === "select-group") {
      this.enteredElementGroupIds.delete(pending.groupId);
      this.selectElementGroup(pending.groupId);
    } else if (pending.type === "edit-markdown-or-drag") {
      return this.startTextEdit(pending.editable || pending.element, pending.clientPoint || null);
    } else if (pending.type === "edit-stroke-or-drag") {
      this.editFloatingTextStroke(pending.index);
    }
  }
  finishPendingSelectionTap(event) {
    const pending = this.pendingSelectionTap;
    const movedDistance = pending
      ? pointerDistance(pending.startClient, { x: event.clientX, y: event.clientY })
      : Number.POSITIVE_INFINITY;
    this.pendingSelectionTap = null;
    this.pointerStartClient = null;
    this.activePointerId = null;
    this.releasePointerCapture(event.pointerId);
    if (pending && !pending.moved && movedDistance <= this.tapDistancePx()) {
      pending.clientPoint = { x: event.clientX, y: event.clientY };
      const applied = this.applyPendingSelectionTap(pending);
      if (pending.type !== "edit-markdown-or-drag" || applied === false) {
        this.render();
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }
  cancelPendingSelectionTap() {
    const pointerId = this.activePointerId;
    this.pendingSelectionTap = null;
    this.pointerStartClient = null;
    this.activePointerId = null;
    if (pointerId !== null) {
      this.releasePointerCapture(pointerId);
    }
  }
  startSelectionDrag(event, point) {
    this.endTextEdit();
    this.cancelCurrentStroke();
    this.selectingStrokes = true;
    this.selectionStartPoint = point;
    this.selectionCurrentPoint = point;
    this.pointerStartClient = { x: event.clientX, y: event.clientY };
    this.activePointerId = event.pointerId;
    this.previewEl.addClass("is-selecting-strokes");
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      void error;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  updateSelectionDrag(event) {
    this.selectionCurrentPoint = this.eventToPoint(event);
    this.requestRender();
    event.preventDefault();
    event.stopPropagation();
  }
  finishSelectionDrag(event) {
    const point = this.eventToPoint(event);
    const movedDistance = this.pointerStartClient ? pointerDistance(this.pointerStartClient, { x: event.clientX, y: event.clientY }) : 0;
    if (movedDistance <= this.tapDistancePx() || !this.selectionStartPoint || !this.selectionCurrentPoint) {
      this.setSelectedStrokes(this.findStrokeAt(point, { x: event.clientX, y: event.clientY }));
    } else {
      this.setSelectedStrokes(this.findStrokesInSelection(this.selectionStartPoint, this.selectionCurrentPoint));
      this.selectedMarkdownBlockIds = new Set(this.findMarkdownBlocksInSelection(this.selectionStartPoint, this.selectionCurrentPoint));
      this.invalidateSelectionFrameSnapshot();
      this.expandSelectedGroups();
    }
    this.releasePointerCapture(event.pointerId);
    this.clearSelectionDragState();
    this.requestRender(true);
    event.preventDefault();
    event.stopPropagation();
  }
  cancelSelectionDrag(render = false) {
    if (this.activePointerId !== null) {
      this.releasePointerCapture(this.activePointerId);
    }
    this.clearSelectionDragState();
    if (render) {
      this.render();
    }
  }
  clearSelectionDragState() {
    this.selectingStrokes = false;
    this.selectionStartPoint = null;
    this.selectionCurrentPoint = null;
    this.pointerStartClient = null;
    this.activePointerId = null;
    this.previewEl.removeClass("is-selecting-strokes");
  }
  startSelectedStrokeDrag(event, point, hitIndex = -1, options = {}) {
    const indexes = this.getSelectedStrokeIndexes();
    const markdownBlocks = this.getSelectedMarkdownBlocks();
    if (!indexes.length && !markdownBlocks.length) {
      return;
    }
    const movableIndexes = indexes.filter((index) => !this.drawingData.strokes[index]?.locked || Boolean(this.drawingData.strokes[index]?.groupId));
    const movableMarkdownBlocks = markdownBlocks.filter((block) => (!block.locked || block.groupId) && this.markdownBlockElement(block));
    this.dragMarkdownTextCommit = this.endTextEdit();
    this.clearDraggedNoteFlowPlacement();
    this.cancelMarkdownBlockDropFrame();
    this.resetDragDropGeometry();
    this.dragSnapOtherBounds = null;
    this.pointerDown = false;
    this.currentStroke = null;
    if (!movableIndexes.length && !movableMarkdownBlocks.length) {
      this.showSelectionMenu({ x: event.clientX, y: event.clientY });
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.draggingStroke = true;
    this.dragStrokeStartPoint = point;
    this.dragStrokeIndexes = movableIndexes;
    this.dragShouldSnap = this.shouldSnapStrokeIndexes(movableIndexes);
    this.dragMovedElementIds = this.connectorTargetIdsForStrokeIndexes(movableIndexes);
    this.dragPendingConnectorIds = null;
    this.dragConnectorById = new Map((this.drawingData?.strokes || [])
      .map((stroke) => [strokeElementId(stroke), stroke])
      .filter(([id]) => id));
    this.dragConnectorCandidates = this.dragMovedElementIds.size
      ? (this.drawingData?.strokes || []).filter((stroke) => {
        const connector = normalizeConnector(stroke?.connector);
        return connector && (this.dragMovedElementIds.has(connector.fromId) || this.dragMovedElementIds.has(connector.toId));
      })
      : [];
    this.dragLastPointerEvent = null;
    this.dragLastPointerKey = "";
    this.dragStrokeOriginalPoints = new Map(movableIndexes.map((index) => [
      index,
      this.drawingData.strokes[index].points.map((strokePoint) => ({ ...strokePoint }))
    ]));
    let pointMinX = 1;
    let pointMinY = 1;
    let pointMaxX = 0;
    let pointMaxY = 0;
    for (const points of this.dragStrokeOriginalPoints.values()) {
      for (const strokePoint of points) {
        pointMinX = Math.min(pointMinX, Number(strokePoint.x) || 0);
        pointMinY = Math.min(pointMinY, Number(strokePoint.y) || 0);
        pointMaxX = Math.max(pointMaxX, Number(strokePoint.x) || 0);
        pointMaxY = Math.max(pointMaxY, Number(strokePoint.y) || 0);
      }
    }
    this.dragStrokeOriginalPointBounds = this.dragStrokeOriginalPoints.size
      ? { minX: pointMinX, minY: pointMinY, maxX: pointMaxX, maxY: pointMaxY }
      : null;
    this.dragMarkdownOriginalElements = new Map(movableMarkdownBlocks.map((block) => {
      const element = this.markdownBlockElement(block);
      const clientRect = this.markdownElementVisibleClientRect(element) || element.getBoundingClientRect();
      return [block.id, {
        block,
        element,
        sourceInfo: getSourceInfo(element),
        sourceText: element.innerText,
        span: block.span,
        widthScale: normalizeMarkdownBlockWidthScale(block.widthScale),
        floatBox: block.floatBox ? { ...block.floatBox } : null,
        floatingExplicit: Boolean(block.floatingExplicit),
        canvasBounds: this.markdownElementCanvasBounds(element, { forSelection: true }),
        clientRect: {
          left: clientRect.left,
          right: clientRect.right,
          top: clientRect.top,
          bottom: clientRect.bottom
        }
      }];
    }));
    this.dragMarkdownSourcePromise = this.dragMarkdownOriginalElements.size
      ? this.plugin.app.vault.read(this.file).catch(() => null)
      : null;
    this.dragMarkdownSourceIndexPromise = this.dragMarkdownSourcePromise?.then((source) => {
      return source ? createMarkdownSourceIndex(source) : null;
    }) || null;
    for (const state of this.dragMarkdownOriginalElements.values()) {
      state.lockedTargetPromise = this.dragMarkdownSourcePromise && this.dragMarkdownSourceIndexPromise
        ? Promise.all([this.dragMarkdownSourcePromise, this.dragMarkdownSourceIndexPromise]).then(([source, sourceIndex]) => {
          return source ? resolveSourceDropTarget(source, state.sourceInfo, state.sourceText, sourceIndex) : null;
        })
        : Promise.resolve(null);
    }
    const markdownClientRects = Array.from(this.dragMarkdownOriginalElements.values()).map((state) => state.clientRect);
    this.dragMarkdownOriginalClientBounds = markdownClientRects.length ? {
      left: Math.min(...markdownClientRects.map((rect) => rect.left)),
      right: Math.max(...markdownClientRects.map((rect) => rect.right)),
      top: Math.min(...markdownClientRects.map((rect) => rect.top)),
      bottom: Math.max(...markdownClientRects.map((rect) => rect.bottom))
    } : null;
    this.dragMarkdownClientDeltaX = 0;
    const lane = this.layoutMeasureEl?.isConnected
      ? this.layoutMeasureEl
      : findLayoutMeasureElement(this.previewEl) || this.previewEl;
    const laneRect = lane?.getBoundingClientRect?.();
    this.dragContentLaneRect = laneRect?.width > 1 ? {
      left: laneRect.left,
      right: laneRect.right,
      top: laneRect.top,
      bottom: laneRect.bottom
    } : null;
    this.dragNoteFlowOriginalBounds = new Map(movableIndexes.flatMap((index) => {
      const stroke = this.drawingData.strokes[index];
      if (!normalizeNoteFlow(stroke?.noteFlow) || isConnectorStroke(stroke)) {
        return [];
      }
      const bounds = getStrokeBounds(stroke, this.canvasWidth(), this.canvasHeight());
      return bounds ? [[index, bounds]] : [];
    }));
    this.dragStrokeOriginalNoteFlows = new Map(movableIndexes.map((index) => {
      const noteFlow = normalizeNoteFlow(this.drawingData.strokes[index]?.noteFlow);
      return [index, noteFlow ? { ...noteFlow } : null];
    }));
    this.pendingDraggedNoteFlowIndexes.clear();
    this.dragDrawingHistoryBefore = this.captureDrawingHistorySnapshot();
    this.dragStrokeOriginalBounds = this.getStrokeIndexesNormalizedBounds(movableIndexes);
    this.dragElementGroupBounds = new Map(this.elementGroupRecords().filter((group) => group.boxed).map((group) => [group.id, this.getElementGroupBounds(group.id)]));
    this.dragHasBoxBackground = Array.from(this.dragElementGroupBounds.keys()).some((id) => Boolean(this.elementGroup(id)?.backgroundColor));
    this.dragMarkdownLastValidDrop = null;
    this.dragStrokeMoved = false;
    this.dragStrokeHitIndex = hitIndex;
    this.dragStrokePreserveSelection = Boolean(options.preserveSelection);
    this.pointerStartClient = { x: event.clientX, y: event.clientY };
    this.dragStrokePointerGeometry = this.captureCanvasPointerGeometry();
    this.activePointerId = event.pointerId;
    this.previewEl.addClass("is-moving-selection");
    for (const state of this.dragMarkdownOriginalElements.values()) {
      state.element.addClass("is-notedraw-md-dragging");
    }
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      void error;
    }
    this.startSelectionLongPress(event);
    event.preventDefault();
    event.stopPropagation();
  }
  connectorTargetIdsForStrokeIndexes(indexes) {
    const ids = new Set();
    for (const index of indexes || []) {
      const stroke = this.drawingData?.strokes?.[index];
      const elementId = strokeElementId(stroke);
      if (elementId) {
        ids.add(elementId);
      }
      const connector = normalizeConnector(stroke?.connector);
      if (connector?.fromId) {
        ids.add(connector.fromId);
      }
      if (connector?.toId) {
        ids.add(connector.toId);
      }
    }
    return ids;
  }
  clearMarkdownBlockDropTarget() {
    this.dragMarkdownDropTarget?.removeClass?.(
      "notedraw-text-sort-target-before",
      "notedraw-text-sort-target-after",
      "notedraw-text-sort-target-left",
      "notedraw-text-sort-target-right"
    );
    this.dragMarkdownDropTarget = null;
    this.dragMarkdownDropSide = null;
  }
  cancelMarkdownBlockDropFrame() {
    if (this.dragMarkdownDropFrameId !== null) {
      window.cancelAnimationFrame(this.dragMarkdownDropFrameId);
      this.dragMarkdownDropFrameId = null;
    }
    this.dragMarkdownDropClientX = null;
    this.dragMarkdownDropClientY = null;
  }
  queueMarkdownBlockDropTarget(clientX, clientY) {
    if (!this.dragMarkdownOriginalElements?.size || !Number.isFinite(Number(clientX)) || !Number.isFinite(Number(clientY))) {
      return;
    }
    this.dragMarkdownDropClientX = Number(clientX);
    this.dragMarkdownDropClientY = Number(clientY);
    if (this.dragMarkdownDropFrameId !== null) {
      return;
    }
    this.dragMarkdownDropFrameId = window.requestAnimationFrame(() => {
      this.dragMarkdownDropFrameId = null;
      const pendingX = this.dragMarkdownDropClientX;
      const pendingY = this.dragMarkdownDropClientY;
      this.dragMarkdownDropClientX = null;
      this.dragMarkdownDropClientY = null;
      this.updateMarkdownBlockDropTarget(pendingX, pendingY);
    });
  }
  flushMarkdownBlockDropTarget(clientX, clientY) {
    this.cancelMarkdownBlockDropFrame();
    if (this.dragMarkdownOriginalElements?.size && Number.isFinite(Number(clientX)) && Number.isFinite(Number(clientY))) {
      return this.updateMarkdownBlockDropTarget(clientX, clientY);
    }
    return null;
  }
  dragDropScrollKey() {
    const scroller = this.scrollContainer;
    const viewport = window.visualViewport;
    return [
      Number(scroller?.scrollLeft) || 0,
      Number(scroller?.scrollTop) || 0,
      Number(window.scrollX) || 0,
      Number(window.scrollY) || 0,
      Number(viewport?.offsetLeft) || 0,
      Number(viewport?.offsetTop) || 0
    ].join(":");
  }
  resetDragDropGeometry() {
    this.dragDropGeometry = null;
  }
  draggedSelectionClientLeft() {
    const values = [];
    if (this.dragMarkdownOriginalClientBounds) {
      values.push(this.dragMarkdownOriginalClientBounds.left + (Number(this.dragMarkdownClientDeltaX) || 0));
    }
    const indexes = this.draggedNoteFlowIndexes(this.dragStrokeIndexes || []);
    const bounds = this.getStrokeIndexesBounds(indexes);
    const canvasRect = this.dragStrokePointerGeometry?.rect;
    if (bounds && canvasRect?.width > 0) {
      const scaleX = canvasRect.width / Math.max(1, this.canvasWidth());
      values.push(canvasRect.left + bounds.minX * scaleX);
    }
    return values.length ? Math.min(...values) : null;
  }
  dragDropGeometrySnapshot() {
    const scrollKey = this.dragDropScrollKey();
    const current = this.dragDropGeometry;
    if (current && current.scrollKey === scrollKey && current.layoutGeneration === this.layoutRefreshGeneration) {
      return current;
    }
    const lane = this.layoutMeasureEl?.isConnected
      ? this.layoutMeasureEl
      : findLayoutMeasureElement(this.previewEl) || this.previewEl;
    const laneBounds = lane?.getBoundingClientRect?.();
    const laneRect = laneBounds && laneBounds.width > 1 && laneBounds.height > 0
      ? { left: laneBounds.left, right: laneBounds.right, top: laneBounds.top, bottom: laneBounds.bottom, width: laneBounds.width, height: laneBounds.height }
      : null;
    const movingElements = new Set(Array.from(this.dragMarkdownOriginalElements?.values?.() || []).map((state) => state.element));
    const markdownCandidates = Array.from(new Set([
      ...this.markdownBlockElements.values(),
      ...Array.from(this.previewEl.querySelectorAll?.(EDITABLE_SELECTOR) || [])
    ])).filter((element) => {
      if (!element?.isConnected || movingElements.has(element) || !isConcreteMarkdownBlockElement(element)) {
        return false;
      }
      if (Array.from(movingElements).some((moving) => moving.contains?.(element) || element.contains?.(moving))) {
        return false;
      }
      const file = this.plugin.resolveEditableFile(element, this.file);
      return normalizeVaultPath(file?.path) === normalizeVaultPath(this.file?.path);
    }).map((element) => {
      const bounds = this.markdownElementVisibleClientRect(element);
      return bounds && bounds.width > 1 && bounds.height > 1
        ? { element, rect: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height } }
        : null;
    }).filter(Boolean);
    const noteFlowCandidates = this.noteFlowCandidates();
    const markdownCandidateByElement = new Map(markdownCandidates.map((entry) => [entry.element, entry]));
    const markdownBlockRecords = new Map(this.markdownBlockRecords().map((item) => [item.id, item]));
    const snapshot = {
      scrollKey,
      layoutGeneration: this.layoutRefreshGeneration,
      laneRect,
      movingElements,
      markdownCandidates,
      markdownCandidateByElement,
      markdownBlockRecords,
      noteFlowCandidates,
      noteFlowDropIndex: createNoteFlowDropIndex(noteFlowCandidates),
      rowMetrics: /* @__PURE__ */ new Map()
    };
    this.dragDropGeometry = snapshot;
    return snapshot;
  }
  markdownEdgeDropTarget(clientX, clientY, movingElements = /* @__PURE__ */ new Set()) {
    const geometry = this.dragDropGeometrySnapshot();
    const laneRect = geometry?.laneRect;
    if (!laneRect || laneRect.width <= 1) {
      return null;
    }
    let nearest = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestCenterDistance = Number.POSITIVE_INFINITY;
    for (const candidate of geometry.markdownCandidates) {
      if (movingElements.has(candidate.element)) {
        continue;
      }
      const rect = candidate.rect;
      const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      const centerDistance = Math.abs(clientY - (rect.top + rect.bottom) / 2);
      if (distance < nearestDistance || distance === nearestDistance && centerDistance < nearestCenterDistance) {
        nearest = candidate;
        nearestDistance = distance;
        nearestCenterDistance = centerDistance;
      }
    }
    if (!nearest) {
      return null;
    }
    const maxDistance = Math.max(80, nearest.rect.height * 1.5);
    const verticalDistance = clientY < nearest.rect.top
      ? nearest.rect.top - clientY
      : clientY > nearest.rect.bottom
        ? clientY - nearest.rect.bottom
        : 0;
    const row = this.markdownDropRowMetrics(nearest.element, movingElements);
    const horizontalRoom = row.canFit
      && Number(nearest.element.parentElement?.clientWidth || nearest.rect.width) >= Math.max(300, row.totalCount * 120);
    const intent = resolveDragDropHorizontalIntent({
      clientX,
      targetLeft: nearest.rect.left,
      targetRight: nearest.rect.right,
      laneLeft: laneRect.left,
      laneRight: laneRect.right,
      draggedLeft: this.draggedSelectionClientLeft(),
      horizontalRoom
    });
    return verticalDistance <= maxDistance && intent !== "vertical"
      ? { element: nearest.element, intent }
      : null;
  }
  markdownVerticalDropTarget(clientX, clientY, movingElements = /* @__PURE__ */ new Set()) {
    const geometry = this.dragDropGeometrySnapshot();
    const candidates = (geometry?.markdownCandidates || [])
      .filter((candidate) => !movingElements.has(candidate.element));
    return resolveVerticalMarkdownDropTarget({
      clientX,
      clientY,
      laneRect: geometry?.laneRect,
      candidates
    });
  }
  captureMarkdownBlockDropTarget(target, side, row = null) {
    if (!target || !side) {
      return null;
    }
    const targetBlock = this.findMarkdownBlockRecordForElement(target);
    const rawInfo = getSourceInfo(target);
    const targetInfo = {
      ...rawInfo,
      lineStart: rawInfo.lineStart ?? targetBlock?.lineStart ?? null,
      lineEnd: rawInfo.lineEnd ?? targetBlock?.lineEnd ?? rawInfo.lineStart ?? targetBlock?.lineStart ?? null
    };
    const targetText = String(target.innerText || "");
    const targetFile = this.plugin.resolveEditableFile(target, this.file);
    const path = normalizeVaultPath(targetFile?.path || "");
    const sourcePromise = path === normalizeVaultPath(this.file?.path) && this.dragMarkdownSourcePromise
      ? this.dragMarkdownSourcePromise
      : path
        ? this.plugin.app.vault.read(targetFile).catch(() => null)
        : Promise.resolve(null);
    const sourceIndexPromise = path === normalizeVaultPath(this.file?.path) && this.dragMarkdownSourceIndexPromise
      ? this.dragMarkdownSourceIndexPromise
      : sourcePromise.then((source) => source ? createMarkdownSourceIndex(source) : null);
    const lockedTargetPromise = path && targetText
      ? Promise.all([sourcePromise, sourceIndexPromise]).then(([source, sourceIndex]) => {
        return source ? resolveSourceDropTarget(source, targetInfo, targetText, sourceIndex) : null;
      })
      : Promise.resolve(null);
    return {
      element: target,
      side,
      path,
      blockId: targetBlock?.id || target.dataset?.noteDrawMarkdownBlockId || "",
      targetInfo,
      targetText,
      row: row ? { ...row } : null,
      lockedTargetPromise
    };
  }
  updateMarkdownBlockDropTarget(clientX, clientY) {
    const geometry = this.dragDropGeometrySnapshot();
    const movingElements = geometry?.movingElements || new Set(Array.from(this.dragMarkdownOriginalElements?.values?.() || []).map((state) => state.element));
    let targetEntry = null;
    let targetArea = Number.POSITIVE_INFINITY;
    for (const candidate of geometry?.markdownCandidates || []) {
      const rect = candidate.rect;
      if (movingElements.has(candidate.element)
        || clientX < rect.left
        || clientX > rect.right
        || clientY < rect.top
        || clientY > rect.bottom) {
        continue;
      }
      const area = rect.width * rect.height;
      if (area < targetArea) {
        targetEntry = candidate;
        targetArea = area;
      }
    }
    let target = targetEntry?.element || null;
    let forcedIntent = null;
    if (!target) {
      const edgeTarget = this.markdownEdgeDropTarget(clientX, clientY, movingElements);
      target = edgeTarget?.element || null;
      forcedIntent = edgeTarget?.intent || null;
      targetEntry = geometry?.markdownCandidateByElement?.get(target) || null;
    }
    let verticalSide = null;
    if (!target) {
      const verticalTarget = this.markdownVerticalDropTarget(clientX, clientY, movingElements);
      target = verticalTarget?.element || null;
      verticalSide = verticalTarget?.side || null;
      targetEntry = geometry?.markdownCandidateByElement?.get(target) || null;
    }
    if (!target) {
      const movingList = Array.from(movingElements);
      const stack = activeDocument.elementsFromPoint?.(clientX, clientY) || [activeDocument.elementFromPoint?.(clientX, clientY)];
      for (const candidate of stack) {
        const editable = findEditableTarget(candidate, this.previewEl, { x: clientX, y: clientY });
        if (!editable || movingElements.has(editable) || movingList.some((element) => element.contains?.(editable) || editable.contains?.(element))) {
          continue;
        }
        const targetFile = this.plugin.resolveEditableFile(editable, this.file);
        if (normalizeVaultPath(targetFile?.path) === normalizeVaultPath(this.file?.path)) {
          target = editable;
          break;
        }
      }
    }
    if (!target) {
      return this.dragMarkdownLastValidDrop ? { ...this.dragMarkdownLastValidDrop } : null;
    }
    const rect = targetEntry?.rect || this.markdownElementVisibleClientRect(target);
    if (!rect) {
      return this.dragMarkdownLastValidDrop ? { ...this.dragMarkdownLastValidDrop } : null;
    }
    const row = this.markdownDropRowMetrics(target, movingElements);
    const horizontalRoom = row.canFit
      && Number(target.parentElement?.clientWidth || rect.width) >= Math.max(300, row.totalCount * 120);
    const intent = forcedIntent || resolveDragDropHorizontalIntent({
      clientX,
      targetLeft: rect.left,
      targetRight: rect.right,
      laneLeft: geometry?.laneRect?.left ?? rect.left,
      laneRight: geometry?.laneRect?.right ?? rect.right,
      draggedLeft: this.draggedSelectionClientLeft(),
      horizontalRoom
    });
    let side = verticalSide || (clientY >= rect.top + rect.height / 2 ? "after" : "before");
    if (horizontalRoom && intent === "inline-right") {
      side = "right";
    } else if (horizontalRoom && intent === "line-start") {
      side = "left";
    }
    if (target !== this.dragMarkdownDropTarget || side !== this.dragMarkdownDropSide) {
      this.clearMarkdownBlockDropTarget();
      this.dragMarkdownDropTarget = target;
      this.dragMarkdownDropSide = side;
      target.addClass(`notedraw-text-sort-target-${side}`);
    }
    const previous = this.dragMarkdownLastValidDrop;
    const drop = previous?.element === target && previous?.side === side
      ? previous
      : this.captureMarkdownBlockDropTarget(target, side, row);
    this.dragMarkdownLastValidDrop = drop;
    return drop ? { ...drop } : null;
  }
  markdownDropRowMetrics(target, movingElements = /* @__PURE__ */ new Set()) {
    const geometry = this.draggingStroke ? this.dragDropGeometry : null;
    const cached = geometry?.rowMetrics?.get(target);
    if (cached) {
      return cached;
    }
    const movingCount = Math.max(1, movingElements.size || this.dragMarkdownOriginalElements?.size || 1);
    const targetRect = geometry?.markdownCandidateByElement?.get(target)?.rect || target?.getBoundingClientRect?.();
    const parent = target?.parentElement;
    let baseUsed = 0;
    let existingCount = 0;
    if (parent && targetRect?.height > 0) {
      const blockRecords = geometry?.markdownBlockRecords || new Map(this.markdownBlockRecords().map((item) => [item.id, item]));
      for (const [id, element] of this.markdownBlockElements.entries()) {
        if (!element?.isConnected || element === target || movingElements.has(element) || element.parentElement !== parent) {
          continue;
        }
        const rect = geometry?.markdownCandidateByElement?.get(element)?.rect || element.getBoundingClientRect();
        if (Math.abs(rect.top - targetRect.top) > Math.max(3, Math.min(rect.height, targetRect.height) * 0.2)) {
          continue;
        }
        const block = blockRecords.get(id);
        if (!block || block.floating) {
          continue;
        }
        baseUsed += clamp(Math.round(Number(block.span) || 12), 2, 12);
        existingCount += 1;
      }
    }
    const itemCount = movingCount + 1;
    const available = Math.max(0, 12 - baseUsed);
    const totalCount = existingCount + itemCount;
    const canFit = totalCount <= 4 && available >= itemCount * 2;
    const result = {
      canFit,
      span: canFit ? Math.max(2, Math.floor(available / itemCount)) : 12,
      totalCount
    };
    geometry?.rowMetrics?.set(target, result);
    return result;
  }
  async commitDraggedMarkdownBlocks(drop, drawingHistoryBefore) {
    const moving = Array.isArray(drop?.moving) ? drop.moving.filter((state) => state?.element && state?.block) : [];
    const target = drop?.element;
    const textCommitted = await Promise.resolve(drop?.textCommit).catch(() => false);
    if (!moving.length || !target || moving.some((state) => state.element === target)) {
      this.recordDrawingHistory(drawingHistoryBefore);
      return false;
    }
    if (textCommitted === false) {
      this.recordDrawingHistory(drawingHistoryBefore);
      return false;
    }
    const file = this.file;
    if (normalizeVaultPath(drop?.path) !== normalizeVaultPath(file?.path)) {
      this.recordDrawingHistory(drawingHistoryBefore);
      return false;
    }
    const lockedTarget = await Promise.resolve(drop?.lockedTargetPromise).catch(() => null);
    if (!lockedTarget) {
      this.recordDrawingHistory(drawingHistoryBefore);
      return false;
    }
    const lockedMovingTargets = await Promise.all(moving.map((state) => {
      return Promise.resolve(state.lockedTargetPromise).catch(() => null);
    }));
    if (lockedMovingTargets.some((target) => !target)) {
      this.recordDrawingHistory(drawingHistoryBefore);
      return false;
    }
    const targetState = {
      lockedTarget,
      lockedMovingTargets,
      strictMoving: true,
      strictTarget: true,
      targetText: drop.targetText
    };
    const targetBlock = this.markdownBlockRecords().find((block) => block.id === drop.blockId)
      || this.ensureMarkdownBlockRecord(target);
    const originalTargetSpan = targetBlock?.span || 12;
    const originalTargetWidthScale = normalizeMarkdownBlockWidthScale(targetBlock?.widthScale);
    const originalTargetLineStart = targetBlock?.lineStart;
    const originalTargetLineEnd = targetBlock?.lineEnd;
    if (targetBlock && Number.isFinite(lockedTarget.line)) {
      targetBlock.lineStart = lockedTarget.line;
      targetBlock.lineEnd = lockedTarget.endLine ?? lockedTarget.line;
    }
    const row = drop.row || this.markdownDropRowMetrics(target, new Set(moving.map((state) => state.element)));
    const requestedHorizontal = drop.side === "left" || drop.side === "right";
    const horizontal = requestedHorizontal && row.canFit;
    const effectiveSide = horizontal ? drop.side : drop.side === "right" ? "after" : drop.side === "left" ? "before" : drop.side;
    if (horizontal && targetBlock) {
      const span = row.span;
      targetBlock.span = span;
      targetBlock.widthScale = 1;
      for (const state of moving) {
        state.block.span = span;
        state.block.widthScale = 1;
        state.block.floating = false;
        state.block.floatingExplicit = false;
        state.block.floatBox = null;
      }
    } else {
      for (const state of moving) {
        state.block.span = 12;
        state.block.widthScale = 1;
        state.block.floating = false;
        state.block.floatingExplicit = false;
        state.block.floatBox = null;
      }
    }
    const result = await this.plugin.reorderTextBlocks(
      file,
      moving,
      target,
      effectiveSide === "after" || effectiveSide === "right",
      targetState
    );
    if (!result) {
      if (targetBlock) {
        targetBlock.span = originalTargetSpan;
        targetBlock.widthScale = originalTargetWidthScale;
        targetBlock.lineStart = originalTargetLineStart;
        targetBlock.lineEnd = originalTargetLineEnd;
      }
      for (const state of moving) {
        state.block.span = state.span;
        state.block.widthScale = state.widthScale;
        state.block.floating = Boolean(state.floatBox);
        state.block.floatingExplicit = Boolean(state.floatingExplicit);
        state.block.floatBox = state.floatBox ? { ...state.floatBox } : null;
      }
      this.recordDrawingHistory(drawingHistoryBefore);
      this.render();
      return false;
    }
    this.redoStack = [];
    this.plugin.scheduleDrawingSave(file, this.drawingData, { userOperation: true });
    this.recordCompoundHistory(file, result.before, result.after, drawingHistoryBefore);
    if (this.selectionFrameAwaitingMarkdownSync) {
      this.selectionFrameAwaitingMarkdownSync.committed = true;
    }
    const hasNoteFlow = this.hasNoteFlowElements();
    if (hasNoteFlow) {
      // Mark the operation first so the annotation pass can perform one
      // deferred NoteFlow layout after Obsidian has rebuilt the Markdown DOM.
      this.scheduleNoteFlowLayout({ operation: true, defer: true });
    }
    this.scheduleMarkdownAnnotationRefresh({ layout: hasNoteFlow, delay: 48, force: true });
    this.scheduleResize({ layout: false, measure: true });
    this.requestRender(this.selectionHasDomStrokes() ? "interaction" : false);
    return true;
  }
  updateDraggedElementGroupMembership(event, strokeIndexes, markdownBlocks) {
    const point = this.pointToCanvas(this.eventToPoint(event));
    const selectedGroupIds = new Set([
      ...strokeIndexes.map((index) => this.drawingData.strokes[index]?.groupId),
      ...markdownBlocks.map((block) => block?.groupId)
    ].filter(Boolean));
    const wholeGroups = new Set(Array.from(selectedGroupIds).filter((id) => this.isElementGroupFullySelected(id)));
    let destination = null;
    for (const group of this.elementGroupRecords().filter((item) => item.boxed)) {
      if (wholeGroups.has(group.id)) {
        continue;
      }
      const bounds = this.dragElementGroupBounds?.get(group.id) || this.getElementGroupBounds(group.id);
      if (bounds && point.x >= bounds.minX - 10 && point.x <= bounds.maxX + 10 && point.y >= bounds.minY - 10 && point.y <= bounds.maxY + 10) {
        destination = group;
        break;
      }
    }
    const updateItem = (item) => {
      if (!item || wholeGroups.has(item.groupId)) {
        return;
      }
      if (destination) {
        item.groupId = destination.id;
        item.locked = true;
        return;
      }
      if (item.groupId) {
        const originalBounds = this.dragElementGroupBounds?.get(item.groupId);
        const remainsInside = originalBounds && point.x >= originalBounds.minX - 10 && point.x <= originalBounds.maxX + 10 && point.y >= originalBounds.minY - 10 && point.y <= originalBounds.maxY + 10;
        if (!remainsInside) {
          item.groupId = "";
          item.locked = false;
        }
      }
    };
    strokeIndexes.forEach((index) => updateItem(this.drawingData.strokes[index]));
    markdownBlocks.forEach(updateItem);
    this.pruneElementGroups();
  }
  updateDraggedFloatingMarkdownBlocks(event, createFloating = false) {
    if (!this.dragMarkdownOriginalElements?.size || !this.pointerStartClient) {
      return false;
    }
    const canvasRect = this.canvas?.getBoundingClientRect?.();
    if (!canvasRect?.width || !canvasRect?.height) {
      return false;
    }
    const dx = (event.clientX - this.pointerStartClient.x) / canvasRect.width;
    const canvasDy = (event.clientY - this.pointerStartClient.y) * this.canvasRenderHeight / canvasRect.height;
    const dy = canvasDy / this.canvasHeight();
    let changed = false;
    for (const state of this.dragMarkdownOriginalElements.values()) {
      let sourceBox = state.floatBox;
      if (!sourceBox && createFloating && state.canvasBounds) {
        sourceBox = normalizeMarkdownFloatBox({
          x: state.canvasBounds.minX / this.canvasWidth(),
          y: state.canvasBounds.minY / this.canvasHeight(),
          width: (state.canvasBounds.maxX - state.canvasBounds.minX) / this.canvasWidth(),
          height: (state.canvasBounds.maxY - state.canvasBounds.minY) / this.canvasHeight()
        });
      }
      if (!sourceBox) {
        continue;
      }
      state.block.floating = true;
      state.block.floatBox = normalizeMarkdownFloatBox({
        ...sourceBox,
        x: sourceBox.x + dx,
        y: sourceBox.y + dy
      });
      changed = true;
    }
    return changed;
  }
  applyDraggedEdgeInsertion(event, strokeIndexes) {
    const selectedIndexes = new Set(strokeIndexes);
    const point = this.eventToPoint(event);
    const hit = this.pointToCanvas(point);
    let targetBounds = null;
    for (let index = this.drawingData.strokes.length - 1; index >= 0; index -= 1) {
      if (selectedIndexes.has(index)) {
        continue;
      }
      const bounds = getStrokeBounds(this.drawingData.strokes[index], this.canvasWidth(), this.canvasHeight());
      if (bounds && hit.x >= bounds.minX && hit.x <= bounds.maxX && hit.y >= bounds.minY && hit.y <= bounds.maxY) {
        targetBounds = bounds;
        break;
      }
    }
    if (!targetBounds) {
      const stack = activeDocument.elementsFromPoint?.(event.clientX, event.clientY) || [];
      for (const candidate of stack) {
        const editable = findEditableTarget(candidate, this.previewEl, { x: event.clientX, y: event.clientY });
        if (!editable || Array.from(this.dragMarkdownOriginalElements?.values?.() || []).some((state) => state.element === editable)) {
          continue;
        }
        targetBounds = this.markdownElementCanvasBounds(editable);
        if (targetBounds) {
          break;
        }
      }
    }
    if (!targetBounds || targetBounds.maxX - targetBounds.minX < 80) {
      return false;
    }
    const ratioX = (hit.x - targetBounds.minX) / Math.max(1, targetBounds.maxX - targetBounds.minX);
    if (ratioX > 0.34 && ratioX < 0.66) {
      return false;
    }
    const selectedBounds = this.getSelectedStrokeBounds();
    if (!selectedBounds) {
      return false;
    }
    const gap = 10;
    const dx = ratioX <= 0.34
      ? targetBounds.minX - gap - selectedBounds.maxX
      : targetBounds.maxX + gap - selectedBounds.minX;
    const dy = targetBounds.minY - selectedBounds.minY;
    const normalizedDx = dx / this.canvasWidth();
    const normalizedDy = dy / this.canvasHeight();
    for (const index of strokeIndexes) {
      const stroke = this.drawingData.strokes[index];
      if (!stroke) {
        continue;
      }
      stroke.points = stroke.points.map((strokePoint) => ({
        ...strokePoint,
        x: clamp(strokePoint.x + normalizedDx, 0, 1),
        y: clamp(strokePoint.y + normalizedDy, 0, 1)
      }));
    }
    for (const state of this.dragMarkdownOriginalElements?.values?.() || []) {
      const box = state.block.floating && state.block.floatBox ? state.block.floatBox : null;
      if (!box) {
        continue;
      }
      state.block.floating = true;
      state.block.floatBox = normalizeMarkdownFloatBox({ ...box, x: box.x + normalizedDx, y: box.y + normalizedDy });
    }
    return true;
  }
  selectRelatedElements() {
    const selectedIndexes = this.getSelectedStrokeIndexes();
    if (!selectedIndexes.length) {
      return false;
    }
    const strokes = this.drawingData?.strokes || [];
    const relatedIndexes = new Set(selectedIndexes);
    const relatedIds = this.connectorTargetIdsForStrokeIndexes(selectedIndexes);
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < strokes.length; index += 1) {
        const stroke = strokes[index];
        const elementId = strokeElementId(stroke);
        const connector = normalizeConnector(stroke?.connector);
        const connectorMatches = connector && (relatedIds.has(connector.fromId) || relatedIds.has(connector.toId));
        const elementMatches = elementId && relatedIds.has(elementId);
        if (!connectorMatches && !elementMatches) {
          continue;
        }
        if (!relatedIndexes.has(index)) {
          relatedIndexes.add(index);
          changed = true;
        }
        if (elementId && !relatedIds.has(elementId)) {
          relatedIds.add(elementId);
          changed = true;
        }
        if (connector?.fromId && !relatedIds.has(connector.fromId)) {
          relatedIds.add(connector.fromId);
          changed = true;
        }
        if (connector?.toId && !relatedIds.has(connector.toId)) {
          relatedIds.add(connector.toId);
          changed = true;
        }
      }
    }
    this.setSelectedStrokes(Array.from(relatedIndexes).sort((a, b) => a - b));
    this.showSelectionMenu();
    this.render();
    return true;
  }
  dragEventToPoint(event) {
    const geometry = this.dragStrokePointerGeometry || this.captureCanvasPointerGeometry();
    const mapped = mapClientPointToCanvas(event, geometry);
    return {
      x: clamp(mapped.canvasX / Math.max(1, mapped.canvasWidth), 0, 1),
      y: clamp(mapped.canvasY / Math.max(1, mapped.canvasHeight), 0, 1)
    };
  }
  moveSelectedStroke(event) {
    if (!this.dragStrokeStartPoint || !this.dragStrokeOriginalPoints?.size && !this.dragMarkdownOriginalElements?.size) {
      return;
    }
    if (this.dragLastPointerEvent === event) {
      return;
    }
    const pointerKey = [
      event.pointerId,
      event.clientX,
      event.clientY,
      event.timeStamp
    ].join(":");
    if (this.dragLastPointerKey === pointerKey) {
      return;
    }
    this.dragLastPointerEvent = event;
    this.dragLastPointerKey = pointerKey;
    const point = this.dragEventToPoint(event);
    const originalPointBounds = this.dragStrokeOriginalPointBounds;
    const minX = originalPointBounds?.minX ?? 0;
    const maxX = originalPointBounds?.maxX ?? 1;
    const minY = originalPointBounds?.minY ?? 0;
    const maxY = originalPointBounds?.maxY ?? 1;
    const strokeIndexes = this.dragStrokeIndexes;
    let minimumDx = -minX;
    const laneRect = this.dragContentLaneRect;
    const canvasRect = this.dragStrokePointerGeometry?.rect;
    if (this.dragStrokeOriginalBounds && laneRect && canvasRect?.width > 0) {
      const laneLeft = (laneRect.left - canvasRect.left) / canvasRect.width;
      minimumDx = Math.max(minimumDx, laneLeft - this.dragStrokeOriginalBounds.minX);
    }
    const dx = clamp(point.x - this.dragStrokeStartPoint.x, Math.min(minimumDx, 1 - maxX), 1 - maxX);
    const dy = clamp(point.y - this.dragStrokeStartPoint.y, -minY, 1 - maxY);
    const movedDistance = pointDistanceOnCanvas(
      this.dragStrokeStartPoint,
      point,
      this.canvasWidth(),
      this.canvasHeight()
    );
    if (!this.dragStrokeMoved && movedDistance <= this.tapDistancePx()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!this.dragStrokeMoved) {
      this.dragStrokeMoved = true;
      this.clearSelectionLongPress();
      this.cancelResizeFrame();
      if (this.dragShouldSnap && !this.dragNoteFlowOriginalBounds?.size) {
        this.prepareDragSnapBounds(strokeIndexes);
      }
      this.prepareReadingBottomExtentForDrag();
    }
    this.extendReadingBottomExtentDuringDrag(event);
    const hasDraggedNoteFlow = Boolean(this.dragNoteFlowOriginalBounds?.size);
    let snappedDx = dx;
    let snappedDy = dy;
    if (!hasDraggedNoteFlow && this.dragShouldSnap && this.dragStrokeOriginalBounds) {
      const snap = this.computeSnapDeltaForNormalizedBounds(translateNormalizedBounds(this.dragStrokeOriginalBounds, dx, dy), strokeIndexes);
      snappedDx = clamp(dx + snap.dx, -minX, 1 - maxX);
      snappedDy = clamp(dy + snap.dy, -minY, 1 - maxY);
    }
    const previewDx = hasDraggedNoteFlow ? dx : snappedDx;
    const previewDy = hasDraggedNoteFlow ? dy : snappedDy;
    for (const [index, points] of this.dragStrokeOriginalPoints.entries()) {
      const stroke = this.drawingData.strokes[index];
      if (!stroke) {
        continue;
      }
      stroke.points = points.map((strokePoint) => ({
        ...strokePoint,
        x: clamp(strokePoint.x + previewDx, 0, 1),
        y: clamp(strokePoint.y + previewDy, 0, 1)
      }));
    }
    const localScaleX = canvasRect?.width > 0 ? canvasRect.width / Math.max(1, this.canvasWidth()) : 1;
    const localScaleY = canvasRect?.height > 0 ? canvasRect.height / Math.max(1, this.canvasRenderHeight) : 1;
    const rawClientDx = event.clientX - this.pointerStartClient.x;
    const minimumClientDx = this.dragMarkdownOriginalClientBounds && laneRect
      ? laneRect.left - this.dragMarkdownOriginalClientBounds.left
      : Number.NEGATIVE_INFINITY;
    const boundedClientDx = Math.max(rawClientDx, minimumClientDx);
    this.dragMarkdownClientDeltaX = Number.isFinite(boundedClientDx) ? boundedClientDx : rawClientDx;
    const clientDx = this.dragMarkdownClientDeltaX / Math.max(0.0001, localScaleX);
    const clientDy = (event.clientY - this.pointerStartClient.y) / Math.max(0.0001, localScaleY);
    for (const state of this.dragMarkdownOriginalElements?.values?.() || []) {
      setNoteDrawCssProps(state.element, {
        "--notedraw-md-drag-x": `${Math.round(clientDx)}px`,
        "--notedraw-md-drag-y": `${Math.round(clientDy)}px`
      });
    }
    if (this.dragHasBoxBackground) {
      this.invalidateStaticCache();
    }
    if (this.dragMarkdownOriginalElements?.size) {
      this.queueMarkdownBlockDropTarget(event.clientX, event.clientY);
    }
    if (this.dragMovedElementIds?.size) {
      this.dragPendingConnectorIds ||= new Set();
      for (const id of this.dragMovedElementIds) {
        this.dragPendingConnectorIds.add(id);
      }
    }
    if (this.usesDraggedNoteFlowPlacement()) {
      this.queueDraggedNoteFlowPlacement(event.clientX, event.clientY);
    } else {
      this.queueDraggedNoteFlowRefresh(strokeIndexes);
    }
    if (strokeIndexes.length || this.dragConnectorCandidates?.length || this.dragHasBoxBackground) {
      this.requestRender(this.selectionHasDomStrokes() ? "interaction" : false);
    }
    event.preventDefault();
    event.stopPropagation();
  }
  finishSelectedStrokeDrag(event) {
    this.clearSelectionLongPress();
    const didMove = this.dragStrokeMoved;
    let requestedDropPlacement = null;
    if (didMove && this.usesDraggedNoteFlowPlacement()) {
      if (this.dragNoteFlowDropFrameId !== null) {
        window.cancelAnimationFrame(this.dragNoteFlowDropFrameId);
        this.dragNoteFlowDropFrameId = null;
      }
      this.dragNoteFlowDropClientX = null;
      this.dragNoteFlowDropClientY = null;
      if (!this.dragNoteFlowPlacement) {
        this.updateDraggedNoteFlowPlacement(event.clientX, event.clientY);
      }
      requestedDropPlacement = this.dragNoteFlowPlacement ? {
        path: this.dragNoteFlowPlacement.path,
        line: this.dragNoteFlowPlacement.line,
        side: this.dragNoteFlowPlacement.side,
        horizontalSide: this.dragNoteFlowPlacement.horizontalSide,
        leftSnap: this.dragNoteFlowPlacement.leftSnap,
        boundary: this.dragNoteFlowPlacement.boundary,
        candidate: this.dragNoteFlowPlacement.candidate
      } : null;
    }
    this.clearDraggedNoteFlowPlacement();
    if (didMove && this.dragMarkdownOriginalElements?.size) {
      const visibleDrop = this.dragMarkdownDropTarget?.isConnected
        ? this.dragMarkdownLastValidDrop?.element === this.dragMarkdownDropTarget
          && this.dragMarkdownLastValidDrop?.side === this.dragMarkdownDropSide
          ? this.dragMarkdownLastValidDrop
          : this.captureMarkdownBlockDropTarget(
            this.dragMarkdownDropTarget,
            this.dragMarkdownDropSide,
            this.markdownDropRowMetrics(this.dragMarkdownDropTarget, new Set(
              Array.from(this.dragMarkdownOriginalElements.values()).map((state) => state.element)
            ))
          )
        : null;
      if (visibleDrop) {
        this.dragMarkdownLastValidDrop = visibleDrop;
        this.cancelMarkdownBlockDropFrame();
      } else if (!this.dragMarkdownLastValidDrop?.element?.isConnected) {
        this.flushMarkdownBlockDropTarget(event.clientX, event.clientY);
      }
    }
    const lastDrop = this.dragMarkdownLastValidDrop?.element?.isConnected
      ? this.dragMarkdownLastValidDrop
      : this.dragMarkdownDropTarget?.isConnected
        ? this.captureMarkdownBlockDropTarget(
          this.dragMarkdownDropTarget,
          this.dragMarkdownDropSide,
          this.markdownDropRowMetrics(this.dragMarkdownDropTarget, new Set(
            Array.from(this.dragMarkdownOriginalElements?.values?.() || []).map((state) => state.element)
          ))
        )
        : null;
    const markdownDrop = lastDrop ? {
      ...lastDrop,
      moving: Array.from(this.dragMarkdownOriginalElements?.values?.() || []),
      textCommit: this.dragMarkdownTextCommit
    } : null;
    if (didMove && markdownDrop) {
      this.selectionFrameAwaitingMarkdownSync = { committed: false };
      this.invalidateSelectionFrameSnapshot();
    }
    const drawingHistoryBefore = this.dragDrawingHistoryBefore;
    if (didMove) {
      const movedIndexes = Array.from(this.dragStrokeOriginalPoints?.keys() || []);
      const movedNoteFlowIndexes = this.draggedNoteFlowIndexes(movedIndexes);
      const affectsNoteFlow = movedNoteFlowIndexes.length > 0;
      if (!markdownDrop) {
        this.updateDraggedFloatingMarkdownBlocks(event, false);
      }
      if (movedIndexes.length && (!markdownDrop || markdownDrop.side === "left" || markdownDrop.side === "right")) {
        this.applyDraggedEdgeInsertion(event, movedIndexes);
      }
      this.updateDraggedElementGroupMembership(event, movedIndexes, Array.from(this.dragMarkdownOriginalElements?.values?.() || []).map((state) => state.block));
      this.invalidateStaticCache();
      if (affectsNoteFlow) {
        this.resetNoteFlowSettle();
        this.clearNoteFlowLayout();
        this.noteFlowAvoidanceAnchors.clear();
      }
      this.resetDragDropGeometry();
      const resolvedDropPlacement = affectsNoteFlow
        ? this.resolveDraggedNoteFlowPlacement(requestedDropPlacement, movedIndexes)
        : null;
      if (resolvedDropPlacement) {
        this.snapDraggedSelectionToNoteFlowPlacement(resolvedDropPlacement, movedIndexes);
      } else if (affectsNoteFlow) {
        for (const index of movedNoteFlowIndexes) {
          const originalPoints = this.dragStrokeOriginalPoints?.get(index);
          if (originalPoints?.length) {
            this.drawingData.strokes[index].points = originalPoints.map((point) => ({ ...point }));
          }
        }
      }
      const flowedIndexes = resolvedDropPlacement ? this.reflowNoteFlowElementsAfterDrag(movedIndexes, resolvedDropPlacement) : [];
      const affectedIndexes = Array.from(new Set([...movedIndexes, ...flowedIndexes]));
      const droppedNoteFlowIndexes = new Set(this.draggedNoteFlowIndexes(movedIndexes));
      for (const index of affectedIndexes) {
        const stroke = this.drawingData.strokes[index];
        if (stroke?.noteFlow?.enabled) {
          const rejectedDrop = droppedNoteFlowIndexes.has(index) && !resolvedDropPlacement;
          stroke.noteFlow = rejectedDrop
            ? { ...this.dragStrokeOriginalNoteFlows.get(index) }
            : this.captureNoteFlowAnchor(stroke, {
              placement: droppedNoteFlowIndexes.has(index) ? resolvedDropPlacement : null,
              preservePlacement: !droppedNoteFlowIndexes.has(index)
            });
        }
      }
      this.captureResponsiveAnchorsForIndexes(affectedIndexes);
      this.syncBoundConnectors({ elementIds: this.connectorTargetIdsForStrokeIndexes(affectedIndexes) });
      this.lastTextTap = null;
      this.redoStack = [];
      this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
      if (!markdownDrop) {
        this.recordDrawingHistory(drawingHistoryBefore, { knownChanged: true });
      }
      if (affectedIndexes.some((index) => this.drawingData.strokes[index]?.noteFlow?.enabled)) {
        this.scheduleNoteFlowLayout({ operation: true });
      }
    } else if (!this.dragStrokePreserveSelection && this.getSelectedStrokeIndexes().length > 1 && this.dragStrokeHitIndex >= 0) {
      this.setSelectedStrokes(this.dragStrokeHitIndex);
    }
    if (didMove) {
      this.settleReadingBottomExtent();
    }
    this.releasePointerCapture(event.pointerId);
    this.clearSelectedStrokeDragState();
    this.render();
    if (didMove && markdownDrop) {
      this.commitDraggedMarkdownBlocks(markdownDrop, drawingHistoryBefore).then((committed) => {
        if (!committed && this.selectionFrameAwaitingMarkdownSync) {
          this.selectionFrameAwaitingMarkdownSync = null;
          this.invalidateSelectionFrameSnapshot();
          this.captureSelectionFrameSnapshot({ force: true });
          this.render();
        }
      }).catch((error) => {
        this.selectionFrameAwaitingMarkdownSync = null;
        this.invalidateSelectionFrameSnapshot();
        this.captureSelectionFrameSnapshot({ force: true });
        this.render();
        console.error(`[${PLUGIN_ID}] Failed to move Markdown blocks`, error);
        this.recordDrawingHistory(drawingHistoryBefore, { knownChanged: true });
        new Notice(this.plugin.t("failedMoveMarkdownBlock"));
      });
    }
    event.preventDefault();
    event.stopPropagation();
  }
  cancelSelectedStrokeDrag(restoreOriginal = false) {
    this.clearSelectionLongPress();
    this.clearDraggedNoteFlowPlacement();
    const restoredDrag = Boolean(restoreOriginal && this.dragStrokeOriginalPoints?.size);
    if (restoredDrag) {
      this.resetNoteFlowSettle();
      this.clearNoteFlowLayout();
      for (const [index, points] of this.dragStrokeOriginalPoints.entries()) {
        const stroke = this.drawingData.strokes[index];
        if (stroke) {
          stroke.points = points.map((strokePoint) => ({ ...strokePoint }));
          const originalNoteFlow = this.dragStrokeOriginalNoteFlows?.get(index);
          stroke.noteFlow = originalNoteFlow ? { ...originalNoteFlow } : null;
        }
      }
    }
    if (this.activePointerId !== null) {
      this.releasePointerCapture(this.activePointerId);
    }
    this.clearSelectedStrokeDragState();
    if (restoredDrag) {
      this.scheduleNoteFlowLayout({ operation: true });
    }
    this.render();
  }
  clearSelectedStrokeDragState() {
    this.clearDraggedNoteFlowPlacement();
    this.cancelMarkdownBlockDropFrame();
    this.resetDragDropGeometry();
    this.draggingStroke = false;
    this.dragStrokeStartPoint = null;
    this.dragStrokePointerGeometry = null;
    this.dragStrokeOriginalPoints = null;
    this.dragStrokeOriginalPointBounds = null;
    this.dragStrokeIndexes = [];
    this.dragShouldSnap = false;
    this.dragStrokeOriginalNoteFlows = null;
    this.pendingDraggedNoteFlowIndexes.clear();
    this.dragStrokeOriginalBounds = null;
    this.dragStrokeMoved = false;
    this.dragStrokeHitIndex = -1;
    this.dragStrokePreserveSelection = false;
    for (const state of this.dragMarkdownOriginalElements?.values?.() || []) {
      state.element?.removeClass?.("is-notedraw-md-dragging");
      state.element?.style?.removeProperty("--notedraw-md-drag-x");
      state.element?.style?.removeProperty("--notedraw-md-drag-y");
    }
    this.dragMarkdownOriginalElements = null;
    this.dragMarkdownSourcePromise = null;
    this.dragMarkdownSourceIndexPromise = null;
    this.dragNoteFlowOriginalBounds = null;
    this.dragMarkdownOriginalClientBounds = null;
    this.dragMarkdownClientDeltaX = 0;
    this.dragContentLaneRect = null;
    this.dragMarkdownTextCommit = null;
    this.dragElementGroupBounds = null;
    this.dragSnapOtherBounds = null;
    this.dragSnapOtherXValues = null;
    this.dragSnapOtherYValues = null;
    this.dragMovedElementIds = null;
    this.dragPendingConnectorIds = null;
    this.dragConnectorCandidates = null;
    this.dragConnectorById = null;
    this.dragHasBoxBackground = false;
    this.dragLastPointerEvent = null;
    this.dragLastPointerKey = "";
    this.dragMarkdownLastValidDrop = null;
    this.clearMarkdownBlockDropTarget();
    this.dragDrawingHistoryBefore = null;
    this.pointerStartClient = null;
    this.activePointerId = null;
    this.previewEl.removeClass("is-moving-selection");
    this.captureSelectionFrameSnapshot({ force: true });
  }
  isReadingBottomExtentSurface() {
    return this.surfaceType === "preview" && !this.embeddedSurface && !this.workspaceSurface;
  }
  ensureReadingBottomSpacer() {
    if (!this.isReadingBottomExtentSurface()) {
      return null;
    }
    if (this.readingBottomSpacer?.isConnected) {
      return this.readingBottomSpacer;
    }
    const host = rootPreviewSizer(this.previewEl) || this.layoutMeasureEl || this.previewEl;
    if (!host?.appendChild) {
      return null;
    }
    const spacer = activeDocument.createElement("div");
    spacer.className = "notedraw-reading-bottom-spacer";
    spacer.setAttribute("aria-hidden", "true");
    host.appendChild(spacer);
    this.readingBottomSpacer = spacer;
    this.readingBottomSpacerHeight = 0;
    return spacer;
  }
  readingBottomBaseDocumentHeight() {
    const spacer = this.readingBottomSpacer;
    const host = spacer?.parentElement || rootPreviewSizer(this.previewEl) || this.layoutMeasureEl || this.previewEl;
    const total = Number(host?.scrollHeight || host?.offsetHeight || 0);
    return Math.max(Number(this.previewEl?.clientHeight || 0), total - Number(this.readingBottomSpacerHeight || 0));
  }
  setReadingBottomSpacerHeight(height, { resize = false } = {}) {
    const spacer = this.ensureReadingBottomSpacer();
    if (!spacer) {
      return false;
    }
    const next = clamp(Math.round(Number(height) || 0), 0, 2400);
    if (next === this.readingBottomSpacerHeight) {
      return false;
    }
    this.readingBottomSpacerHeight = next;
    spacer.style.height = `${next}px`;
    spacer.style.minHeight = `${next}px`;
    this.markNoteFlowLayoutMutation();
    if (resize) {
      this.resizeCanvas({ layout: false, measure: true, preserveAbsolutePlacement: true });
      this.render();
    } else {
      this.scheduleResize({ layout: false, measure: true, preserveAbsolutePlacement: true });
    }
    return true;
  }
  selectedReadingBottomDocumentY() {
    const indexes = this.getSelectedStrokeIndexes();
    if (!indexes.length) {
      return 0;
    }
    const height = this.canvasHeight();
    return Math.max(0, ...indexes.map((index) => {
      const bounds = getStrokeBounds(this.drawingData?.strokes?.[index], this.canvasWidth(), height);
      return bounds?.maxY || 0;
    }));
  }
  prepareReadingBottomExtentForDrag() {
    if (!this.isReadingBottomExtentSurface()) {
      return;
    }
    this.ensureReadingBottomSpacer();
    const baseHeight = this.readingBottomBaseDocumentHeight();
    const selectedBottom = this.selectedReadingBottomDocumentY();
    const needed = Math.max(0, selectedBottom - baseHeight + 48);
    if (needed > this.readingBottomSpacerHeight) {
      this.setReadingBottomSpacerHeight(Math.min(480, needed), { resize: true });
      this.readingBottomExtentResizeAt = Date.now();
    }
  }
  scrollReadingViewportBy(delta) {
    const amount = Number(delta) || 0;
    if (!amount || !this.scrollContainer) {
      return;
    }
    const root = activeDocument.scrollingElement || activeDocument.documentElement;
    if (this.scrollContainer === root || this.scrollContainer === activeDocument.body || this.scrollContainer === activeDocument.documentElement) {
      window.scrollBy?.(0, amount);
      return;
    }
    this.scrollContainer.scrollTop += amount;
  }
  extendReadingBottomExtentDuringDrag(event) {
    if (!this.isReadingBottomExtentSurface() || !event) {
      return;
    }
    const rect = this.scrollContainer?.getBoundingClientRect?.() || {
      top: 0,
      bottom: window.innerHeight || 0,
      height: window.innerHeight || 0
    };
    const edge = clamp(rect.height * 0.16, 56, 112);
    if (event.clientY < rect.bottom - edge) {
      return;
    }
    const now = Date.now();
    if (now - this.readingBottomExtentResizeAt > 90) {
      this.ensureReadingBottomSpacer();
      this.setReadingBottomSpacerHeight(this.readingBottomSpacerHeight + 220, { resize: true });
      this.readingBottomExtentResizeAt = now;
    }
    const intensity = clamp((event.clientY - (rect.bottom - edge)) / edge, 0, 1);
    this.scrollReadingViewportBy(4 + intensity * 14);
  }
  settleReadingBottomExtent() {
    if (!this.isReadingBottomExtentSurface() || !this.readingBottomSpacer) {
      return;
    }
    const baseHeight = this.readingBottomBaseDocumentHeight();
    const allBottom = Math.max(0, ...(this.drawingData?.strokes || []).filter((stroke) => this.isStrokeVisibleOnSurface(stroke)).map((stroke) => {
      const bounds = getStrokeBounds(stroke, this.canvasWidth(), this.canvasHeight());
      return bounds?.maxY || 0;
    }));
    const needed = Math.max(0, allBottom - baseHeight + 32);
    this.setReadingBottomSpacerHeight(needed, { resize: true });
    this.readingBottomExtentResizeAt = Date.now();
  }
  startSelectedStrokeResize(event, handle) {
    const indexes = this.getSelectedStrokeIndexes();
    const resizableIndexes = indexes.filter((index) => !this.drawingData.strokes[index]?.locked || Boolean(this.drawingData.strokes[index]?.groupId));
    const resizableMarkdownBlocks = this.getSelectedMarkdownBlocks().filter((block) => !block.locked || block.groupId);
    const bounds = this.getSelectedStrokeNormalizedBounds();
    if (!resizableIndexes.length && !resizableMarkdownBlocks.length || !bounds) {
      return;
    }
    this.endTextEdit();
    this.cancelResizeFrame();
    this.pointerDown = false;
    this.currentStroke = null;
    this.resizingSelection = true;
    this.resizeSelectionHandle = handle;
    this.resizeSelectionPointerGeometry = this.captureCanvasPointerGeometry();
    this.resizeSelectionStartClient = { x: event.clientX, y: event.clientY };
    const canvasRect = this.resizeSelectionPointerGeometry.rect;
    const scrollRect = this.scrollContainer?.getBoundingClientRect?.();
    const viewport = window.visualViewport;
    const viewportLeft = Number(viewport?.offsetLeft) || 0;
    const viewportTop = Number(viewport?.offsetTop) || 0;
    const viewportRight = viewportLeft + (Number(viewport?.width) || window.innerWidth || canvasRect.width);
    const viewportBottom = viewportTop + (Number(viewport?.height) || window.innerHeight || canvasRect.height);
    const visibleLeft = Math.max(canvasRect.left, Number(scrollRect?.left) || canvasRect.left, viewportLeft);
    const visibleRight = Math.min(canvasRect.left + canvasRect.width, Number(scrollRect?.right) || canvasRect.left + canvasRect.width, viewportRight);
    const visibleTop = Math.max(canvasRect.top, Number(scrollRect?.top) || canvasRect.top, viewportTop);
    const visibleBottom = Math.min(canvasRect.top + canvasRect.height, Number(scrollRect?.bottom) || canvasRect.top + canvasRect.height, viewportBottom);
    this.resizeSelectionClientBounds = {
      left: Math.min(event.clientX, visibleLeft),
      right: Math.max(event.clientX, visibleRight),
      top: Math.min(event.clientY, visibleTop),
      bottom: Math.max(event.clientY, visibleBottom)
    };
    this.resizeSelectionStartPoint = getSelectionResizeCorner(bounds, handle);
    this.resizeSelectionOriginalBounds = bounds;
    this.resizeSelectionPreviewBounds = { ...bounds };
    this.resizeSelectionOriginalStrokes = new Map(resizableIndexes.map((index) => [
      index,
      {
        width: this.drawingData.strokes[index].width || this.penWidth,
        fontSize: this.drawingData.strokes[index].fontSize || 18,
        textWidth: Number(this.drawingData.strokes[index].textWidth) > 0 ? Number(this.drawingData.strokes[index].textWidth) : null,
        previewWidth: this.drawingData.strokes[index].previewWidth || 260,
        previewHeight: this.drawingData.strokes[index].previewHeight || 160,
        points: this.drawingData.strokes[index].points.map((strokePoint) => ({ ...strokePoint }))
      }
    ]));
    this.resizeSelectionOriginalMarkdownBlocks = new Map(resizableMarkdownBlocks.map((block) => {
      const element = this.markdownBlockElement(block);
      const naturalHeight = this.markdownBlockNaturalHeight(element);
      const currentHeight = Math.max(
        naturalHeight,
        normalizeMarkdownBlockMinHeight(block.minHeight)
      );
      const elementRect = element?.getBoundingClientRect?.();
      const visualScaleY = canvasRect.height > 0
        ? canvasRect.height / Math.max(1, this.resizeSelectionPointerGeometry.canvasRenderHeight)
        : 1;
      const resizesFromBottom = handle === "se" || handle === "sw";
      const availableHeight = elementRect
        ? resizesFromBottom
          ? (this.resizeSelectionClientBounds.bottom - elementRect.top) / Math.max(0.0001, visualScaleY)
          : (elementRect.bottom - this.resizeSelectionClientBounds.top) / Math.max(0.0001, visualScaleY)
        : 2400;
      return [block.id, {
        block,
        span: block.span,
        widthScale: normalizeMarkdownBlockWidthScale(block.widthScale),
        minHeight: block.minHeight,
        naturalHeight,
        currentHeight,
        maxHeight: Math.max(naturalHeight, availableHeight),
        floating: block.floating,
        floatBox: block.floatBox ? { ...block.floatBox } : null
      }];
    }));
    this.resizeDrawingHistoryBefore = this.captureDrawingHistorySnapshot();
    this.resizeSelectionMoved = false;
    this.pointerStartClient = { x: event.clientX, y: event.clientY };
    this.activePointerId = event.pointerId;
    this.previewEl.addClass("is-resizing-selection");
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      void error;
    }
    event.preventDefault();
    event.stopPropagation();
  }
  moveSelectedStrokeResize(event) {
    if (!this.resizeSelectionOriginalBounds || !this.resizeSelectionOriginalStrokes?.size && !this.resizeSelectionOriginalMarkdownBlocks?.size || !this.resizeSelectionStartPoint) {
      return;
    }
    const point = this.resizeEventToPoint(event);
    const movedDistance = this.resizeSelectionStartClient
      ? pointerDistance(this.resizeSelectionStartClient, { x: event.clientX, y: event.clientY })
      : pointDistanceOnCanvas(this.resizeSelectionStartPoint, point, this.canvasWidth(), this.canvasHeight());
    if (!this.resizeSelectionMoved && movedDistance <= this.tapDistancePx()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!this.resizeSelectionMoved) {
      this.resizeSelectionMoved = true;
    }
    this.applySelectedStrokeResize(point);
    this.requestRender(this.selectionHasDomStrokes() ? "interaction" : false);
    event.preventDefault();
    event.stopPropagation();
  }
  resizeEventToPoint(event) {
    const geometry = this.resizeSelectionPointerGeometry;
    const startClient = this.resizeSelectionStartClient;
    const corner = this.resizeSelectionStartPoint;
    const point = mapResizeClientDeltaToPoint(event, {
      startClient,
      corner,
      geometry,
      clientBounds: this.resizeSelectionClientBounds
    });
    if (!point) {
      return this.eventToPoint(event, geometry);
    }
    return {
      ...corner,
      ...point
    };
  }
  applySelectedStrokeResize(point) {
    const bounds = this.resizeSelectionOriginalBounds;
    const handle = this.resizeSelectionHandle;
    const originalStrokes = this.resizeSelectionOriginalStrokes;
    const originalMarkdownBlocks = this.resizeSelectionOriginalMarkdownBlocks;
    if (!bounds || !handle || !originalStrokes?.size && !originalMarkdownBlocks?.size) {
      return;
    }
    const anchor = getSelectionResizeAnchor(bounds, handle);
    const corner = getSelectionResizeCorner(bounds, handle);
    const originalDx = corner.x - anchor.x;
    const originalDy = corner.y - anchor.y;
    let scaleX = originalDx === 0 ? 1 : (point.x - anchor.x) / originalDx;
    let scaleY = originalDy === 0 ? 1 : (point.y - anchor.y) / originalDy;
    ({ scaleX, scaleY } = resolveSelectionResizeScales({ scaleX, scaleY }));
    const markdownScaleLimits = Array.from(originalMarkdownBlocks?.values?.() || [])
      .filter((state) => !state.floating && Number(state.maxHeight) > 0)
      .map((state) => Number(state.maxHeight) / Math.max(1, Number(state.currentHeight) || 1));
    if (markdownScaleLimits.length) {
      scaleY = Math.min(scaleY, ...markdownScaleLimits);
    }
    scaleX = limitSelectionResizeScaleToCanvas(scaleX, bounds, anchor, "x");
    scaleY = limitSelectionResizeScaleToCanvas(scaleY, bounds, anchor, "y");
    this.resizeSelectionPreviewBounds = scaleNormalizedBoundsFromAnchor(bounds, anchor, scaleX, scaleY);
    const strokeScale = clamp((Math.abs(scaleX) + Math.abs(scaleY)) / 2, 0.2, 8);
    const nextByIndex = /* @__PURE__ */ new Map();
    for (const [index, original] of originalStrokes.entries()) {
      nextByIndex.set(index, {
        width: clamp((original.width || this.penWidth) * strokeScale, MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH),
        fontSize: clamp((original.fontSize || 18) * strokeScale, 10, 72),
        textWidth: Number(original.textWidth) > 0 ? clamp(original.textWidth * Math.abs(scaleX), 24, 900) : null,
        previewWidth: clamp((original.previewWidth || 260) * Math.abs(scaleX), 80, 900),
        previewHeight: clamp((original.previewHeight || 160) * Math.abs(scaleY), 40, 700),
        points: original.points.map((strokePoint) => ({
          ...strokePoint,
          x: anchor.x + (strokePoint.x - anchor.x) * scaleX,
          y: anchor.y + (strokePoint.y - anchor.y) * scaleY
        }))
      });
    }
    for (const [index, next] of nextByIndex.entries()) {
      const stroke = this.drawingData.strokes[index];
      if (!stroke) {
        continue;
      }
      stroke.width = next.width;
      if (isTextStroke(stroke)) {
        stroke.fontSize = next.fontSize;
        stroke.textWidth = next.textWidth;
      }
      if (isTextLikeStroke(stroke) || isEmbedStroke(stroke)) {
        stroke.previewWidth = next.previewWidth;
        stroke.previewHeight = next.previewHeight;
      }
      stroke.points = next.points.map((strokePoint) => ({
        ...strokePoint,
        x: clamp(strokePoint.x, 0, 1),
        y: clamp(strokePoint.y, 0, 1)
      }));
    }
    for (const state of originalMarkdownBlocks?.values?.() || []) {
      const block = state.block;
      if (state.floating && state.floatBox) {
        block.floating = true;
        block.floatBox = normalizeMarkdownFloatBox({
          x: anchor.x + (state.floatBox.x - anchor.x) * scaleX,
          y: state.floatBox.y,
          width: state.floatBox.width * Math.abs(scaleX),
          height: clamp(state.naturalHeight / Math.max(1, this.canvasHeight()), 0.02, 1)
        });
      } else {
        const originalWidthUnits = Math.max(2, Number(state.span) || 12)
          * normalizeMarkdownBlockWidthScale(state.widthScale);
        const desiredWidthUnits = clamp(originalWidthUnits * Math.abs(scaleX), 2, 12);
        const nextSpan = clamp(Math.ceil(desiredWidthUnits), 2, 12);
        block.span = nextSpan;
        block.widthScale = normalizeMarkdownBlockWidthScale(desiredWidthUnits / nextSpan);
        block.minHeight = resizeMarkdownBlockMinHeight({
          currentHeight: state.currentHeight,
          naturalHeight: state.naturalHeight,
          scaleY,
          maxHeight: state.maxHeight
        });
      }
    }
    const resizedGroupIds = new Set([
      ...Array.from(originalStrokes.keys()).map((index) => this.drawingData.strokes[index]?.groupId),
      ...Array.from(originalMarkdownBlocks?.values?.() || []).map((state) => state.block?.groupId)
    ].filter(Boolean));
    if (Array.from(resizedGroupIds).some((id) => {
      const group = this.elementGroup(id);
      return group?.boxed && group.backgroundColor;
    })) {
      this.invalidateStaticCache();
    }
    const resizedElementIds = this.connectorTargetIdsForStrokeIndexes(this.resizeSelectionOriginalStrokes.keys());
    if (this.syncBoundConnectors({ elementIds: resizedElementIds })) {
      this.invalidateStaticCache();
    }
    if (Array.from(this.resizeSelectionOriginalStrokes.keys()).some((index) => this.drawingData.strokes[index]?.noteFlow?.enabled)) {
      this.scheduleNoteFlowLayout({ operation: true });
    }
  }
  finishSelectedStrokeResize(event) {
    if (this.resizeSelectionMoved) {
      const resizedIndexes = Array.from(this.resizeSelectionOriginalStrokes?.keys() || []);
      this.captureResponsiveAnchorsForIndexes(resizedIndexes);
      this.syncBoundConnectors({ elementIds: this.connectorTargetIdsForStrokeIndexes(resizedIndexes) });
      this.redoStack = [];
      this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
      this.recordDrawingHistory(this.resizeDrawingHistoryBefore);
      if (resizedIndexes.some((index) => this.drawingData.strokes[index]?.noteFlow?.enabled)) {
        this.scheduleNoteFlowLayout({ operation: true });
      }
    } else {
      this.cancelSelectedStrokeResize(false);
    }
    this.releasePointerCapture(event.pointerId);
    this.clearSelectedStrokeResizeState();
    this.render();
    event.preventDefault();
    event.stopPropagation();
  }
  cancelSelectedStrokeResize(restoreOriginal = false) {
    if (restoreOriginal && this.resizeSelectionOriginalStrokes?.size) {
      for (const [index, original] of this.resizeSelectionOriginalStrokes.entries()) {
        const stroke = this.drawingData.strokes[index];
        if (stroke) {
          stroke.width = original.width;
          if (isTextStroke(stroke)) {
            stroke.fontSize = original.fontSize;
            stroke.textWidth = original.textWidth;
          }
          if (isTextLikeStroke(stroke) || isEmbedStroke(stroke)) {
            stroke.previewWidth = original.previewWidth;
            stroke.previewHeight = original.previewHeight;
          }
          stroke.points = original.points.map((strokePoint) => ({ ...strokePoint }));
        }
      }
    }
    if (restoreOriginal && this.resizeSelectionOriginalMarkdownBlocks?.size) {
      for (const state of this.resizeSelectionOriginalMarkdownBlocks.values()) {
        state.block.span = state.span;
        state.block.widthScale = state.widthScale;
        state.block.minHeight = state.minHeight;
        state.block.floating = state.floating;
        state.block.floatBox = state.floatBox ? { ...state.floatBox } : null;
      }
    }
    if (this.activePointerId !== null) {
      this.releasePointerCapture(this.activePointerId);
    }
    this.clearSelectedStrokeResizeState();
    this.render();
  }
  clearSelectedStrokeResizeState() {
    const needsGeometrySettle = this.resizingSelection;
    this.resizingSelection = false;
    this.resizeSelectionHandle = null;
    this.resizeSelectionStartPoint = null;
    this.resizeSelectionStartClient = null;
    this.resizeSelectionOriginalBounds = null;
    this.resizeSelectionPreviewBounds = null;
    this.resizeSelectionOriginalStrokes = null;
    this.resizeSelectionOriginalMarkdownBlocks = null;
    this.resizeSelectionPointerGeometry = null;
    this.resizeSelectionClientBounds = null;
    this.resizeSelectionMoved = false;
    this.resizeDrawingHistoryBefore = null;
    this.pointerStartClient = null;
    this.activePointerId = null;
    this.previewEl.removeClass("is-resizing-selection");
    this.captureSelectionFrameSnapshot({ force: true });
    if (needsGeometrySettle && !this.destroyed) {
      this.scheduleResize({ layout: false, measure: true });
    }
  }
  releasePointerCapture(pointerId) {
    try {
      if (this.canvas.hasPointerCapture?.(pointerId)) {
        this.canvas.releasePointerCapture(pointerId);
      }
    } catch (error) {
      void error;
    }
  }
  finalizeBrushVariant(stroke) {
    const variant = normalizeBrushVariant(stroke?.brush, stroke?.variant);
    stroke.variant = variant;
    if (stroke?.brush !== BRUSH_WATERCOLOR) {
      return;
    }
    if (variant === WATERCOLOR_VARIANT_STRAIGHT) {
      const straightened = straightenWatercolorPoints(stroke.points, {
        canvasWidth: this.canvasWidth(),
        canvasHeight: this.canvasHeight()
      });
      stroke.points = straightened.points;
      return;
    }
    if (variant === WATERCOLOR_VARIANT_TEXT) {
      this.snapWatercolorStrokeToTextLine(stroke);
    }
  }
  isTextHighlightStroke(stroke) {
    return stroke?.brush === BRUSH_WATERCOLOR && normalizeBrushVariant(stroke.brush, stroke.variant) === WATERCOLOR_VARIANT_TEXT;
  }
  prepareTextHighlightGesture(clientPoint) {
    this.textHighlightLineRects = collectTextLineRectsBelowCanvas(this.canvas, this.previewEl);
    this.textHighlightTarget = pickTextHighlightLine(this.textHighlightLineRects, [clientPoint]);
    if (this.textHighlightTarget && this.currentStroke) {
      this.alignTextHighlightStroke(this.currentStroke, this.textHighlightTarget);
    }
  }
  resetTextHighlightGesture() {
    this.textHighlightLineRects = [];
    this.textHighlightTarget = null;
  }
  snapTextHighlightPoint(point, clientPoint) {
    if (!this.isTextHighlightStroke(this.currentStroke)) {
      return point;
    }
    if (!this.textHighlightLineRects.length) {
      this.textHighlightLineRects = collectTextLineRectsBelowCanvas(this.canvas, this.previewEl);
    }
    if (!this.textHighlightTarget) {
      this.textHighlightTarget = pickTextHighlightLine(this.textHighlightLineRects, [clientPoint]);
      if (this.textHighlightTarget) {
        this.alignTextHighlightStroke(this.currentStroke, this.textHighlightTarget);
      }
    }
    return this.textHighlightTarget ? this.alignTextHighlightPoint(point, this.textHighlightTarget) : point;
  }
  alignTextHighlightPoint(point, lineRect) {
    const canvasRect = this.canvas?.getBoundingClientRect?.();
    if (!canvasRect || canvasRect.width <= 1 || canvasRect.height <= 1 || !lineRect) {
      return point;
    }
    const canvasWidth = this.canvasWidth();
    const scaleX = canvasRect.width / canvasWidth;
    const scaleY = canvasRect.height / Math.max(1, this.canvasRenderHeight);
    const canvasPoint = this.pointToCanvas(point);
    const clientX = canvasRect.left + canvasPoint.x * scaleX;
    const lineCenterY = lineRect.top + lineRect.height * 0.58;
    return {
      ...point,
      x: clamp((clamp(clientX, lineRect.left, lineRect.right) - canvasRect.left) / scaleX / canvasWidth, 0, 1),
      y: clamp(((lineCenterY - canvasRect.top) / scaleY + this.canvasWindowTop) / this.canvasHeight(), 0, 1)
    };
  }
  alignTextHighlightStroke(stroke, lineRect) {
    if (!stroke?.points?.length || !lineRect) {
      return false;
    }
    stroke.points = stroke.points.map((point) => this.alignTextHighlightPoint(point, lineRect));
    return true;
  }
  snapWatercolorStrokeToTextLine(stroke) {
    if (!stroke?.points?.length || !this.canvas) {
      return false;
    }
    const canvasRect = this.canvas.getBoundingClientRect();
    const canvasWidth = this.canvasWidth();
    const visibleHeight = Math.max(1, this.canvasRenderHeight);
    const scaleX = canvasRect.width > 0 ? canvasRect.width / canvasWidth : 1;
    const scaleY = canvasRect.height > 0 ? canvasRect.height / visibleHeight : 1;
    const clientPoints = stroke.points.map((point) => {
      const canvasPoint = this.pointToCanvas(point);
      return {
        x: canvasRect.left + canvasPoint.x * scaleX,
        y: canvasRect.top + (canvasPoint.y - this.canvasWindowTop) * scaleY
      };
    });
    const lineRects = this.textHighlightLineRects.length
      ? this.textHighlightLineRects
      : collectTextLineRectsBelowCanvas(this.canvas, this.previewEl);
    const lineRect = this.textHighlightTarget || pickTextHighlightLine(lineRects, clientPoints, {
      maxVerticalDistance: Math.max(36, Number(stroke.width || 0) * 1.5),
      maxHorizontalDistance: 160
    });
    if (!lineRect) {
      return false;
    }
    return this.alignTextHighlightStroke(stroke, lineRect);
  }
  addPointerSamples(event) {
    const samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : null;
    const events = samples?.length ? samples : [event];
    for (const sample of events) {
      if (this.pointerStartClient && pointerDistance(this.pointerStartClient, {
        x: sample.clientX,
        y: sample.clientY
      }) > this.tapDistancePx()) {
        this.didMove = true;
      }
      const point = this.eventToPoint(sample);
      this.addStrokePoint(this.snapTextHighlightPoint(point, { x: sample.clientX, y: sample.clientY }));
    }
  }
  addStrokePoint(point) {
    if (!this.currentStroke?.points?.length) {
      return;
    }
    const points = this.currentStroke.points;
    const from = points[points.length - 1];
    const distance = pointDistanceOnCanvas(from, point, this.canvasWidth(), this.canvasHeight());
    if (distance <= this.minPointDistancePx()) {
      return;
    }
    const steps = Math.max(1, Math.ceil(distance / this.interpolationStepPx()));
    for (let index = 1; index <= steps; index += 1) {
      const ratio = index / steps;
      points.push({
        x: from.x + (point.x - from.x) * ratio,
        y: from.y + (point.y - from.y) * ratio,
        t: Math.round(
          (Number.isFinite(Number(from.t)) ? Number(from.t) : Date.now()) +
          ((Number.isFinite(Number(point.t)) ? Number(point.t) : Date.now()) - (Number.isFinite(Number(from.t)) ? Number(from.t) : Date.now())) * ratio
        )
      });
    }
  }
  captureCanvasPointerGeometry() {
    const rect = this.canvas.getBoundingClientRect();
    return {
      rect: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      },
      canvasWidth: this.canvasWidth(),
      canvasHeight: this.canvasHeight(),
      canvasRenderHeight: this.canvasRenderHeight,
      canvasWindowTop: this.canvasWindowTop,
      responsiveLayoutContext: this.getResponsiveLayoutContext()
    };
  }
  eventToPoint(event, geometry = null) {
    const pointerGeometry = geometry || this.captureCanvasPointerGeometry();
    const mapped = mapClientPointToCanvas(event, pointerGeometry);
    const x = mapped.canvasX;
    const y = mapped.canvasY;
    const width = mapped.canvasWidth;
    const height = mapped.canvasHeight;
    const context = pointerGeometry.responsiveLayoutContext || this.getResponsiveLayoutContext();
    const lineLocation = this.captureLineLocation(x, y, context);
    return createResponsivePoint({
      canvasX: x,
      canvasY: y,
      canvasWidth: width,
      canvasHeight: height,
      frame: context.frame,
      sourcePath: lineLocation?.path || this.file?.path || "",
      linePosition: lineLocation?.line ?? null,
      time: Number.isFinite(Number(event.timeStamp)) ? Number(event.timeStamp) : Date.now()
    });
  }
  pointToCanvas(point) {
    return {
      x: point.x * this.canvasWidth(),
      y: point.y * this.canvasHeight()
    };
  }
  canvasWidth() {
    return Math.max(1, this.canvasCssWidth || this.canvas?.clientWidth || 1);
  }
  canvasHeight() {
    return Math.max(1, this.canvasCssHeight || this.canvas?.clientHeight || 1);
  }
  requestRender(refreshDom = false) {
    this.pendingDomRender = this.pendingDomRender || refreshDom === true;
    this.pendingInteractionRender = this.pendingInteractionRender || refreshDom === "interaction";
    if (this.renderFrameId !== null) {
      return;
    }
    this.renderFrameId = window.requestAnimationFrame(() => {
      this.renderFrameId = null;
      const shouldRefreshDom = this.pendingDomRender;
      const shouldRefreshInteraction = this.pendingInteractionRender;
      this.pendingDomRender = false;
      this.pendingInteractionRender = false;
      if (shouldRefreshDom) {
        this.render();
      } else if (shouldRefreshInteraction) {
        this.renderInteractionFrame();
      } else {
        this.renderCanvas();
      }
    });
  }
  cancelRenderFrame() {
    if (this.renderFrameId !== null) {
      window.cancelAnimationFrame(this.renderFrameId);
      this.renderFrameId = null;
    }
    this.pendingDomRender = false;
    this.pendingInteractionRender = false;
  }
  render() {
    if (!this.ctx) {
      return;
    }
    if (this.syncBoundConnectors()) {
      this.invalidateStaticCache();
    }
    this.applyWebEdits();
    this.syncMarkdownBlockPresentation();
    this.updateEmbedLayer();
    this.renderCanvas();
  }
  renderInteractionFrame() {
    if (!this.ctx) {
      return;
    }
    this.refreshMarkdownBlockPresentation();
    const embedIndexes = this.getSelectedStrokeIndexes().filter((index) => {
      const stroke = this.drawingData.strokes[index];
      return isEmbedStroke(stroke) || isRichTextStroke(stroke);
    });
    if (embedIndexes.length) {
      this.updateEmbedLayer({ indexes: embedIndexes });
    }
    this.renderCanvas();
  }
  syncPendingDraggedConnectors() {
    if (!this.dragPendingConnectorIds?.size || !this.dragMovedElementIds?.size) {
      return false;
    }
    this.dragPendingConnectorIds = null;
    return this.syncBoundConnectors({ elementIds: this.dragMovedElementIds });
  }
  renderCanvas() {
    if (!this.ctx) {
      return;
    }
    if (this.draggingStroke && this.syncPendingDraggedConnectors()) {
      this.invalidateStaticCache();
    }
    if (!this.drawingsVisible) {
      clearCanvasContext(this.ctx, this.canvas);
      clearCanvasContext(this.underlayCtx, this.underlayCanvas);
      clearCanvasContext(this.staticCtx, this.staticCanvas);
      return;
    }
    const selectedUnderlayMoving = (this.draggingStroke || this.resizingSelection) && this.getSelectedStrokeIndexes().some((index) => {
      return shouldPlaceStrokeBelowMarkdown(this.drawingData.strokes[index]);
    });
    const currentUnderlayDrawing = Boolean(this.currentStroke && this.didMove && shouldPlaceStrokeBelowMarkdown(this.currentStroke));
    if (selectedUnderlayMoving || currentUnderlayDrawing) {
      this.invalidateStaticCache();
    }
    clearCanvasContext(this.ctx, this.canvas);
    this.ensureStaticCache();
    this.drawElementGroups();
    for (const [index, stroke] of this.drawingData.strokes.entries()) {
      if (this.isStrokeVisibleOnSurface(stroke) && this.isStrokeSelected(index) && !shouldPlaceStrokeBelowMarkdown(stroke) && this.isStrokeInCanvasWindow(stroke)) {
        this.drawStroke(stroke, this.selectedStrokeAlpha());
      }
    }
    this.drawSelection();
    if (this.selectingStrokes && this.selectionStartPoint && this.selectionCurrentPoint) {
      this.drawSelectionDragRect(this.selectionStartPoint, this.selectionCurrentPoint);
    }
    if (this.currentStroke && this.didMove) {
      if (shouldPlaceStrokeBelowMarkdown(this.currentStroke)) {
        this.drawStrokeOn(this.underlayCtx, this.currentStroke);
      } else {
        this.drawStroke(this.currentStroke);
      }
    }
  }
  ensureStaticCache() {
    if (!this.staticCtx || !this.underlayCtx || !this.staticCacheDirty) {
      return;
    }
    clearCanvasContext(this.underlayCtx, this.underlayCanvas);
    clearCanvasContext(this.staticCtx, this.staticCanvas);
    this.drawElementGroupBackgrounds();
    for (const [index, stroke] of this.drawingData.strokes.entries()) {
      const belowMarkdown = shouldPlaceStrokeBelowMarkdown(stroke);
      if (!this.isStrokeVisibleOnSurface(stroke) || this.isStrokeSelected(index) && !belowMarkdown || !this.isStrokeInCanvasWindow(stroke)) {
        continue;
      }
      if (belowMarkdown) {
        this.drawStrokeOn(this.underlayCtx, stroke);
      } else {
        this.drawStrokeOn(this.staticCtx, stroke);
      }
    }
    this.staticCacheDirty = false;
    this.underlayCacheDirty = false;
  }
  invalidateStaticCache() {
    this.staticCacheDirty = true;
    this.underlayCacheDirty = true;
  }
  isStrokeInCanvasWindow(stroke) {
    const bounds = getStrokeBounds(stroke, this.canvasWidth(), this.canvasHeight());
    if (!bounds) {
      return false;
    }
    const padding = Math.max(32, Number(stroke.width || 0) + this.selectionHitPaddingPx());
    return rectsIntersect(bounds, {
      minX: -padding,
      minY: this.canvasWindowTop - padding,
      maxX: this.canvasWidth() + padding,
      maxY: this.canvasWindowTop + this.canvasRenderHeight + padding
    });
  }
  isStrokeVisibleOnSurface(stroke) {
    return shouldRenderStrokeOnSurface(stroke, this.surfaceType);
  }
  drawStroke(stroke, alpha = 1) {
    this.drawStrokeOn(this.ctx, stroke, alpha);
  }
  updateEmbedLayer(options = {}) {
    if (!this.embedLayer || !this.drawingData?.strokes) {
      return;
    }
    const scopedIndexes = Array.isArray(options.indexes)
      ? Array.from(new Set(options.indexes)).filter((index) => Number.isInteger(index) && index >= 0 && index < this.drawingData.strokes.length)
      : null;
    const entries = scopedIndexes
      ? scopedIndexes.map((index) => [index, this.drawingData.strokes[index]])
      : this.drawingData.strokes.entries();
    const liveKeys = /* @__PURE__ */ new Set();
    const width = this.canvasWidth();
    const height = this.canvasHeight();
    for (const [index, stroke] of entries) {
      if (!this.isStrokeVisibleOnSurface(stroke)) {
        continue;
      }
      if (!isEmbedStroke(stroke) && !isRichTextStroke(stroke)) {
        continue;
      }
      const belowMarkdown = shouldPlaceStrokeBelowMarkdown(stroke);
      if (belowMarkdown && isImageEmbedStroke(stroke)) {
        continue;
      }
      if (!stroke.points.length || this.floatingTextInput?.index === index) {
        continue;
      }
      const key = String(index);
      liveKeys.add(key);
      const bounds = getStrokeBounds(stroke, width, height);
      if (!bounds) {
        continue;
      }
      let node = this.embedNodes.get(key);
      const layer = belowMarkdown ? this.underlayEmbedLayer : this.embedLayer;
      if (!node) {
        node = layer.createDiv({ cls: "notedraw-embed" });
        this.embedNodes.set(key, node);
      } else if (node.parentElement !== layer) {
        layer.appendChild(node);
      }
      node.toggleClass("is-selected", this.isStrokeSelected(index));
      node.toggleClass("is-rich-text", isRichTextStroke(stroke));
      node.toggleClass("is-asset", isEmbedStroke(stroke));
      node.toggleClass("is-locked", Boolean(stroke.locked));
      node.toggleClass("is-mind-map-node", Boolean(normalizeMindMapNode(stroke.mindMapNode)));
      node.toggleClass("is-below-markdown", belowMarkdown);
      node.dataset.noteDrawStrokeIndex = key;
      const geometry = {
        left: `${Math.round(bounds.minX)}px`,
        top: `${Math.round(bounds.minY)}px`,
        width: `${Math.max(32, Math.round(bounds.maxX - bounds.minX))}px`,
        height: `${Math.max(28, Math.round(bounds.maxY - bounds.minY))}px`,
        opacity: String(clamp(Number(stroke.opacity ?? 1), 0, 1))
      };
      const geometryToken = `${geometry.left}|${geometry.top}|${geometry.width}|${geometry.height}|${geometry.opacity}|${stroke.color || "#64748b"}`;
      if (this.embedGeometryTokens.get(key) !== geometryToken) {
        this.embedGeometryTokens.set(key, geometryToken);
        setNoteDrawCssProps(node, { "--notedraw-node-color": stroke.color || "#64748b" });
        applyElementStyles(node, geometry);
      }
      this.renderEmbedNode(node, stroke, index);
    }
    if (!scopedIndexes) {
      for (const [key, node] of this.embedNodes.entries()) {
        if (!liveKeys.has(key)) {
          node.remove();
          this.embedNodes.delete(key);
          this.embedRenderTokens.delete(key);
          this.embedGeometryTokens.delete(key);
        }
      }
    }
  }
  renderEmbedNode(node, stroke, index) {
    const token = getEmbedRenderToken(stroke);
    const key = String(index);
    if (this.embedRenderTokens.get(key) === token) {
      return;
    }
    this.embedRenderTokens.set(key, token);
    node.empty();
    if (isRichTextStroke(stroke)) {
      this.renderRichTextEmbed(node, stroke).catch((error) => {
        console.error(`[${PLUGIN_ID}] Failed to render preview`, error);
        node.setText(String(stroke.text || ""));
      });
      return;
    }
    if (stroke.embedType === EMBED_IMAGE) {
      node.createEl("img", {
        attr: {
          alt: stroke.assetName || "Image",
          src: this.assetResourceUrl(stroke.assetPath || stroke.assetName)
        }
      });
      return;
    }
    if (stroke.embedType === EMBED_VIDEO) {
      node.createEl("video", {
        attr: {
          src: this.assetResourceUrl(stroke.assetPath || stroke.assetName),
          controls: "true",
          playsinline: "true"
        }
      });
      return;
    }
    const fileCard = node.createDiv({ cls: "notedraw-file-card" });
    const iconEl = fileCard.createSpan({ cls: "notedraw-file-icon" });
    setIcon(iconEl, "paperclip");
    const body = fileCard.createDiv({ cls: "notedraw-file-body" });
    body.createDiv({ cls: "notedraw-file-name", text: stroke.assetName || stroke.text || "Attachment" });
    body.createDiv({ cls: "notedraw-file-meta", text: formatBytes(stroke.assetSize) });
  }
  async renderRichTextEmbed(node, stroke) {
    const renderMode = normalizeTextRenderMode(stroke.render);
    const content = String(stroke.text || "");
    if (renderMode === TEXT_RENDER_HTML) {
      node.appendChild(sanitizeHTMLToDomSafe(content));
      await this.plugin.hydratePortableMarkdownResources(node, this.file.path);
      return;
    }
    if (renderMode === TEXT_RENDER_NOTE) {
      const noteContent = await this.resolveNotePreviewContent(content);
      await MarkdownRenderer.render(this.plugin.app, noteContent, node, this.file.path, this.plugin);
      return;
    }
    const sourcePath = normalizeMindMapNode(stroke.mindMapNode)?.sourcePath || this.file.path;
    await MarkdownRenderer.render(this.plugin.app, content, node, sourcePath, this.plugin);
    this.bindMindMapTaskInteractions(node, stroke);
  }
  bindMindMapTaskInteractions(node, stroke) {
    if (!normalizeMindMapNode(stroke.mindMapNode) || normalizeMindMapNode(stroke.mindMapNode)?.type !== "task") {
      return;
    }
    node.querySelectorAll?.("input.task-list-item-checkbox, input[type='checkbox']").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const nextChecked = Boolean(checkbox.checked);
        const currentText = String(stroke.text || "");
        const nextText = currentText.replace(/(\[[ xX]\])/, nextChecked ? "[x]" : "[ ]");
        if (nextText === currentText) {
          return;
        }
        const historyBefore = this.captureDrawingHistorySnapshot();
        stroke.text = nextText;
        this.redoStack = [];
        this.invalidateStaticCache();
        this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
        this.render();
        if (normalizeMindMapNode(stroke.mindMapNode)?.affectsSource) {
          this.textCommitBarrier.track(this.syncMindMapNodeToSource(stroke, nextText.replace(/^\s*(?:[-+*]|\d+[.)])\s+/, ""), { drawingBefore: historyBefore }));
        } else {
          this.recordDrawingHistory(historyBefore);
        }
      });
    });
  }
  async resolveNotePreviewContent(text) {
    const link = String(text || "").trim();
    const normalized = unwrapWikiLink(link);
    const file = this.plugin.app.metadataCache.getFirstLinkpathDest(normalized, this.file.path) || getVaultFileByPath(this.plugin.app.vault, normalized);
    if (file) {
      return this.plugin.app.vault.cachedRead(file);
    }
    const portable = this.plugin.portableResource(this.file, normalized || link);
    if (portable && (String(portable.mime || "").startsWith("text/") || /\.md$/i.test(portable.name || ""))) {
      return portableResourceText(portable);
    }
    return `> ${link || "Note not found"}`;
  }
  assetResourceUrl(assetPath) {
    if (!assetPath) {
      return "";
    }
    const portable = this.plugin.portableResourceUrl(this.file, assetPath);
    if (portable) {
      return portable;
    }
    try {
      return this.plugin.app.vault.adapter.getResourcePath(normalizeVaultPath(assetPath));
    } catch (error) {
      void error;
      return "";
    }
  }
  drawStrokeOn(ctx, stroke, alpha = 1) {
    if (!stroke.points.length) {
      return;
    }
    if (isConnectorStroke(stroke)) {
      this.drawBoundConnectorOn(ctx, stroke, alpha);
      return;
    }
    if (isImageEmbedStroke(stroke)) {
      this.drawImageStrokeOn(ctx, stroke);
      return;
    }
    if (isEmbedStroke(stroke) || isRichTextStroke(stroke)) {
      return;
    }
    if (isTextStroke(stroke)) {
      this.drawTextStrokeOn(ctx, stroke, alpha);
      return;
    }
    if ((stroke.brush || BRUSH_PEN) === BRUSH_WATERCOLOR) {
      this.drawWatercolorStrokeOn(ctx, stroke, alpha);
      return;
    }
    if ([PEN_VARIANT_FOUNTAIN, PEN_VARIANT_NOTE].includes(normalizeBrushVariant(BRUSH_PEN, stroke.variant))) {
      this.drawFountainPenStrokeOn(ctx, stroke, alpha);
      return;
    }
    const count = clamp(Math.round(Number(stroke.count || 1)), 1, MAX_PEN_COUNT);
    const opacity = clamp(Number(stroke.opacity ?? DEFAULT_PEN_OPACITY), 0, 1);
    const offsets = getPenOffsets(count, stroke.width || this.penWidth);
    ctx.save();
    ctx.globalAlpha = alpha * opacity;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color || this.penColor;
    ctx.lineWidth = stroke.width || this.penWidth;
    for (const offset of offsets) {
      ctx.beginPath();
      const first = this.pointToCanvas(stroke.points[0]);
      ctx.moveTo(first.x + offset.x, first.y + offset.y);
      for (let pointIndex = 1; pointIndex < stroke.points.length; pointIndex += 1) {
        const next = this.pointToCanvas(stroke.points[pointIndex]);
        ctx.lineTo(next.x + offset.x, next.y + offset.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  syncBoundConnectors(options = {}) {
    const strokes = this.drawingData?.strokes || [];
    const recover = options.recover === true;
    const targetIds = options.elementIds instanceof Set ? options.elementIds : null;
    const useDragCache = this.draggingStroke && targetIds === this.dragMovedElementIds;
    let changed = recover ? this.ensureSnapElementIds() : false;
    const byId = options.byId instanceof Map
      ? options.byId
      : useDragCache && this.dragConnectorById instanceof Map
        ? this.dragConnectorById
        : new Map(strokes.map((stroke) => [strokeElementId(stroke), stroke]).filter(([id]) => id));
    const snapTargets = recover ? this.collectSnapTargets() : null;
    const connectorStrokes = Array.isArray(options.strokes)
      ? options.strokes
      : useDragCache && Array.isArray(this.dragConnectorCandidates)
        ? this.dragConnectorCandidates
        : strokes;
    for (const stroke of connectorStrokes) {
      let connector = normalizeConnector(stroke.connector);
      if (!connector) {
        continue;
      }
      if (targetIds && !targetIds.has(connector.fromId) && !targetIds.has(connector.toId)) {
        continue;
      }
      let fromBounds = getStrokeBounds(byId.get(connector.fromId), this.canvasWidth(), this.canvasHeight());
      let toBounds = getStrokeBounds(byId.get(connector.toId), this.canvasWidth(), this.canvasHeight());
      if (recover && !fromBounds && stroke.points?.[0]) {
        const recoveredId = this.findSnapElementIdAtPoint(stroke.points[0], toBounds ? connector.toId : "", snapTargets);
        if (recoveredId) {
          connector = { ...connector, fromId: recoveredId };
          fromBounds = getStrokeBounds(byId.get(recoveredId), this.canvasWidth(), this.canvasHeight());
        }
      }
      if (recover && !toBounds && stroke.points?.length) {
        const recoveredId = this.findSnapElementIdAtPoint(stroke.points[stroke.points.length - 1], fromBounds ? connector.fromId : "", snapTargets);
        if (recoveredId && recoveredId !== connector.fromId) {
          connector = { ...connector, toId: recoveredId };
          toBounds = getStrokeBounds(byId.get(recoveredId), this.canvasWidth(), this.canvasHeight());
        }
      }
      if (connector.fromId === connector.toId) {
        connector = { ...connector, toId: "" };
        toBounds = null;
      }
      if (stroke.connector?.fromId !== connector.fromId || stroke.connector?.toId !== connector.toId) {
        stroke.connector = connector;
        changed = true;
      }
      if (!fromBounds && !toBounds) {
        continue;
      }
      const nextPoints = buildSnappedConnectorPoints({
        fromBounds,
        toBounds,
        fromPoint: stroke.points?.[0],
        toPoint: stroke.points?.[stroke.points.length - 1],
        canvasWidth: this.canvasWidth(),
        canvasHeight: this.canvasHeight()
      });
      if (!sameStrokePointPath(stroke.points, nextPoints)) {
        stroke.points = nextPoints;
        changed = true;
      }
    }
    return changed;
  }
  drawBoundConnectorOn(ctx, stroke, alpha = 1) {
    if (!stroke.points?.length) {
      return;
    }
    const opacity = clamp(Number(stroke.opacity ?? 0.9), 0, 1);
    const width = clamp(Number(stroke.width || 2.25), 1, 8);
    const points = stroke.points.map((point) => this.pointToCanvas(point));
    ctx.save();
    ctx.globalAlpha = alpha * opacity;
    ctx.strokeStyle = stroke.color || "#64748b";
    ctx.fillStyle = stroke.color || "#64748b";
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    if (points.length === 3) {
      ctx.quadraticCurveTo(points[1].x, points[1].y, points[2].x, points[2].y);
    } else {
      for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index].x, points[index].y);
      }
    }
    ctx.stroke();
    const first = points[0];
    const last = points[points.length - 1];
    const previous = points.length === 3 ? points[1] : points[Math.max(0, points.length - 3)];
    const angle = Math.atan2(last.y - previous.y, last.x - previous.x);
    const arrowSize = Math.max(6, width * 3.4);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(last.x - Math.cos(angle - Math.PI / 6) * arrowSize, last.y - Math.sin(angle - Math.PI / 6) * arrowSize);
    ctx.lineTo(last.x - Math.cos(angle + Math.PI / 6) * arrowSize, last.y - Math.sin(angle + Math.PI / 6) * arrowSize);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(first.x, first.y, Math.max(2.2, width * 1.15), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  drawFountainPenStrokeOn(ctx, stroke, alpha = 1) {
    const segments = buildFountainPenSegments(stroke.points, {
      canvasWidth: this.canvasWidth(),
      canvasHeight: this.canvasHeight(),
      baseWidth: stroke.width || this.penWidth,
      baseOpacity: stroke.opacity ?? DEFAULT_PEN_OPACITY
    });
    if (!segments.length) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha * segments[0].opacity;
    ctx.fillStyle = stroke.color || this.penColor;
    const centers = [segments[0].from, ...segments.map((segment) => segment.to)].map((point) => this.pointToCanvas(point));
    const widths = [segments[0].fromWidth, ...segments.map((segment) => segment.toWidth)];
    const left = [];
    const right = [];
    for (let index = 0; index < centers.length; index += 1) {
      const previous = centers[Math.max(0, index - 1)];
      const next = centers[Math.min(centers.length - 1, index + 1)];
      const dx = next.x - previous.x;
      const dy = next.y - previous.y;
      const length = Math.max(0.001, Math.hypot(dx, dy));
      const radius = Math.max(0.04, Number(widths[index]) / 2);
      const normalX = -dy / length * radius;
      const normalY = dx / length * radius;
      left.push({ x: centers[index].x + normalX, y: centers[index].y + normalY });
      right.push({ x: centers[index].x - normalX, y: centers[index].y - normalY });
    }
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let index = 1; index < left.length - 1; index += 1) {
      const midpoint = {
        x: (left[index].x + left[index + 1].x) / 2,
        y: (left[index].y + left[index + 1].y) / 2
      };
      if (typeof ctx.quadraticCurveTo === "function") {
        ctx.quadraticCurveTo(left[index].x, left[index].y, midpoint.x, midpoint.y);
      } else {
        ctx.lineTo(midpoint.x, midpoint.y);
      }
    }
    ctx.lineTo(left.at(-1).x, left.at(-1).y);
    ctx.lineTo(right.at(-1).x, right.at(-1).y);
    for (let index = right.length - 2; index > 0; index -= 1) {
      const midpoint = {
        x: (right[index].x + right[index - 1].x) / 2,
        y: (right[index].y + right[index - 1].y) / 2
      };
      if (typeof ctx.quadraticCurveTo === "function") {
        ctx.quadraticCurveTo(right[index].x, right[index].y, midpoint.x, midpoint.y);
      } else {
        ctx.lineTo(midpoint.x, midpoint.y);
      }
    }
    ctx.lineTo(right[0].x, right[0].y);
    const start = centers[0];
    const firstNext = centers[1] || start;
    const startLength = Math.max(0.001, Math.hypot(firstNext.x - start.x, firstNext.y - start.y));
    const startRadius = Math.max(0.04, Number(widths[0]) / 2);
    const capX = start.x - (firstNext.x - start.x) / startLength * startRadius;
    const capY = start.y - (firstNext.y - start.y) / startLength * startRadius;
    if (typeof ctx.quadraticCurveTo === "function") {
      ctx.quadraticCurveTo(capX, capY, left[0].x, left[0].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = stroke.color || this.penColor;
    ctx.lineWidth = Math.max(0.7, Math.min(1.05, Number(stroke.width || this.penWidth) * 0.13));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(centers[0].x, centers[0].y);
    for (let index = 1; index < centers.length - 1; index += 1) {
      const midpoint = {
        x: (centers[index].x + centers[index + 1].x) / 2,
        y: (centers[index].y + centers[index + 1].y) / 2
      };
      if (typeof ctx.quadraticCurveTo === "function") {
        ctx.quadraticCurveTo(centers[index].x, centers[index].y, midpoint.x, midpoint.y);
      } else {
        ctx.lineTo(midpoint.x, midpoint.y);
      }
    }
    ctx.lineTo(centers.at(-1).x, centers.at(-1).y);
    ctx.stroke();
    ctx.restore();
  }
  drawImageStrokeOn(ctx, stroke) {
    const image = this.getCanvasImageForStroke(stroke);
    if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight) {
      return;
    }
    const bounds = getStrokeBounds(stroke, this.canvasWidth(), this.canvasHeight());
    if (!bounds) {
      return;
    }
    const x = Math.round(bounds.minX);
    const y = Math.round(bounds.minY);
    const width = Math.max(1, Math.round(bounds.maxX - bounds.minX));
    const height = Math.max(1, Math.round(bounds.maxY - bounds.minY));
    const fit = objectFitContain(image.naturalWidth, image.naturalHeight, width, height);
    ctx.save();
    ctx.globalAlpha = clamp(Number(stroke.opacity ?? 1), 0, 1);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, x + fit.x, y + fit.y, fit.width, fit.height);
    ctx.restore();
  }
  getCanvasImageForStroke(stroke) {
    const key = getImageStrokeCacheKey(stroke);
    if (!key) {
      return null;
    }
    const cached = this.canvasImageCache.get(key);
    if (cached?.image) {
      return cached.image;
    }
    const image = new Image();
    image.decoding = "sync";
    image.onload = () => {
      if (this.destroyed) {
        return;
      }
      this.invalidateStaticCache();
      this.requestRender();
    };
    image.onerror = () => {
      this.canvasImageCache.delete(key);
    };
    this.canvasImageCache.set(key, { image });
    const embedded = normalizeImageDataUrl(stroke.exportImageDataUrl);
    if (embedded) {
      image.src = embedded;
      return image;
    }
    this.plugin.assetDataUrl(stroke.assetPath, stroke.assetMime || guessMimeType(stroke.assetName || stroke.assetPath), this.file).then((dataUrl) => {
      if (this.destroyed) {
        return;
      }
      const state = this.canvasImageCache.get(key);
      if (state?.image === image && dataUrl) {
        image.src = dataUrl;
      }
    });
    return image;
  }
  drawTextStrokeOn(ctx, stroke, alpha = 1) {
    const text = String(stroke.text || "").trim();
    if (!text || !stroke.points.length) {
      return;
    }
    const point = this.pointToCanvas(stroke.points[0]);
    const fontSize = clamp(Number(stroke.fontSize || 18), 10, 72);
    const opacity = clamp(Number(stroke.opacity ?? 1), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha * opacity;
    ctx.font = `${stroke.bold ? "700 " : ""}${fontSize}px ${stroke.code ? "monospace" : "sans-serif"}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = stroke.color || this.penColor;
    const layout = getTextStrokeLayout(stroke, this.canvasWidth(), (value) => ctx.measureText(value).width);
    if (layout.paddingX || layout.paddingY) {
      const style = normalizeButtonStyle(stroke.buttonStyle);
      if (style === "solid") {
        ctx.fillStyle = stroke.color || this.penColor;
      } else if (style === "outline") {
        ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
      } else {
        ctx.fillStyle = stroke.code ? "rgba(127, 127, 127, 0.14)" : "rgba(255, 255, 255, 0.74)";
      }
      ctx.strokeStyle = stroke.color || this.penColor;
      ctx.lineWidth = 1.25;
      if (style === "circle") {
        ctx.beginPath();
        ctx.arc(point.x - layout.paddingX + layout.width / 2, point.y - layout.paddingY + layout.height / 2, layout.width / 2, 0, Math.PI * 2);
      } else {
        const radius = style === "pill" ? Math.min(999, layout.height / 2) : 6;
        roundRect(ctx, point.x - layout.paddingX, point.y - layout.paddingY, layout.width, layout.height, radius);
      }
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = normalizeButtonStyle(stroke.buttonStyle) === "solid" ? "#ffffff" : stroke.color || this.penColor;
    layout.lines.forEach((line, index) => {
      ctx.fillText(line, point.x, point.y + index * layout.lineHeight);
    });
    ctx.restore();
  }
  drawWatercolorStroke(stroke, alpha = 1) {
    this.drawWatercolorStrokeOn(this.ctx, stroke, alpha);
  }
  drawWatercolorStrokeOn(ctx, stroke, alpha = 1) {
    if (!stroke.points.length) {
      return;
    }
    const width = Math.max(MIN_BRUSH_WIDTH, stroke.width || this.penWidth);
    const opacity = clamp(Number(stroke.opacity ?? 0.45), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha * opacity;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = stroke.color || this.penColor;
    ctx.lineWidth = width;
    ctx.beginPath();
    const first = this.pointToCanvas(stroke.points[0]);
    ctx.moveTo(first.x, first.y);
    for (let pointIndex = 1; pointIndex < stroke.points.length; pointIndex += 1) {
      const next = this.pointToCanvas(stroke.points[pointIndex]);
      ctx.lineTo(next.x, next.y);
    }
    ctx.stroke();
    ctx.restore();
  }
  drawStrokeSegment(stroke, fromPoint, toPoint) {
    if (!fromPoint || !toPoint || !this.ctx) {
      return;
    }
    const from = this.pointToCanvas(fromPoint);
    const to = this.pointToCanvas(toPoint);
    this.ctx.save();
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.strokeStyle = stroke.color || this.penColor;
    this.ctx.lineWidth = stroke.width || this.penWidth;
    this.ctx.beginPath();
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();
    this.ctx.restore();
  }
  drawSelection() {
    if (!this.hasHybridSelection()) {
      return;
    }
    const frame = this.getSelectedFrameCanvasRect();
    if (!frame) {
      return;
    }
    const { x, y, width, height } = frame;
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(255, 193, 7, 0.95)";
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 4]);
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.setLineDash([]);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.strokeStyle = "rgba(255, 193, 7, 0.98)";
    this.ctx.lineWidth = 2;
    for (const handle of getSelectionHandlePointsFromRect({ x, y, width, height })) {
      this.ctx.fillRect(
        handle.x - SELECT_RESIZE_HANDLE_SIZE / 2,
        handle.y - SELECT_RESIZE_HANDLE_SIZE / 2,
        SELECT_RESIZE_HANDLE_SIZE,
        SELECT_RESIZE_HANDLE_SIZE
      );
      this.ctx.strokeRect(
        handle.x - SELECT_RESIZE_HANDLE_SIZE / 2,
        handle.y - SELECT_RESIZE_HANDLE_SIZE / 2,
        SELECT_RESIZE_HANDLE_SIZE,
        SELECT_RESIZE_HANDLE_SIZE
      );
    }
    this.ctx.restore();
  }
  drawElementGroups() {
    for (const group of this.elementGroupRecords().filter((item) => item.boxed)) {
      const bounds = this.getElementGroupBounds(group.id);
      if (!bounds) {
        continue;
      }
      const padding = 9;
      const x = bounds.minX - padding;
      const y = bounds.minY - padding;
      const width = bounds.maxX - bounds.minX + padding * 2;
      const height = bounds.maxY - bounds.minY + padding * 2;
      this.ctx.save();
      this.ctx.globalAlpha = 0.92;
      this.ctx.strokeStyle = group.borderColor || "#64748b";
      this.ctx.lineWidth = 2;
      roundRect(this.ctx, x, y, width, height, 6);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }
  drawElementGroupBackgrounds() {
    if (!this.underlayCtx) {
      return;
    }
    for (const group of this.elementGroupRecords().filter((item) => item.boxed && item.backgroundColor)) {
      const bounds = this.getElementGroupBounds(group.id);
      if (!bounds) {
        continue;
      }
      const padding = 9;
      this.underlayCtx.save();
      this.underlayCtx.globalAlpha = 0.14;
      this.underlayCtx.fillStyle = group.backgroundColor;
      roundRect(
        this.underlayCtx,
        bounds.minX - padding,
        bounds.minY - padding,
        bounds.maxX - bounds.minX + padding * 2,
        bounds.maxY - bounds.minY + padding * 2,
        6
      );
      this.underlayCtx.fill();
      this.underlayCtx.restore();
    }
  }
  drawSelectionDragRect(startPoint, endPoint) {
    const start = this.pointToCanvas(startPoint);
    const end = this.pointToCanvas(endPoint);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    this.ctx.save();
    this.ctx.strokeStyle = "rgba(96, 165, 250, 0.95)";
    this.ctx.fillStyle = "rgba(96, 165, 250, 0.12)";
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([5, 4]);
    this.ctx.fillRect(x, y, width, height);
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.restore();
  }
  findStrokeAt(point, clientPoint = null) {
    const hitPoint = this.pointToCanvas(point);
    const width = this.canvasWidth();
    const height = this.canvasHeight();
    let boxHit = -1;
    for (let index = this.drawingData.strokes.length - 1; index >= 0; index -= 1) {
      const stroke = this.drawingData.strokes[index];
      if (!this.isStrokeVisibleOnSurface(stroke)) {
        continue;
      }
      const padding = this.selectionHitPaddingPx();
      const threshold = Math.max(padding, (stroke.width || this.penWidth) / 2 + padding);
      const domNode = (isEmbedStroke(stroke) || isRichTextStroke(stroke))
        ? this.embedNodes?.get?.(String(index))
        : null;
      const domRect = domNode?.isConnected ? domNode.getBoundingClientRect?.() : null;
      const hit = domRect && clientPoint
        ? clientPointInRect(domRect, clientPoint)
        : strokeHitTest(stroke, hitPoint, width, height, threshold);
      if (!hit) {
        continue;
      }
      if (isTextLikeStroke(stroke) || isEmbedStroke(stroke)) {
        if (boxHit < 0) {
          boxHit = index;
        }
      } else {
        return index;
      }
    }
    return boxHit;
  }
  findNoteFlowOwnerStrokeIndex(record = {}) {
    const strokes = this.drawingData?.strokes || [];
    if (record.ownerId) {
      const exact = strokes.findIndex((stroke) => strokeElementId(stroke) === record.ownerId && this.isStrokeVisibleOnSurface(stroke));
      if (exact >= 0) {
        return exact;
      }
    }
    const path = normalizeVaultPath(record.path || this.file?.path || "");
    const line = Number(record.line);
    const side = record.side === "after" || record.property === "padding-bottom" ? "after" : "before";
    const matches = [];
    for (const [index, stroke] of strokes.entries()) {
      const flow = normalizeNoteFlow(stroke?.noteFlow);
      if (!flow || !this.isStrokeVisibleOnSurface(stroke)) {
        continue;
      }
      const bounds = getStrokeBounds(stroke, this.canvasWidth(), this.canvasHeight());
      const candidate = { index, bottom: bounds?.maxY || 0 };
      const avoidance = noteFlowAvoidanceReference(flow, this.file?.path || "");
      const anchorPath = normalizeVaultPath(flow.path || this.file?.path || "");
      const anchorLine = Number(flow.line);
      if (avoidance?.path === path && avoidance.line === line
        || anchorPath === path && anchorLine === line && (flow.side || "before") === side) {
        matches.push(candidate);
      }
    }
    matches.sort((a, b) => b.bottom - a.bottom || b.index - a.index);
    return matches[0]?.index ?? -1;
  }
  readingBottomOwnerStrokeIndex() {
    const ranked = (this.drawingData?.strokes || []).map((stroke, index) => ({ stroke, index })).filter(({ stroke }) => {
      return this.isStrokeVisibleOnSurface(stroke);
    }).map(({ stroke, index }) => ({
      index,
      bottom: getStrokeBounds(stroke, this.canvasWidth(), this.canvasHeight())?.maxY || 0
    })).sort((a, b) => b.bottom - a.bottom || b.index - a.index);
    return ranked[0]?.index ?? -1;
  }
  findOwnedBlankSpaceStrokeAtClientPoint(clientX, clientY) {
    if (!this.drawingsVisible || !this.drawingData) {
      return -1;
    }
    const candidates = [];
    for (const [element, states] of this.noteFlowStyledElements || []) {
      const rect = element?.getBoundingClientRect?.();
      if (!element?.isConnected || !rect || rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      const localHeight = Number(element.offsetHeight) || 0;
      const scale = localHeight > 0 ? rect.height / localHeight : this.readingZoomScale();
      for (const state of states.values()) {
        const ownerIndex = Number.isInteger(state.ownerStrokeIndex) && state.ownerStrokeIndex >= 0
          ? state.ownerStrokeIndex
          : this.findNoteFlowOwnerStrokeIndex(state.ownerRecord);
        const owner = this.drawingData.strokes[ownerIndex];
        if (ownerIndex < 0 || !owner || !this.isStrokeVisibleOnSurface(owner)) {
          continue;
        }
        candidates.push({
          ownerIndex,
          rect,
          property: state.property,
          styleProperty: state.styleProperty,
          applied: state.applied,
          scale
        });
      }
    }
    if (this.readingBottomSpacer?.isConnected && this.readingBottomSpacerHeight > 0) {
      const rect = this.readingBottomSpacer.getBoundingClientRect?.();
      const surfaceRect = (this.layoutMeasureEl?.isConnected ? this.layoutMeasureEl : this.previewEl)?.getBoundingClientRect?.();
      const ownerIndex = this.readingBottomOwnerStrokeIndex();
      if (rect?.height > 0 && ownerIndex >= 0) {
        const localHeight = Number(this.readingBottomSpacer.offsetHeight) || this.readingBottomSpacerHeight;
        candidates.push({
          ownerIndex,
          rect: {
            left: surfaceRect?.left ?? rect.left,
            right: surfaceRect?.right ?? rect.right,
            top: rect.top,
            bottom: rect.bottom
          },
          property: "height",
          styleProperty: "height",
          applied: this.readingBottomSpacerHeight,
          scale: localHeight > 0 ? rect.height / localHeight : 1
        });
      }
    }
    return selectOwnedBlankSpaceCandidate(candidates, { clientX, clientY })?.ownerIndex ?? -1;
  }
  findStrokesInSelection(startPoint, endPoint) {
    const start = this.pointToCanvas(startPoint);
    const end = this.pointToCanvas(endPoint);
    const rect = normalizeCanvasRect(start, end);
    const indexes = [];
    for (let index = 0; index < this.drawingData.strokes.length; index += 1) {
      const stroke = this.drawingData.strokes[index];
      if (!this.isStrokeVisibleOnSurface(stroke)) {
        continue;
      }
      const bounds = getStrokeBounds(stroke, this.canvasWidth(), this.canvasHeight());
      if (bounds && rectsIntersect(rect, bounds)) {
        indexes.push(index);
      }
    }
    return indexes;
  }
  findMarkdownBlocksInSelection(startPoint, endPoint) {
    if (this.surfaceType !== "preview") {
      return [];
    }
    const selection = normalizeCanvasRect(this.pointToCanvas(startPoint), this.pointToCanvas(endPoint));
    const ids = [];
    const seen = /* @__PURE__ */ new Set();
    for (const element of this.previewEl.querySelectorAll(EDITABLE_SELECTOR)) {
      if (element.closest(BLOCKED_EDIT_SELECTOR)) {
        continue;
      }
      const bounds = this.markdownElementCanvasBounds(element);
      if (!bounds || !rectsIntersect(selection, bounds)) {
        continue;
      }
      const block = this.ensureMarkdownBlockRecord(element);
      if (block && !seen.has(block.id)) {
        seen.add(block.id);
        ids.push(block.id);
      }
    }
    return ids;
  }
  markdownBlockRecords() {
    if (!Array.isArray(this.drawingData?.markdownBlocks)) {
      this.drawingData.markdownBlocks = [];
    }
    return this.drawingData.markdownBlocks;
  }
  elementGroupRecords() {
    if (!Array.isArray(this.drawingData?.elementGroups)) {
      this.drawingData.elementGroups = [];
    }
    return this.drawingData.elementGroups;
  }
  elementGroup(groupId) {
    return this.elementGroupRecords().find((group) => group.id === groupId) || null;
  }
  groupMemberStrokeIndexes(groupId) {
    const indexes = [];
    for (const [index, stroke] of this.drawingData.strokes.entries()) {
      if (stroke?.groupId === groupId) {
        indexes.push(index);
      }
    }
    return indexes;
  }
  groupMemberMarkdownBlocks(groupId) {
    return this.markdownBlockRecords().filter((block) => block.groupId === groupId);
  }
  getElementGroupBounds(groupId) {
    let result = this.getStrokeIndexesBounds(this.groupMemberStrokeIndexes(groupId));
    for (const block of this.groupMemberMarkdownBlocks(groupId)) {
      const bounds = this.markdownElementCanvasBounds(this.markdownBlockElement(block));
      if (!bounds) {
        continue;
      }
      result = result ? {
        minX: Math.min(result.minX, bounds.minX),
        maxX: Math.max(result.maxX, bounds.maxX),
        minY: Math.min(result.minY, bounds.minY),
        maxY: Math.max(result.maxY, bounds.maxY)
      } : { ...bounds };
    }
    return result;
  }
  findBoxedElementGroupAtPoint(point) {
    const hit = this.pointToCanvas(point);
    const groups = this.elementGroupRecords().filter((group) => group.boxed);
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const bounds = this.getElementGroupBounds(groups[index].id);
      if (bounds && hit.x >= bounds.minX - 12 && hit.x <= bounds.maxX + 12 && hit.y >= bounds.minY - 12 && hit.y <= bounds.maxY + 12) {
        return groups[index];
      }
    }
    return null;
  }
  isElementGroupFullySelected(groupId) {
    if (!groupId) {
      return false;
    }
    const strokes = this.groupMemberStrokeIndexes(groupId);
    const blocks = this.groupMemberMarkdownBlocks(groupId);
    return strokes.length + blocks.length > 0
      && strokes.every((index) => this.isStrokeSelected(index))
      && blocks.every((block) => this.selectedMarkdownBlockIds.has(block.id));
  }
  selectElementGroup(groupId) {
    if (!groupId) {
      return false;
    }
    this.selectionFilterCycle = null;
    this.selectedStrokeIndexes = new Set(this.groupMemberStrokeIndexes(groupId));
    const strokes = this.getSelectedStrokeIndexes();
    this.selectedStrokeIndex = strokes.length ? strokes[strokes.length - 1] : -1;
    this.selectedMarkdownBlockIds = new Set(this.groupMemberMarkdownBlocks(groupId).map((block) => block.id));
    this.invalidateSelectionFrameSnapshot();
    this.hideSelectionMenu();
    this.invalidateStaticCache();
    this.syncPaletteInputs();
    this.updateToolButtons();
    this.syncMarkdownBlockPresentation();
    return this.hasHybridSelection();
  }
  selectedWholeElementGroups() {
    const ids = new Set([
      ...this.getSelectedStrokeIndexes().map((index) => this.drawingData.strokes[index]?.groupId),
      ...this.getSelectedMarkdownBlocks().map((block) => block.groupId)
    ].filter(Boolean));
    return Array.from(ids).filter((id) => this.isElementGroupFullySelected(id)).map((id) => this.elementGroup(id)).filter(Boolean);
  }
  getSelectedMarkdownBlocks() {
    const selected = this.selectedMarkdownBlockIds || /* @__PURE__ */ new Set();
    return this.markdownBlockRecords().filter((block) => selected.has(block.id));
  }
  hasHybridSelection() {
    return this.getSelectedStrokeIndexes().length > 0 || this.getSelectedMarkdownBlocks().length > 0;
  }
  markdownBlockElement(blockOrId) {
    const id = typeof blockOrId === "string" ? blockOrId : blockOrId?.id;
    const element = id ? this.markdownBlockElements.get(id) : null;
    return element?.isConnected ? element : null;
  }
  findMarkdownBlockRecordForElement(element) {
    const blockElement = element?.closest?.(".notedraw-md-block") || element;
    const existingId = blockElement?.dataset?.noteDrawMarkdownBlockId;
    if (existingId) {
      return this.markdownBlockRecords().find((block) => block.id === existingId) || null;
    }
    if (!blockElement) {
      return null;
    }
    const path = normalizeVaultPath(blockElement.dataset.noteDrawSourcePath || this.file?.path || "");
    const info = getSourceInfo(blockElement);
    const hint = normalizeRenderedText(blockElement.innerText || blockElement.textContent || "").slice(0, 240);
    const candidates = this.markdownBlockRecords().filter((block) => block.path === path);
    return candidates.find((block) => Number.isFinite(info.lineStart) && block.lineStart === info.lineStart && (!block.textHint || block.textHint === hint))
      || candidates.find((block) => block.textHint && block.textHint === hint)
      || null;
  }
  markdownBlockElementForTarget(target, clientPoint = null) {
    if (this.surfaceType !== "preview" || !target || !this.previewEl?.contains?.(target)) {
      return null;
    }
    const marked = target.closest?.(".notedraw-md-block");
    if (marked && this.previewEl.contains(marked) && isConcreteMarkdownBlockElement(marked)) {
      return this.markdownElementContainsClientPoint(marked, clientPoint) ? marked : null;
    }
    const taskCheckbox = target.closest?.("input.task-list-item-checkbox, input[type='checkbox']");
    const taskItem = taskCheckbox?.closest?.("li");
    if (taskItem && this.previewEl.contains(taskItem)) {
      const taskBlocks = [taskItem, ...Array.from(taskItem.querySelectorAll?.(MARKDOWN_TEXT_SELECTOR) || [])].filter((element) => {
        return element?.closest?.("li") === taskItem && isConcreteMarkdownBlockElement(element);
      });
      const taskBlock = taskBlocks.find((element) => element.classList?.contains("notedraw-md-block")) || taskBlocks[0];
      if (taskBlock) {
        return this.markdownElementContainsClientPoint(taskBlock, clientPoint) ? taskBlock : null;
      }
    }
    const editable = findEditableTarget(target, this.previewEl);
    if (!editable) {
      return null;
    }
    const block = this.findMarkdownBlockRecordForElement(editable);
    const blockElement = block ? this.markdownBlockElement(block) || editable : editable;
    return this.markdownElementContainsClientPoint(blockElement, clientPoint) ? blockElement : null;
  }
  ensureMarkdownBlockRecord(element) {
    if (!element || this.surfaceType !== "preview") {
      return null;
    }
    const blockElement = element.closest?.(".notedraw-md-block") || element;
    const existing = this.findMarkdownBlockRecordForElement(blockElement);
    if (existing) {
      return existing;
    }
    const info = getSourceInfo(blockElement);
    const path = normalizeVaultPath(blockElement.dataset.noteDrawSourcePath || this.file?.path || "");
    const textHint = normalizeRenderedText(blockElement.innerText || blockElement.textContent || "").slice(0, 240);
    if (!path || !textHint) {
      return null;
    }
    const record = normalizeMarkdownBlocks([{
      id: `md-${Date.now().toString(36)}-${hashString(`${path}:${info.lineStart ?? "x"}:${textHint}`)}`,
      path,
      lineStart: info.lineStart,
      lineEnd: info.lineEnd,
      textHint,
      span: 12
    }], this.file)[0];
    if (!record) {
      return null;
    }
    this.markdownBlockRecords().push(record);
    this.markdownBlockElements.set(record.id, blockElement);
    blockElement.dataset.noteDrawMarkdownBlockId = record.id;
    return record;
  }
  clearMarkdownBlockPresentation() {
    const parents = /* @__PURE__ */ new Set();
    for (const element of this.markdownBlockElements?.values?.() || []) {
      if (!element) {
        continue;
      }
      parents.add(element.parentElement);
      this.clearMarkdownBlockElementPresentation(element);
    }
    for (const parent of parents) {
      parent?.removeClass?.("notedraw-md-grid");
    }
    this.markdownBlockElements?.clear?.();
  }
  clearMarkdownBlockElementPresentation(element) {
    if (!element) {
      return;
    }
    element.removeClass("notedraw-md-block", "is-selected", "is-locked", "is-floating", "is-notedraw-md-dragging");
    if (element.dataset) {
      delete element.dataset.noteDrawMarkdownBlockId;
      delete element.dataset.noteDrawSortDragging;
      delete element.dataset.noteDrawResizedHeight;
    }
    for (const property of ["grid-column", "width", "--notedraw-md-border", "--notedraw-md-background", "--notedraw-md-min-height", "--notedraw-md-drag-x", "--notedraw-md-drag-y", "--notedraw-md-float-x", "--notedraw-md-float-y", "--notedraw-md-float-width"]) {
      element.style?.removeProperty(property);
    }
  }
  markdownBlockNaturalHeight(element) {
    if (!element?.isConnected) {
      return 1;
    }
    const resized = element.hasAttribute("data-note-draw-resized-height");
    const value = element.style.getPropertyValue("--notedraw-md-min-height");
    const priority = element.style.getPropertyPriority("--notedraw-md-min-height");
    element.removeAttribute("data-note-draw-resized-height");
    element.style.removeProperty("--notedraw-md-min-height");
    const flowInsets = this.noteFlowAppliedVerticalInsets(element);
    const natural = Math.max(1, (Number(element.offsetHeight) || 1) - flowInsets.top - flowInsets.bottom);
    if (value) {
      element.style.setProperty("--notedraw-md-min-height", value, priority);
    }
    if (resized) {
      element.setAttribute("data-note-draw-resized-height", "true");
    }
    return natural;
  }
  applyMarkdownBlockHeightPresentation(block, element) {
    const height = markdownBlockPresentationMinHeight(block);
    const previousHeight = element.style.getPropertyValue("--notedraw-md-min-height");
    const wasResized = element.hasAttribute("data-note-draw-resized-height");
    element.toggleAttribute("data-note-draw-resized-height", height > 0);
    if (height > 0) {
      element.style.setProperty("--notedraw-md-min-height", `${height}px`);
    } else {
      element.style.removeProperty("--notedraw-md-min-height");
    }
    if (wasResized !== (height > 0) || previousHeight !== (height > 0 ? `${height}px` : "")) {
      this.readingLogicalSizerHeight = 0;
    }
  }
  applyMarkdownBlockWidthPresentation(block, element) {
    if (!element) {
      return;
    }
    if (block?.floating) {
      element.style.removeProperty("width");
      return;
    }
    const widthScale = normalizeMarkdownBlockWidthScale(block?.widthScale);
    if (widthScale >= 0.999) {
      element.style.removeProperty("width");
      return;
    }
    element.style.width = `${Math.round(widthScale * 1000) / 10}%`;
  }
  refreshMarkdownBlockPresentation(blockIds = this.selectedMarkdownBlockIds) {
    if (this.surfaceType !== "preview" || !this.previewEl?.isConnected || !this.drawingData) {
      return;
    }
    const wanted = new Set(blockIds || []);
    if (!wanted.size) {
      return;
    }
    const records = new Map(this.markdownBlockRecords().map((block) => [block.id, block]));
    const touchedParents = new Set();
    for (const id of wanted) {
      const block = records.get(id);
      const element = this.markdownBlockElements.get(id);
      if (!block || !element?.isConnected) {
        continue;
      }
      touchedParents.add(element.parentElement);
      element.toggleClass("is-selected", this.selectedMarkdownBlockIds.has(block.id));
      element.toggleClass("is-locked", Boolean(block.locked));
      element.toggleClass("is-floating", Boolean(block.floating && block.floatBox));
      element.style.gridColumn = block.floating ? "span 12" : `span ${clamp(Math.round(Number(block.span) || 12), 2, 12)}`;
      this.applyMarkdownBlockWidthPresentation(block, element);
      setNoteDrawCssProps(element, {
        "--notedraw-md-border": block.borderColor || "transparent",
        "--notedraw-md-background": block.backgroundColor || "transparent"
      });
      this.applyMarkdownBlockHeightPresentation(block, element);
      if (block.floating && block.floatBox) {
        const canvasRect = this.canvas?.getBoundingClientRect?.();
        if (canvasRect?.width > 0 && canvasRect?.height > 0) {
          const horizontalSurface = this.layoutMeasureEl?.isConnected
            ? this.layoutMeasureEl
            : findLayoutMeasureElement(this.previewEl);
          const horizontalRect = horizontalSurface?.getBoundingClientRect?.();
          const logicalWidth = Math.max(1, Number(horizontalSurface?.offsetWidth) || Number(horizontalSurface?.clientWidth) || this.previewEl.clientWidth || this.canvasWidth());
          const logicalHeight = Math.max(1, this.canvasHeight());
          const scaleX = horizontalRect?.width > 0 ? horizontalRect.width / logicalWidth : canvasRect.width / Math.max(1, this.canvasWidth());
          const scaleY = canvasRect.height / Math.max(1, this.canvasRenderHeight);
          const localWidth = Math.max(80, block.floatBox.width * logicalWidth);
          const dragging = element.hasClass?.("is-notedraw-md-dragging") || element.classList?.contains("is-notedraw-md-dragging");
          const hasStableOffset = element.style.getPropertyValue("--notedraw-md-float-x") && element.style.getPropertyValue("--notedraw-md-float-y");
          setNoteDrawCssProps(element, { "--notedraw-md-float-width": `${localWidth}px` });
          if (!dragging || !hasStableOffset) {
            setNoteDrawCssProps(element, {
              "--notedraw-md-float-x": "0px",
              "--notedraw-md-float-y": "0px"
            });
            const naturalRect = element.getBoundingClientRect();
            const targetLeft = (horizontalRect?.left ?? canvasRect.left) + block.floatBox.x * logicalWidth * scaleX;
            const targetTop = canvasRect.top + (block.floatBox.y * logicalHeight - this.canvasWindowTop) * scaleY;
            setNoteDrawCssProps(element, {
              "--notedraw-md-float-x": `${Math.round((targetLeft - naturalRect.left) / Math.max(0.0001, scaleX))}px`,
              "--notedraw-md-float-y": `${Math.round((targetTop - naturalRect.top) / Math.max(0.0001, scaleY))}px`
            });
          }
        }
      } else {
        for (const property of ["--notedraw-md-float-x", "--notedraw-md-float-y", "--notedraw-md-float-width"]) {
          element.style.removeProperty(property);
        }
      }
    }
    for (const parent of touchedParents) {
      const hasGridBlock = Array.from(this.markdownBlockElements.entries()).some(([id, element]) => {
        const block = records.get(id);
        return element?.parentElement === parent && !block?.floating && (block?.span || 12) < 12;
      });
      parent?.toggleClass?.("notedraw-md-grid", hasGridBlock);
    }
  }
  syncMarkdownBlockPresentation() {
    if (this.surfaceType !== "preview" || !this.previewEl?.isConnected || !this.drawingData) {
      return;
    }
    const previousMarkdownBlockElements = this.markdownBlockElements;
    const previousElements = new Set(previousMarkdownBlockElements.values());
    const previousParents = new Set(Array.from(previousElements).map((element) => element?.parentElement).filter(Boolean));
    const candidates = Array.from(this.previewEl.querySelectorAll(EDITABLE_SELECTOR)).filter((element) => {
      return isConcreteMarkdownBlockElement(element)
        && !element.closest(BLOCKED_EDIT_SELECTOR)
        && normalizeRenderedText(element.innerText || element.textContent || "");
    });
    const candidateMeta = /* @__PURE__ */ new Map();
    const exactCandidates = /* @__PURE__ */ new Map();
    const hintCandidates = /* @__PURE__ */ new Map();
    const queueCandidate = (map, key, element) => {
      const values = map.get(key) || [];
      values.push(element);
      map.set(key, values);
    };
    for (const element of candidates) {
      const path = normalizeVaultPath(element.dataset.noteDrawSourcePath || this.file?.path || "");
      const info = getSourceInfo(element);
      const hint = normalizeRenderedText(element.innerText || element.textContent || "").slice(0, 240);
      candidateMeta.set(element, { path, info, hint });
      if (Number.isFinite(info.lineStart)) {
        queueCandidate(exactCandidates, `${path}\u0000${info.lineStart}\u0000${hint}`, element);
      }
      queueCandidate(hintCandidates, `${path}\u0000${hint}`, element);
    }
    const used = /* @__PURE__ */ new Set();
    let markdownMetadataChanged = false;
    const takeUnused = (values) => values?.find((element) => !used.has(element)) || null;
    const next = /* @__PURE__ */ new Map();
    for (const block of this.markdownBlockRecords()) {
      const previous = this.markdownBlockElements.get(block.id);
      const previousMeta = candidateMeta.get(previous);
      const previousMatches = previousMeta && !used.has(previous) && previousMeta.path === block.path
        && previous?.dataset?.noteDrawMarkdownBlockId === block.id;
      const exactKey = `${block.path}\u0000${block.lineStart}\u0000${block.textHint}`;
      const hintKey = `${block.path}\u0000${block.textHint}`;
      const element = previousMatches ? previous : takeUnused(exactCandidates.get(exactKey)) || takeUnused(hintCandidates.get(hintKey));
      if (!element) {
        continue;
      }
      used.add(element);
      next.set(block.id, element);
      const meta = candidateMeta.get(element) || { info: getSourceInfo(element), hint: normalizeRenderedText(element.innerText || element.textContent || "").slice(0, 240) };
      const info = meta.info;
      if (Number.isFinite(info.lineStart)) {
        markdownMetadataChanged = markdownMetadataChanged
          || block.lineStart !== info.lineStart
          || block.lineEnd !== (info.lineEnd ?? info.lineStart);
        block.lineStart = info.lineStart;
        block.lineEnd = info.lineEnd ?? info.lineStart;
      }
      if (meta.hint) {
        markdownMetadataChanged = markdownMetadataChanged || block.textHint !== meta.hint;
        block.textHint = meta.hint;
      }
      element.dataset.noteDrawMarkdownBlockId = block.id;
      element.addClass("notedraw-md-block");
      element.toggleClass("is-selected", this.selectedMarkdownBlockIds.has(block.id));
      element.toggleClass("is-locked", Boolean(block.locked));
      element.toggleClass("is-floating", Boolean(block.floating && block.floatBox));
      element.style.gridColumn = block.floating ? "span 12" : `span ${clamp(Math.round(Number(block.span) || 12), 2, 12)}`;
      this.applyMarkdownBlockWidthPresentation(block, element);
      setNoteDrawCssProps(element, {
        "--notedraw-md-border": block.borderColor || "transparent",
        "--notedraw-md-background": block.backgroundColor || "transparent"
      });
      this.applyMarkdownBlockHeightPresentation(block, element);
      if (block.floating && block.floatBox) {
        const canvasRect = this.canvas?.getBoundingClientRect?.();
        if (canvasRect?.width > 0 && canvasRect?.height > 0) {
          const horizontalSurface = this.layoutMeasureEl?.isConnected
            ? this.layoutMeasureEl
            : findLayoutMeasureElement(this.previewEl);
          const horizontalRect = horizontalSurface?.getBoundingClientRect?.();
          const logicalWidth = Math.max(1, Number(horizontalSurface?.offsetWidth) || Number(horizontalSurface?.clientWidth) || this.previewEl.clientWidth || this.canvasWidth());
          const logicalHeight = Math.max(1, this.canvasHeight());
          const scaleX = horizontalRect?.width > 0 ? horizontalRect.width / logicalWidth : canvasRect.width / Math.max(1, this.canvasWidth());
          const scaleY = canvasRect.height / Math.max(1, this.canvasRenderHeight);
          const localWidth = Math.max(80, block.floatBox.width * logicalWidth);
          const dragging = element.hasClass?.("is-notedraw-md-dragging") || element.classList?.contains("is-notedraw-md-dragging");
          const hasStableOffset = element.style.getPropertyValue("--notedraw-md-float-x") && element.style.getPropertyValue("--notedraw-md-float-y");
          setNoteDrawCssProps(element, { "--notedraw-md-float-width": `${localWidth}px` });
          if (!dragging || !hasStableOffset) {
            setNoteDrawCssProps(element, {
              "--notedraw-md-float-x": "0px",
              "--notedraw-md-float-y": "0px"
            });
            const naturalRect = element.getBoundingClientRect();
            const targetLeft = (horizontalRect?.left ?? canvasRect.left) + block.floatBox.x * logicalWidth * scaleX;
            const targetTop = canvasRect.top + (block.floatBox.y * logicalHeight - this.canvasWindowTop) * scaleY;
            setNoteDrawCssProps(element, {
              "--notedraw-md-float-x": `${Math.round((targetLeft - naturalRect.left) / Math.max(0.0001, scaleX))}px`,
              "--notedraw-md-float-y": `${Math.round((targetTop - naturalRect.top) / Math.max(0.0001, scaleY))}px`
            });
          }
        }
      } else {
        for (const property of ["--notedraw-md-float-x", "--notedraw-md-float-y", "--notedraw-md-float-width"]) {
          element.style.removeProperty(property);
        }
      }
    }
    for (const element of previousElements) {
      const id = element.dataset?.noteDrawMarkdownBlockId;
      if (id && next.get(id) === element) {
        continue;
      }
      this.clearMarkdownBlockElementPresentation(element);
    }
    const connectedIds = new Set(next.keys());
    const selectedIds = new Set(Array.from(this.selectedMarkdownBlockIds || []).filter((id) => connectedIds.has(id)));
    const selectedSizeChanged = selectedIds.size !== this.selectedMarkdownBlockIds.size;
    const selectedElementChanged = Array.from(selectedIds).some((id) => previousMarkdownBlockElements.get(id) !== next.get(id));
    this.markdownBlockElements = next;
    if (selectedSizeChanged || selectedElementChanged) {
      this.selectedMarkdownBlockIds = selectedIds;
      this.invalidateSelectionFrameSnapshot();
      if (selectedSizeChanged) {
        this.hideSelectionMenu();
      }
    }
    const nextParents = new Set(Array.from(next.entries()).filter(([id]) => {
      const block = this.markdownBlockRecords().find((item) => item.id === id);
      return !block?.floating && (block?.span || 12) < 12;
    }).map(([, element]) => element.parentElement).filter(Boolean));
    for (const parent of previousParents) {
      parent?.toggleClass?.("notedraw-md-grid", nextParents.has(parent));
    }
    for (const parent of nextParents) {
      parent?.addClass?.("notedraw-md-grid");
    }
    let repairedImplicitFloatingOverlap = false;
    if (!this.draggingStroke) {
      const records = new Map(this.markdownBlockRecords().map((block) => [block.id, block]));
      const hasImplicitFloating = Array.from(records.values()).some((block) => block.floating && !block.floatingExplicit);
      const visibleRects = hasImplicitFloating
        ? new Map(Array.from(next.entries()).map(([id, element]) => [id, this.markdownElementVisibleClientRect(element)]))
        : new Map();
      for (const block of records.values()) {
        if (!block.floating || block.floatingExplicit) {
          continue;
        }
        const element = next.get(block.id);
        const rect = visibleRects.get(block.id);
        if (!rect) {
          continue;
        }
        const overlapsFlow = Array.from(next.keys()).some((otherId) => {
          if (otherId === block.id || records.get(otherId)?.floating) {
            return false;
          }
          return markdownClientRectsOverlap(rect, visibleRects.get(otherId));
        });
        if (!overlapsFlow) {
          continue;
        }
        block.floating = false;
        block.floatingExplicit = false;
        block.floatBox = null;
        block.span = 12;
        block.widthScale = 1;
        element.removeClass("is-floating");
        element.style.gridColumn = "span 12";
        for (const property of ["--notedraw-md-float-x", "--notedraw-md-float-y", "--notedraw-md-float-width"]) {
          element.style.removeProperty(property);
        }
        repairedImplicitFloatingOverlap = true;
      }
    }
    markdownMetadataChanged = markdownMetadataChanged || repairedImplicitFloatingOverlap;
    if (markdownMetadataChanged && !this.draggingStroke && this.file && this.drawingData) {
      this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    }
    if (repairedImplicitFloatingOverlap) {
      this.readingLogicalSizerHeight = 0;
      this.invalidateSelectionFrameSnapshot();
      this.scheduleResize({ layout: false, measure: true });
    }
    if (this.selectionFrameAwaitingMarkdownSync?.committed) {
      this.selectionFrameAwaitingMarkdownSync = null;
      this.invalidateSelectionFrameSnapshot();
      this.captureSelectionFrameSnapshot({ force: true });
      this.render();
    }
  }
  selectMarkdownBlock(element, { additive = false, toggle = false, skipGroupExpansion = false } = {}) {
    const block = this.ensureMarkdownBlockRecord(element);
    if (!block) {
      return null;
    }
    this.selectionFilterCycle = null;
    const next = additive ? new Set(this.selectedMarkdownBlockIds) : /* @__PURE__ */ new Set();
    if (toggle && next.has(block.id)) {
      next.delete(block.id);
    } else {
      next.add(block.id);
    }
    if (!additive) {
      this.selectedStrokeIndexes.clear();
      this.selectedStrokeIndex = -1;
    }
    this.selectedMarkdownBlockIds = next;
    this.invalidateSelectionFrameSnapshot();
    if (!skipGroupExpansion) {
      this.expandSelectedGroups();
    }
    this.hideSelectionMenu();
    this.invalidateStaticCache();
    this.syncPaletteInputs();
    this.updateToolButtons();
    this.syncMarkdownBlockPresentation();
    return block;
  }
  toggleMarkdownBlockSelection(element) {
    return this.selectMarkdownBlock(element, { additive: true, toggle: true });
  }
  expandSelectedGroups() {
    const groupIds = new Set([
      ...this.getSelectedStrokeIndexes().map((index) => this.drawingData.strokes[index]?.groupId),
      ...this.getSelectedMarkdownBlocks().map((block) => block.groupId)
    ].filter((id) => id && !this.enteredElementGroupIds.has(id)));
    if (!groupIds.size) {
      return;
    }
    for (const [index, stroke] of this.drawingData.strokes.entries()) {
      if (stroke?.groupId && groupIds.has(stroke.groupId)) {
        this.selectedStrokeIndexes.add(index);
      }
    }
    for (const block of this.markdownBlockRecords()) {
      if (block.groupId && groupIds.has(block.groupId)) {
        this.selectedMarkdownBlockIds.add(block.id);
      }
    }
  }
  setSelectedStrokes(indexes, options = {}) {
    this.selectionFilterCycle = null;
    const normalized = Array.isArray(indexes) ? indexes : [indexes];
    this.selectedStrokeIndexes = new Set(
      normalized.map((index) => Number(index)).filter((index) => Number.isInteger(index) && index >= 0 && index < this.drawingData.strokes.length)
    );
    if (options.preserveMarkdown !== true) {
      this.selectedMarkdownBlockIds.clear();
    }
    this.invalidateSelectionFrameSnapshot();
    const selected = this.getSelectedStrokeIndexes();
    this.selectedStrokeIndex = selected.length ? selected[selected.length - 1] : -1;
    if (options.skipGroupExpansion !== true) {
      this.expandSelectedGroups();
    }
    this.hideSelectionMenu();
    this.invalidateStaticCache();
    this.syncPaletteInputs();
    this.updateToolButtons();
  }
  toggleStrokeSelection(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.drawingData.strokes.length) {
      return;
    }
    const next = new Set(this.getSelectedStrokeIndexes());
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    this.setSelectedStrokes(Array.from(next), { preserveMarkdown: true });
  }
  clearSelectedStrokes() {
    this.selectionFilterCycle = null;
    this.selectedStrokeIndexes.clear();
    this.selectedStrokeIndex = -1;
    this.selectedMarkdownBlockIds.clear();
    this.enteredElementGroupIds.clear();
    this.invalidateSelectionFrameSnapshot();
    this.hideSelectionMenu();
    this.invalidateStaticCache();
    this.syncPaletteInputs();
    if (this.toolMode === TOOL_SELECT && this.paletteOpen) {
      this.setPaletteOpen(false);
    }
    this.updateToolButtons();
    this.syncMarkdownBlockPresentation();
  }
  selectElementsById(ids = []) {
    const wanted = new Set((Array.isArray(ids) ? ids : [ids]).map((id) => String(id || "")).filter(Boolean));
    const indexes = [];
    for (const [index, stroke] of (this.drawingData?.strokes || []).entries()) {
      if (wanted.has(strokeElementId(stroke))) {
        indexes.push(index);
      }
    }
    const markdownIds = new Set(this.markdownBlockRecords().filter((block) => wanted.has(block.id)).map((block) => block.id));
    if (!indexes.length && !markdownIds.size) {
      return false;
    }
    this.setToolFromApi(TOOL_SELECT);
    this.setSelectedStrokes(indexes, { preserveMarkdown: true });
    this.selectedMarkdownBlockIds = markdownIds;
    this.invalidateSelectionFrameSnapshot();
    this.expandSelectedGroups();
    this.syncMarkdownBlockPresentation();
    this.showSelectionMenu();
    this.render();
    return true;
  }
  scrollSelectionIntoView() {
    const frame = this.getSelectedFrameCanvasRect();
    const canvasRect = this.canvas?.getBoundingClientRect?.();
    if (!frame || !canvasRect?.width || !canvasRect?.height) {
      return false;
    }
    const scaleY = canvasRect.height / Math.max(1, this.canvasRenderHeight);
    const targetRect = {
      top: canvasRect.top + (frame.y - this.canvasWindowTop) * scaleY,
      bottom: canvasRect.top + (frame.y + frame.height - this.canvasWindowTop) * scaleY
    };
    const scroller = this.scrollContainer;
    const viewport = scroller?.getBoundingClientRect?.() || {
      top: 0,
      bottom: window.innerHeight || 0
    };
    const margin = Math.min(72, Math.max(24, (viewport.bottom - viewport.top) * 0.12));
    const delta = targetRect.top < viewport.top + margin
      ? targetRect.top - viewport.top - margin
      : targetRect.bottom > viewport.bottom - margin
        ? targetRect.bottom - viewport.bottom + margin
        : 0;
    if (Math.abs(delta) < 1) {
      return true;
    }
    const root = activeDocument.scrollingElement || activeDocument.documentElement;
    if (!scroller || scroller === root || scroller === activeDocument.body || scroller === activeDocument.documentElement) {
      window.scrollBy?.(0, delta);
    } else {
      scroller.scrollTop += delta;
    }
    return true;
  }
  selectedElementLinkPayload() {
    const indexes = this.getSelectedStrokeIndexes();
    const blockIds = this.getSelectedMarkdownBlocks().map((block) => block.id);
    const ids = [
      ...indexes.map((index) => strokeElementId(this.drawingData?.strokes?.[index])).filter(Boolean),
      ...blockIds
    ];
    const file = normalizeVaultPath(this.file?.path || "");
    if (!ids.length || !file) {
      return null;
    }
    const params = new URLSearchParams({ file, ids: Array.from(new Set(ids)).join(",") });
    const uri = `notedraw://element?${params.toString()}`;
    const markdown = `[${this.plugin.t("elementLinkLabel")}](${uri})`;
    return { uri, markdown, ids: Array.from(new Set(ids)), file };
  }
  async copySelectedElementLink(options = {}) {
    const payload = this.selectedElementLinkPayload();
    if (!payload) {
      return { ok: false, reason: "selection-not-found" };
    }
    const { uri, markdown, ids, file } = payload;
    const copied = await writeTextToClipboard(markdown);
    if (!copied) {
      return { ok: false, reason: "clipboard-unavailable", uri, markdown };
    }
    this.hideSelectionMenu();
    if (!options.quiet) {
      new Notice(this.plugin.t("copiedElementLink"));
    }
    return { ok: true, uri, markdown, ids, file };
  }
  copySelectedElements(options = {}) {
    const indexes = this.getSelectedStrokeIndexes();
    const bounds = this.getStrokeIndexesBounds(indexes);
    if (!indexes.length || !bounds) {
      return { ok: false, reason: "selection-not-found" };
    }
    const selectedIds = new Set(indexes.map((index) => strokeElementId(this.drawingData.strokes[index])).filter(Boolean));
    const strokes = indexes.map((index) => {
      const stroke = JSON.parse(JSON.stringify(this.drawingData.strokes[index]));
      if (stroke.connector?.fromId && stroke.connector?.toId && (!selectedIds.has(stroke.connector.fromId) || !selectedIds.has(stroke.connector.toId))) {
        delete stroke.connector;
      }
      return stroke;
    });
    this.plugin.elementClipboard = {
      version: 1,
      sourcePath: this.file?.path || "",
      sourceWidth: this.canvasWidth(),
      sourceHeight: this.canvasHeight(),
      bounds,
      strokes,
      copiedAt: Date.now()
    };
    const link = this.selectedElementLinkPayload();
    if (link) {
      // Keep the internal element copy for NoteDraw canvas paste and expose the
      // same selection as a Markdown link to Obsidian's note editor.
      void writeTextToClipboard(link.markdown);
    }
    this.hideSelectionMenu();
    if (!options.quiet) {
      new Notice(this.plugin.t("copiedElements", { count: strokes.length }));
    }
    return { ok: true, count: strokes.length };
  }
  visibleCanvasPastePoint() {
    const frame = this.getResponsiveContentFrame();
    const x = clamp((frame.left + Math.min(frame.width * 0.16, 72)) / this.canvasWidth(), 0.02, 0.92);
    const y = clamp((this.canvasWindowTop + Math.min(this.canvasRenderHeight * 0.22, 140)) / this.canvasHeight(), 0.01, 0.96);
    return { x, y, t: Date.now() };
  }
  pasteCopiedElements(options = {}) {
    const clipboard = this.plugin.elementClipboard;
    if (!clipboard?.strokes?.length || !clipboard.bounds) {
      if (!options.quiet) {
        new Notice(this.plugin.t("nothingToPaste"));
      }
      return { ok: false, reason: "clipboard-empty" };
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    const targetWidth = this.canvasWidth();
    const targetHeight = this.canvasHeight();
    const sourceWidth = Math.max(1, Number(clipboard.sourceWidth) || 1);
    const sourceHeight = Math.max(1, Number(clipboard.sourceHeight) || 1);
    const sourceBounds = clipboard.bounds;
    const selectedBounds = this.getSelectedStrokeBounds();
    const requested = options.point && Number.isFinite(Number(options.point.x)) && Number.isFinite(Number(options.point.y))
      ? { x: clamp(Number(options.point.x), 0, 1), y: clamp(Number(options.point.y), 0, 1) }
      : null;
    const defaultPoint = selectedBounds ? {
      x: clamp((selectedBounds.minX + 22) / targetWidth, 0, 0.96),
      y: clamp((selectedBounds.minY + 22) / targetHeight, 0, 0.96)
    } : this.visibleCanvasPastePoint();
    const targetPoint = requested || defaultPoint;
    const groupWidth = Math.max(1, sourceBounds.maxX - sourceBounds.minX);
    const groupHeight = Math.max(1, sourceBounds.maxY - sourceBounds.minY);
    const fitScale = Math.min(
      1,
      Math.max(0.12, (targetWidth - 24) / groupWidth),
      Math.max(0.12, (targetHeight - 24) / groupHeight)
    );
    const targetX = clamp(targetPoint.x * targetWidth, 12, Math.max(12, targetWidth - groupWidth * fitScale - 12));
    const targetY = clamp(targetPoint.y * targetHeight, 12, Math.max(12, targetHeight - groupHeight * fitScale - 12));
    const idMap = new Map();
    for (const sourceStroke of clipboard.strokes) {
      const sourceId = strokeElementId(sourceStroke);
      if (sourceId) {
        idMap.set(sourceId, createElementLayoutId(this.drawingData.strokes.length + idMap.size));
      }
    }
    const pasted = clipboard.strokes.map((sourceStroke, offset) => {
      const stroke = JSON.parse(JSON.stringify(sourceStroke));
      const sourceId = strokeElementId(stroke);
      stroke.elementId = idMap.get(sourceId) || createElementLayoutId(this.drawingData.strokes.length + offset);
      stroke.layout = null;
      stroke.locked = false;
      stroke.points = (stroke.points || []).map((point) => ({
        x: clamp((targetX + (Number(point.x) * sourceWidth - sourceBounds.minX) * fitScale) / targetWidth, 0, 1),
        y: clamp((targetY + (Number(point.y) * sourceHeight - sourceBounds.minY) * fitScale) / targetHeight, 0, 1),
        t: Date.now(),
        anchor: null
      }));
      if (stroke.connector) {
        const fromId = idMap.get(stroke.connector.fromId);
        const toId = idMap.get(stroke.connector.toId);
        stroke.connector = fromId && toId ? { ...stroke.connector, fromId, toId } : null;
      }
      if (Number.isFinite(Number(stroke.width))) {
        stroke.width = clamp(Number(stroke.width) * fitScale, MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH);
      }
      if (Number.isFinite(Number(stroke.fontSize))) {
        stroke.fontSize = clamp(Number(stroke.fontSize) * fitScale, 10, 72);
      }
      for (const key of ["textWidth", "previewWidth", "previewHeight"]) {
        if (Number.isFinite(Number(stroke[key]))) {
          stroke[key] = Number(stroke[key]) * fitScale;
        }
      }
      return normalizeStroke(stroke);
    }).filter((stroke) => stroke.points.length);
    const startIndex = this.drawingData.strokes.length;
    this.drawingData.strokes.push(...pasted);
    const indexes = pasted.map((_, index) => startIndex + index);
    this.captureResponsiveAnchorsForIndexes(indexes.filter((index) => !isConnectorStroke(this.drawingData.strokes[index])));
    this.syncBoundConnectors();
    this.setSelectedStrokes(indexes);
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.scheduleNoteFlowLayout({
      operation: pasted.some((stroke) => stroke?.noteFlow?.enabled)
    });
    this.scheduleLayoutRefresh({ settle: false });
    this.render();
    if (!options.quiet) {
      new Notice(this.plugin.t("pastedElements", { count: pasted.length }));
    }
    return { ok: true, count: pasted.length, indexes };
  }
  onDocumentKeyDown(event) {
    if (!this.active || this.plugin.interactionController(this) !== this || !(event.ctrlKey || event.metaKey) || event.altKey) {
      return;
    }
    const target = event.target;
    if (target?.closest?.("input, textarea, select, [contenteditable='true']") || this.currentEditor || this.floatingTextInput) {
      return;
    }
    const key = String(event.key || "").toLowerCase();
    if (key === "c" && this.getSelectedStrokeIndexes().length) {
      this.copySelectedElements();
      event.preventDefault();
      event.stopPropagation();
    } else if (key === "v" && this.plugin.elementClipboard?.strokes?.length) {
      this.pasteCopiedElements();
      event.preventDefault();
      event.stopPropagation();
    }
  }
  noteFlowCanvasRect() {
    const rects = [this.canvas, this.staticCanvas, this.underlayCanvas].map((canvas) => canvas?.getBoundingClientRect?.()).filter(Boolean);
    return rects.find((rect) => rect.width > 1 && rect.height > 1) || rects[0] || null;
  }
  draggedNoteFlowIndexes(indexes = this.dragStrokeOriginalPoints?.keys?.() || []) {
    return Array.from(indexes || []).filter((index) => {
      const stroke = this.drawingData?.strokes?.[index];
      return Boolean(normalizeNoteFlow(stroke?.noteFlow)) && !isConnectorStroke(stroke);
    });
  }
  usesDraggedNoteFlowPlacement() {
    return this.toolMode === TOOL_SELECT
      && this.supportsNoteFlow()
      && this.draggedNoteFlowIndexes().length > 0;
  }
  ensureNoteFlowDropIndicator() {
    if (this.noteFlowDropIndicator?.isConnected) {
      return this.noteFlowDropIndicator;
    }
    this.noteFlowDropIndicator = createNoteDrawControlElement(activeDocument.body, "notedraw-note-flow-drop-indicator");
    this.noteFlowDropIndicator._noteDrawController = this;
    return this.noteFlowDropIndicator;
  }
  removeDraggedNoteFlowPlacementVisual() {
    this.dragNoteFlowTargetElement?.classList?.remove(
      "notedraw-text-sort-target-before",
      "notedraw-text-sort-target-after",
      "notedraw-text-sort-target-left",
      "notedraw-text-sort-target-right"
    );
    this.dragNoteFlowTargetElement = null;
    this.noteFlowDropIndicator?.classList?.remove("is-visible", "is-notedraw-controls-visible");
    if (this.noteFlowDropIndicator) {
      delete this.noteFlowDropIndicator.dataset.noteDrawDropSide;
      delete this.noteFlowDropIndicator.dataset.noteDrawDropLine;
      delete this.noteFlowDropIndicator.dataset.noteDrawDropMagnet;
    }
  }
  clearDraggedNoteFlowPlacement() {
    if (this.dragNoteFlowDropFrameId !== null) {
      window.cancelAnimationFrame(this.dragNoteFlowDropFrameId);
      this.dragNoteFlowDropFrameId = null;
    }
    this.dragNoteFlowDropClientX = null;
    this.dragNoteFlowDropClientY = null;
    this.dragNoteFlowPlacement = null;
    this.removeDraggedNoteFlowPlacementVisual();
  }
  queueDraggedNoteFlowPlacement(clientX, clientY) {
    if (!this.usesDraggedNoteFlowPlacement() || !Number.isFinite(Number(clientX)) || !Number.isFinite(Number(clientY))) {
      this.clearDraggedNoteFlowPlacement();
      return;
    }
    this.dragNoteFlowDropClientX = Number(clientX);
    this.dragNoteFlowDropClientY = Number(clientY);
    if (this.dragNoteFlowDropFrameId !== null) {
      return;
    }
    this.dragNoteFlowDropFrameId = window.requestAnimationFrame(() => {
      this.dragNoteFlowDropFrameId = null;
      const pendingX = this.dragNoteFlowDropClientX;
      const pendingY = this.dragNoteFlowDropClientY;
      this.dragNoteFlowDropClientX = null;
      this.dragNoteFlowDropClientY = null;
      this.updateDraggedNoteFlowPlacement(pendingX, pendingY);
    });
  }
  updateDraggedNoteFlowPlacement(clientX, clientY) {
    if (!this.usesDraggedNoteFlowPlacement() || !Number.isFinite(Number(clientX)) || !Number.isFinite(Number(clientY))) {
      this.clearDraggedNoteFlowPlacement();
      return null;
    }
    const geometry = this.dragDropGeometrySnapshot();
    const placement = selectNoteFlowDropPlacementFromIndex(geometry?.noteFlowDropIndex, { dropY: Number(clientY) });
    const target = placement?.candidate?.sourceElement || placement?.candidate?.element || null;
    const targetRect = placement?.candidate && {
      left: Number(placement.candidate.left),
      right: Number(placement.candidate.right),
      top: Number(placement.candidate.top),
      bottom: Number(placement.candidate.bottom),
      width: Number(placement.candidate.right) - Number(placement.candidate.left),
      height: Number(placement.candidate.bottom) - Number(placement.candidate.top)
    };
    if (!placement || !target || !targetRect || targetRect.width <= 1 || targetRect.height <= 1) {
      this.clearDraggedNoteFlowPlacement();
      return null;
    }
    const laneRect = geometry?.laneRect || targetRect;
    const draggedBounds = this.getStrokeIndexesBounds(this.draggedNoteFlowIndexes());
    const canvasRect = this.noteFlowCanvasRect();
    const draggedClientWidth = draggedBounds && canvasRect?.width > 1
      ? (draggedBounds.maxX - draggedBounds.minX) * canvasRect.width / Math.max(1, this.canvasWidth())
      : Number.POSITIVE_INFINITY;
    const draggedClientHeight = draggedBounds && canvasRect?.height > 1
      ? (draggedBounds.maxY - draggedBounds.minY) * canvasRect.height / Math.max(1, this.canvasRenderHeight)
      : targetRect.height;
    const proposedInlineRect = {
      left: targetRect.right + 10,
      right: targetRect.right + 10 + draggedClientWidth,
      top: targetRect.top,
      bottom: targetRect.top + draggedClientHeight
    };
    const horizontalRoom = Number.isFinite(draggedClientWidth)
      && proposedInlineRect.right <= laneRect.right + 0.5
      && !(geometry?.markdownCandidates || []).some((entry) => {
        const element = entry?.element;
        const sameTarget = element === target || element?.contains?.(target) || target?.contains?.(element);
        if (sameTarget) {
          return false;
        }
        const rect = entry?.rect;
        return rect
          && Math.min(proposedInlineRect.right, rect.right) - Math.max(proposedInlineRect.left, rect.left) > 2
          && Math.min(proposedInlineRect.bottom, rect.bottom) - Math.max(proposedInlineRect.top, rect.top) > 2;
      });
    const intent = resolveDragDropHorizontalIntent({
      clientX,
      targetLeft: targetRect.left,
      targetRight: targetRect.right,
      laneLeft: laneRect.left,
      laneRight: laneRect.right,
      draggedLeft: this.draggedSelectionClientLeft(),
      horizontalRoom
    });
    const horizontalSide = intent === "inline-right" ? "right" : null;
    const leftSnap = intent === "line-start";
    const flowSide = horizontalSide ? "after" : placement.side;
    const flowLine = horizontalSide ? placement.candidate.end : placement.line;
    const indicator = this.ensureNoteFlowDropIndicator();
    const previous = this.dragNoteFlowPlacement;
    const presentationChanged = previous?.candidate?.sourceElement !== target
      || previous?.candidate?.element !== placement.candidate.element
      || previous?.side !== flowSide
      || previous?.line !== Number(flowLine)
      || previous?.horizontalSide !== horizontalSide
      || previous?.leftSnap !== leftSnap;
    if (presentationChanged || !indicator.classList.contains("is-visible")) {
      this.removeDraggedNoteFlowPlacementVisual();
      this.dragNoteFlowTargetElement = target;
      target.classList.add(`notedraw-text-sort-target-${horizontalSide || placement.side}`);
      const left = leftSnap ? laneRect.left : targetRect.left;
      const right = leftSnap ? laneRect.right : targetRect.right;
      applyElementStyles(indicator, horizontalSide ? {
        left: `${Math.round(targetRect.right)}px`,
        top: `${Math.round(targetRect.top)}px`,
        width: "4px",
        height: `${Math.max(16, Math.round(targetRect.height))}px`
      } : {
        left: `${Math.round(left)}px`,
        top: `${Math.round(placement.boundary)}px`,
        width: `${Math.max(16, Math.round(right - left))}px`,
        height: "4px"
      });
      indicator.dataset.noteDrawDropSide = horizontalSide || placement.side;
      indicator.dataset.noteDrawDropLine = String(flowLine);
      if (leftSnap) {
        indicator.dataset.noteDrawDropMagnet = "left";
      } else {
        delete indicator.dataset.noteDrawDropMagnet;
      }
      indicator.classList.add("is-notedraw-controls-visible", "is-visible");
    }
    this.dragNoteFlowPlacement = {
      path: normalizeVaultPath(placement.candidate.path || this.file?.path || ""),
      line: Number(flowLine),
      side: flowSide,
      horizontalSide,
      leftSnap,
      boundary: Number(placement.boundary),
      candidate: { ...placement.candidate }
    };
    return this.dragNoteFlowPlacement;
  }
  resolveDraggedNoteFlowPlacement(placement, indexes) {
    const line = Number(placement?.line);
    const side = placement?.side;
    const path = normalizeVaultPath(placement?.path || this.file?.path || "");
    if (!Number.isFinite(line) || !["before", "after"].includes(side)) {
      return null;
    }
    const candidate = placement?.candidate;
    const exactCandidate = candidate
      && (candidate.sourceElement || candidate.element)?.isConnected
      && normalizeVaultPath(candidate.path || this.file?.path || "") === path
      && Number.isFinite(Number(candidate.start))
      && Number.isFinite(Number(candidate.end))
      && line >= Number(candidate.start)
      && line <= Number(candidate.end)
      ? candidate
      : null;
    return exactCandidate ? {
      candidate: exactCandidate,
      path,
      line,
      side,
      horizontalSide: placement?.horizontalSide || null,
      leftSnap: placement?.leftSnap === true,
      boundary: Number.isFinite(Number(placement?.boundary)) ? Number(placement.boundary) : null
    } : null;
  }
  snapDraggedSelectionToNoteFlowPlacement(placement, indexes) {
    const movedIndexes = Array.from(indexes || []);
    const flowBounds = this.getStrokeIndexesBounds(this.draggedNoteFlowIndexes(movedIndexes));
    const allBounds = this.getStrokeIndexesBounds(movedIndexes);
    const canvasRect = this.noteFlowCanvasRect();
    if (!placement?.candidate || !flowBounds || !allBounds || !canvasRect || canvasRect.height <= 1) {
      return false;
    }
    const scaleY = canvasRect.height / Math.max(1, this.canvasRenderHeight);
    const horizontalSide = placement.horizontalSide;
    const leftSnap = placement.leftSnap === true;
    const boundary = horizontalSide
      ? placement.candidate.top
      : Number.isFinite(Number(placement.boundary))
        ? Number(placement.boundary)
        : placement.side === "after"
          ? placement.candidate.bottom
          : placement.candidate.top;
    const targetCanvasY = this.canvasWindowTop + (boundary - canvasRect.top) / Math.max(0.0001, scaleY);
    const sourceCanvasY = flowBounds.minY;
    const deltaY = clamp(targetCanvasY - sourceCanvasY, -allBounds.minY, this.canvasHeight() - allBounds.maxY);
    let deltaX = 0;
    if (horizontalSide || leftSnap) {
      const target = placement.candidate.sourceElement || placement.candidate.element;
      const targetBounds = this.markdownElementCanvasBounds(target);
      if (targetBounds) {
        const gap = 10;
        const scaleX = canvasRect.width / Math.max(1, this.canvasWidth());
        const laneCanvasX = this.dragContentLaneRect
          ? (this.dragContentLaneRect.left - canvasRect.left) / Math.max(0.0001, scaleX)
          : targetBounds.minX;
        deltaX = leftSnap
          ? laneCanvasX - allBounds.minX
          : targetBounds.maxX + gap - allBounds.minX;
        deltaX = clamp(deltaX, -allBounds.minX, this.canvasWidth() - allBounds.maxX);
      }
    }
    if (Math.abs(deltaY) < 0.25 && Math.abs(deltaX) < 0.25) {
      return false;
    }
    const normalizedDeltaY = deltaY / Math.max(1, this.canvasHeight());
    const normalizedDeltaX = deltaX / Math.max(1, this.canvasWidth());
    for (const index of movedIndexes) {
      const stroke = this.drawingData?.strokes?.[index];
      if (!stroke || stroke.locked) {
        continue;
      }
      stroke.points = stroke.points.map((point) => ({
        ...point,
        x: clamp(Number(point.x) + normalizedDeltaX, 0, 1),
        y: clamp(Number(point.y) + normalizedDeltaY, 0, 1)
      }));
    }
    this.invalidateStaticCache();
    return true;
  }
  captureNoteFlowAnchor(stroke, options = {}) {
    const previous = normalizeNoteFlow(stroke?.noteFlow);
    const bounds = getStrokeBounds(stroke, this.canvasWidth(), this.canvasHeight());
    const canvasRect = this.noteFlowCanvasRect();
    if (!bounds || !canvasRect || canvasRect.width <= 1 || canvasRect.height <= 1) {
      return previous || {
        enabled: true,
        path: this.file?.path || "",
        line: null,
        side: null,
        positionBasis: null,
        positionPath: this.file?.path || "",
        positionLine: null,
        positionVersion: 0,
        placementVersion: 0,
        placementMode: "row",
        inlineSide: null,
        leftSnap: false,
        gap: 12
      };
    }
    const scaleY = canvasRect.height > 0 ? canvasRect.height / Math.max(1, this.canvasRenderHeight) : 1;
    const strokeTop = canvasRect.top + (bounds.minY - this.canvasWindowTop) * scaleY;
    const strokeBottom = canvasRect.top + (bounds.maxY - this.canvasWindowTop) * scaleY;
    const candidates = this.noteFlowCandidates();
    const explicitPlacement = Boolean(options.placement?.candidate);
    const placement = explicitPlacement
      ? options.placement
      : selectNoteFlowInsertionPlacement(candidates, { strokeTop, strokeBottom });
    const previousAnchor = options.preservePlacement === true && Number.isFinite(previous?.line) && ["before", "after"].includes(previous?.side)
      ? candidates.filter((candidate) => {
        return candidate.path === previous.path && previous.line >= candidate.start && previous.line <= candidate.end;
      }).sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top) || a.order - b.order)[0] || null
      : null;
    const preservePlacement = Boolean(previousAnchor);
    const anchor = preservePlacement ? previousAnchor : placement?.candidate;
    const side = preservePlacement ? previous.side : placement?.side || previous?.side || null;
    const line = preservePlacement ? previous.line : Number.isFinite(placement?.line) ? placement.line : previous?.line ?? null;
    const exactPlacement = explicitPlacement || preservePlacement && hasExactNoteFlowPlacement(previous);
    const position = exactPlacement
      ? selectExactNoteFlowPositionAnchor(candidates, { candidate: anchor, side, line })
      : selectNoteFlowPositionAnchor(candidates, {
        strokeTop,
        maxOrderExclusive: side === "before" && anchor ? anchor.order : Number.POSITIVE_INFINITY
      });
    const positionAnchor = position?.candidate;
    const candidatesReady = candidates.length > 0;
    const placementMode = options.placement?.horizontalSide
      ? "inline"
      : options.placement?.candidate
        ? "row"
        : preservePlacement
          ? previous?.placementMode || "row"
          : previous?.placementMode || "row";
    const contentFrame = this.getResponsiveContentFrame();
    const contentWidth = Math.max(1, Number(contentFrame?.width) || this.canvasWidth());
    const anchorBoundary = anchor
      ? placementMode === "inline"
        ? anchor.top
        : side === "after"
          ? anchor.bottom
          : anchor.top
      : Number.NaN;
    const anchorCanvasY = Number.isFinite(anchorBoundary)
      ? this.canvasWindowTop + (anchorBoundary - canvasRect.top) / Math.max(0.0001, scaleY)
      : Number.NaN;
    return {
      enabled: true,
      path: anchor?.path || previous?.path || this.file?.path || "",
      line,
      side,
      positionBasis: positionAnchor ? "above" : candidatesReady ? "document" : previous?.positionBasis || null,
      positionPath: positionAnchor?.path || previous?.positionPath || this.file?.path || "",
      positionLine: positionAnchor && Number.isFinite(position?.line)
        ? position.line
        : candidatesReady ? null : previous?.positionLine ?? null,
      positionVersion: 1,
      placementVersion: anchor && Number.isFinite(Number(line)) && ["before", "after"].includes(side)
        ? 1
        : previous?.placementVersion || 0,
      placementMode,
      inlineSide: placementMode === "inline" ? options.placement?.horizontalSide || previous?.inlineSide || "right" : null,
      leftSnap: placementMode === "row" ? options.placement?.leftSnap === true || !options.placement && previous?.leftSnap === true : false,
      rowOffset: Number.isFinite(anchorCanvasY)
        ? Math.max(0, bounds.minY - anchorCanvasY)
        : Math.max(0, Number(previous?.rowOffset) || 0),
      boxLeftRatio: (bounds.minX - Number(contentFrame?.left || 0)) / contentWidth,
      boxWidthRatio: Math.max(2 / contentWidth, (bounds.maxX - bounds.minX) / contentWidth),
      boxHeightRatio: Math.max(2 / contentWidth, (bounds.maxY - bounds.minY) / contentWidth),
      avoidancePath: "",
      avoidanceLine: null,
      gap: clamp(Number(stroke?.noteFlow?.gap) || 12, 4, 64)
    };
  }
  toggleSelectedFlowMode() {
    const selection = this.selectedFlowModeElements();
    if (!selection.total || !this.supportsNoteFlow()) {
      return;
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    const markdownBounds = new Map(selection.markdownBlocks.map((block) => [
      block.id,
      this.markdownElementCanvasBounds(this.markdownBlockElement(block), { forSelection: true })
    ]));
    this.resetNoteFlowSettle();
    this.clearNoteFlowLayout();
    this.noteFlowAvoidanceAnchors.clear();
    for (const index of selection.strokes) {
      const stroke = this.drawingData.strokes[index];
      if (normalizeNoteFlow(stroke.noteFlow)) {
        stroke.noteFlow = null;
        stroke.belowMarkdown = false;
      } else {
        stroke.noteFlow = this.captureNoteFlowAnchor(stroke);
        stroke.belowMarkdown = true;
      }
    }
    for (const block of selection.markdownBlocks) {
      if (block.floating) {
        block.floating = false;
        block.floatingExplicit = false;
        block.floatBox = null;
        continue;
      }
      const bounds = markdownBounds.get(block.id);
      if (!bounds) {
        continue;
      }
      block.floating = true;
      block.floatingExplicit = true;
      block.floatBox = normalizeMarkdownFloatBox({
        x: bounds.minX / this.canvasWidth(),
        y: bounds.minY / this.canvasHeight(),
        width: (bounds.maxX - bounds.minX) / this.canvasWidth(),
        height: (bounds.maxY - bounds.minY) / this.canvasHeight()
      });
    }
    this.captureResponsiveAnchorsForIndexes(selection.strokes);
    this.hideSelectionMenu();
    this.redoStack = [];
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.scheduleNoteFlowLayout({ operation: true });
    this.scheduleLayoutRefresh({ settle: false });
    this.syncSelectionMenuButtons();
    this.render();
  }
  noteFlowLayoutElement(element) {
    if (!element || !this.previewEl?.contains?.(element)) {
      return null;
    }
    const block = element.matches?.(MARKDOWN_TEXT_SELECTOR)
      ? element
      : element.closest?.(MARKDOWN_TEXT_SELECTOR);
    return block && this.previewEl.contains(block) && isConcreteMarkdownBlockElement(block)
      ? block
      : element;
  }
  noteFlowInlineLineCandidates(sourceElement, path, start, end) {
    if (sourceElement?.tagName !== "P" || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return [];
    }
    const layoutElement = this.noteFlowLayoutElement(sourceElement);
    if (!layoutElement) {
      return [];
    }
    const childNodes = Array.from(sourceElement.childNodes || []);
    const breakIndexes = childNodes.map((node, index) => node.nodeName === "BR" ? index : -1).filter((index) => index >= 0);
    if (!breakIndexes.length) {
      return [];
    }
    const candidates = [];
    let segmentStart = 0;
    const segmentCount = breakIndexes.length + 1;
    const appendSegment = (segmentEnd, segmentIndex) => {
      const nodes = childNodes.slice(segmentStart, segmentEnd).filter((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return Boolean(node.nodeValue?.trim());
        }
        return node.nodeType === Node.ELEMENT_NODE && !node.classList?.contains("notedraw-note-flow-line-spacer");
      });
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (!firstNode || !lastNode) {
        return;
      }
      const line = clamp(Math.round(start + segmentIndex * (end - start) / Math.max(1, segmentCount - 1)), start, end);
      try {
        const range = sourceElement.ownerDocument.createRange();
        range.setStartBefore(firstNode);
        range.setEndAfter(lastNode);
        const rects = Array.from(range.getClientRects?.() || []).filter((rect) => rect.width > 1 && rect.height > 1);
        if (!rects.length) {
          return;
        }
        candidates.push({
          element: layoutElement,
          sourceElement,
          path,
          start: line,
          end: line,
          top: Math.min(...rects.map((rect) => rect.top)),
          bottom: Math.max(...rects.map((rect) => rect.bottom)),
          lineSpacer: {
            key: `${path}\0${line}\0${segmentIndex}`,
            parent: sourceElement,
            before: firstNode
          }
        });
      } catch (error) {
        void error;
      }
    };
    for (let segmentIndex = 0; segmentIndex < breakIndexes.length; segmentIndex += 1) {
      const index = breakIndexes[segmentIndex];
      appendSegment(index, segmentIndex);
      segmentStart = index + 1;
    }
    appendSegment(childNodes.length, segmentCount - 1);
    return candidates;
  }
  noteFlowVisualLineCandidates(sourceElement, path, start, end) {
    if (!sourceElement?.ownerDocument?.createRange || !Number.isFinite(start) || !Number.isFinite(end)) {
      return [];
    }
    const layoutElement = this.noteFlowLayoutElement(sourceElement);
    if (!layoutElement) {
      return [];
    }
    const textNodes = [];
    const collectTextNodes = (parent) => {
      for (const node of Array.from(parent?.childNodes || [])) {
        if (node.nodeType === 3) {
          if (String(node.nodeValue || "").trim()) {
            textNodes.push(node);
          }
          continue;
        }
        if (node.nodeType === 1 && !node.classList?.contains("notedraw-note-flow-line-spacer")) {
          collectTextNodes(node);
        }
      }
    };
    collectTextNodes(sourceElement);
    const fragments = [];
    for (const node of textNodes) {
      try {
        const range = sourceElement.ownerDocument.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects?.() || [])) {
          if (rect.width > 1 && rect.height > 1) {
            fragments.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height });
          }
        }
      } catch (error) {
        void error;
      }
    }
    fragments.sort((a, b) => a.top - b.top || a.left - b.left);
    const lines = [];
    for (const fragment of fragments) {
      const line = lines.find((candidate) => {
        const tolerance = Math.max(2, Math.min(candidate.height, fragment.height) * 0.25);
        return Math.abs(candidate.top - fragment.top) <= tolerance;
      });
      if (line) {
        line.top = Math.min(line.top, fragment.top);
        line.bottom = Math.max(line.bottom, fragment.bottom);
        line.left = Math.min(line.left, fragment.left);
        line.right = Math.max(line.right, fragment.right);
        line.height = Math.max(line.height, fragment.height);
      } else {
        lines.push({ ...fragment });
      }
    }
    if (lines.length <= 1 && start === end) {
      return [];
    }
    const lineStart = Math.min(start, end);
    const lineEnd = Math.max(start, end);
    return lines.map((line, index) => {
      const sourceLine = Math.round(lineStart + index * (lineEnd - lineStart) / Math.max(1, lines.length - 1));
      return {
        element: layoutElement,
        sourceElement,
        path,
        start: sourceLine,
        end: sourceLine,
        top: line.top,
        bottom: line.bottom,
        visualLine: true
      };
    });
  }
  noteFlowCandidates() {
    const grouped = /* @__PURE__ */ new Map();
    let order = 0;
    for (const sourceElement of this.previewEl.querySelectorAll?.("[data-note-draw-line-start]") || []) {
      if (sourceElement.closest?.(".notedraw-body-control, .notedraw-embed-layer, .notedraw-underlay-embed-layer")) {
        continue;
      }
      if (sourceElement.matches?.(EDITABLE_SELECTOR) && !isConcreteMarkdownBlockElement(sourceElement)) {
        continue;
      }
      const start = parseInteger(sourceElement.dataset.noteDrawLineStart);
      const end = parseInteger(sourceElement.dataset.noteDrawLineEnd) ?? start;
      const element = this.noteFlowLayoutElement(sourceElement);
      const rect = element?.getBoundingClientRect?.();
      if (!element || !Number.isFinite(start) || !rect || rect.width <= 1 || rect.height <= 1) {
        continue;
      }
      const path = normalizeVaultPath(sourceElement.dataset.noteDrawSourcePath || this.file?.path || "");
      let byPath = grouped.get(element);
      if (!byPath) {
        byPath = /* @__PURE__ */ new Map();
        grouped.set(element, byPath);
      }
      const existing = byPath.get(path);
      if (existing) {
        existing.start = Math.min(existing.start, start);
        existing.end = Math.max(existing.end, end);
        continue;
      }
      byPath.set(path, {
        element,
        sourceElement,
        path,
        start,
        end,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        order: order++
      });
    }
    return Array.from(grouped.values()).flatMap((byPath) => Array.from(byPath.values()))
      .sort((a, b) => a.top - b.top || a.bottom - b.bottom || a.order - b.order);
  }
  noteFlowTargetElement(anchor, side = anchor?.side) {
    const descriptor = anchor?.lineSpacer;
    if (descriptor?.parent?.isConnected && descriptor.before?.isConnected) {
      const existing = this.noteFlowLineSpacers.get(descriptor.key);
      if (existing?.isConnected && existing.parentElement === descriptor.parent) {
        return existing;
      }
      existing?.remove?.();
      this.markNoteFlowLayoutMutation();
      const spacer = descriptor.parent.createSpan({
        cls: "notedraw-note-flow-line-spacer",
        attr: { "aria-hidden": "true" }
      });
      descriptor.parent.insertBefore(spacer, descriptor.before);
      this.noteFlowLineSpacers.set(descriptor.key, spacer);
      return spacer;
    }
    const heading = anchor?.sourceElement?.matches?.("h1,h2,h3,h4,h5,h6")
      ? anchor.sourceElement
      : null;
    const headingTag = heading?.tagName?.toLowerCase?.();
    const wrapper = headingTag ? heading.closest?.(`.el-${headingTag}`) || heading : null;
    if (!heading || !wrapper || !this.previewEl?.contains?.(wrapper) || !["before", "after"].includes(side)) {
      return anchor?.element || null;
    }
    const key = [anchor?.path || this.file?.path || "", anchor?.start, headingTag, side].join("\0");
    const legacySpacer = this.noteFlowBlockSpacers.get(key);
    if (legacySpacer) {
      this.noteFlowStyledElements.delete(legacySpacer);
      this.removeNoteFlowBlockSpacer(legacySpacer);
    }
    return wrapper;
  }
  noteFlowAnchorElement(noteFlow, allCandidates = null, strokeTop = Number.NaN) {
    const path = normalizeVaultPath(noteFlow?.path || this.file?.path || "");
    const line = Number(noteFlow?.line);
    if (!Number.isFinite(line)) {
      return null;
    }
    const candidates = (allCandidates || this.noteFlowCandidates()).filter((candidate) => {
      return candidate.path === path && line >= candidate.start && line <= candidate.end;
    });
    return selectStoredNoteFlowAnchorCandidate(candidates, {
      side: noteFlow?.side,
      strokeTop
    });
  }
  noteFlowStoredRowCanvasY(noteFlow, allCandidates = null) {
    const normalized = normalizeNoteFlow(noteFlow);
    const canvasRect = this.noteFlowCanvasRect();
    if (!normalized || !canvasRect || canvasRect.height <= 1) {
      return null;
    }
    const anchor = this.noteFlowAnchorElement(normalized, allCandidates);
    if (!anchor) {
      return null;
    }
    const side = normalized.side;
    const target = this.noteFlowTargetElement(anchor, side);
    const property = side === "after" ? "padding-bottom" : "padding-top";
    const applied = this.noteFlowStyledElements.get(target)?.get(property)?.applied || 0;
    const scaleY = canvasRect.height / Math.max(1, this.canvasRenderHeight);
    const rowTop = noteFlowReservedRowTop({
      side,
      anchorTop: anchor.top,
      anchorBottom: anchor.bottom,
      applied,
      scale: scaleY
    });
    return this.canvasWindowTop
      + (rowTop - canvasRect.top) / Math.max(0.0001, scaleY)
      + Math.max(0, Number(normalized.rowOffset) || 0);
  }
  alignNoteFlowStrokesToReservedRows(allCandidates = null) {
    if (this.draggingStroke || this.resizingSelection || !this.supportsNoteFlow() || !this.previewEl?.isConnected) {
      return false;
    }
    const canvasWidth = this.canvasWidth();
    const canvasHeight = this.canvasHeight();
    const contentFrame = this.getResponsiveContentFrame();
    const candidates = allCandidates || this.noteFlowCandidates();
    let changed = false;
    for (const stroke of this.drawingData?.strokes || []) {
      const noteFlow = normalizeNoteFlow(stroke?.noteFlow);
      const layout = normalizeElementLayout(stroke?.layout);
      if (!noteFlow || !layout || !(noteFlow.boxWidthRatio > 0) || !(noteFlow.boxHeightRatio > 0) || isConnectorStroke(stroke)) {
        continue;
      }
      const rowY = this.noteFlowStoredRowCanvasY(noteFlow, candidates);
      if (!Number.isFinite(rowY)) {
        continue;
      }
      const targetBox = projectStableNoteFlowBox({
        boxLeftRatio: noteFlow.boxLeftRatio,
        boxWidthRatio: noteFlow.boxWidthRatio,
        boxHeightRatio: noteFlow.boxHeightRatio,
        contentLeft: contentFrame?.left,
        contentWidth: contentFrame?.width,
        canvasWidth,
        y: rowY
      });
      const nextPoints = projectElementPoints(stroke.points, layout, targetBox, {
        canvasWidth,
        canvasHeight
      });
      const moved = nextPoints.some((point, index) => {
        const previous = stroke.points?.[index];
        return !previous
          || Math.abs(Number(point.x) - Number(previous.x)) * canvasWidth > 0.25
          || Math.abs(Number(point.y) - Number(previous.y)) * canvasHeight > 0.25;
      });
      if (!moved) {
        continue;
      }
      stroke.points = nextPoints;
      const metrics = scaleElementMetrics(layout.metrics, targetBox);
      if (metrics.width) {
        stroke.width = metrics.width;
      }
      changed = true;
    }
    if (changed) {
      this.invalidateStaticCache();
    }
    return changed;
  }
  frozenNoteFlowAnchorsReady(frozen = normalizeFrozenNoteFlowLayout(this.drawingData?.noteFlowLayout)) {
    if (!frozen.offsets.length) {
      return true;
    }
    const candidates = this.noteFlowCandidates();
    return frozen.offsets.every((record) => Boolean(this.noteFlowAnchorElement({
      path: record.path,
      line: record.line,
      side: record.side
    }, candidates)));
  }
  prepareFrozenNoteFlowLayout(options = {}) {
    if (this.destroyed || !this.drawingsLoaded || !this.previewEl?.isConnected) {
      return Promise.resolve(false);
    }
    if (this.noteFlowOperationPending || this.draggingStroke || this.resizingSelection || this.currentStroke?.noteFlow?.enabled) {
      return Promise.resolve(false);
    }
    const frozen = normalizeFrozenNoteFlowLayout(this.drawingData?.noteFlowLayout);
    annotateVisibleMarkdownElements(this.plugin.app, this.previewEl, this.file?.path || "");
    const restore = () => {
      if (this.destroyed || !this.drawingsLoaded || !this.previewEl?.isConnected) {
        return false;
      }
      const changed = this.restoreFrozenNoteFlowLayout();
      if (changed) {
        this.scheduleResize({ layout: false, measure: false });
      }
      return changed;
    };
    if (!frozen.offsets.length || this.frozenNoteFlowAnchorsReady(frozen)) {
      return Promise.resolve(restore());
    }
    if (this.frozenNoteFlowPreparation) {
      return this.frozenNoteFlowPreparation;
    }
    const filePath = this.file?.path || "";
    const generation = this.drawingLoadGeneration;
    const preparation = annotateRenderedMarkdownLines(this.plugin.app, this.previewEl, filePath).then(() => {
      if (this.destroyed || generation !== this.drawingLoadGeneration || this.file?.path !== filePath) {
        return false;
      }
      const changed = restore();
      if (options.retry !== false && !this.frozenNoteFlowAnchorsReady(frozen) && this.frozenNoteFlowRetryFrameId === null) {
        this.frozenNoteFlowRetryFrameId = window.requestAnimationFrame(() => {
          this.frozenNoteFlowRetryFrameId = null;
          this.prepareFrozenNoteFlowLayout({ retry: false }).catch((error) => {
            void error;
          });
        });
      }
      return changed;
    }).finally(() => {
      if (this.frozenNoteFlowPreparation === preparation) {
        this.frozenNoteFlowPreparation = null;
      }
    });
    this.frozenNoteFlowPreparation = preparation;
    return preparation;
  }
  scheduleFrozenNoteFlowLayoutRestore() {
    if (this.destroyed || !this.drawingsLoaded || this.frozenNoteFlowRestoreFrameId !== null) {
      return;
    }
    if (this.noteFlowOperationPending || this.draggingStroke || this.resizingSelection || this.currentStroke?.noteFlow?.enabled) {
      return;
    }
    this.frozenNoteFlowRestoreFrameId = window.requestAnimationFrame(() => {
      this.frozenNoteFlowRestoreFrameId = null;
      if (this.destroyed || this.noteFlowOperationPending || this.draggingStroke || this.resizingSelection) {
        return;
      }
      this.prepareFrozenNoteFlowLayout().catch((error) => {
        void error;
      });
    });
  }
  cancelFrozenNoteFlowLayoutRestore() {
    if (this.frozenNoteFlowRestoreFrameId !== null) {
      window.cancelAnimationFrame(this.frozenNoteFlowRestoreFrameId);
      this.frozenNoteFlowRestoreFrameId = null;
    }
    if (this.frozenNoteFlowRetryFrameId !== null) {
      window.cancelAnimationFrame(this.frozenNoteFlowRetryFrameId);
      this.frozenNoteFlowRetryFrameId = null;
    }
  }
  noteFlowStyleProperty(element, property) {
    return element?.classList?.contains("notedraw-note-flow-block-spacer") ? "height" : property;
  }
  removeNoteFlowBlockSpacer(element) {
    if (!element?.classList?.contains("notedraw-note-flow-block-spacer")) {
      return;
    }
    for (const [key, spacer] of this.noteFlowBlockSpacers || []) {
      if (spacer === element) {
        this.noteFlowBlockSpacers.delete(key);
      }
    }
    element._noteDrawMeasureElement = null;
    element.remove?.();
  }
  pruneDisconnectedNoteFlowLayout() {
    for (const [element, states] of Array.from(this.noteFlowStyledElements || [])) {
      if (!element?.isConnected) {
        for (const state of states.values()) {
          if (state.value) {
            element.style?.setProperty?.(state.styleProperty || state.property, state.value, state.priority || "");
          } else {
            element.style?.removeProperty?.(state.styleProperty || state.property);
          }
        }
        element.classList?.remove?.("notedraw-note-flow-anchor");
        this.noteFlowStyledElements.delete(element);
      }
    }
    for (const map of [this.noteFlowLineSpacers, this.noteFlowBlockSpacers]) {
      for (const [key, element] of Array.from(map || [])) {
        if (!element?.isConnected) {
          map.delete(key);
        }
      }
    }
  }
  updateFrozenNoteFlowLayout(offsets) {
    if (!this.drawingData) {
      return false;
    }
    const previous = frozenNoteFlowLayoutSignature(this.drawingData.noteFlowLayout);
    const next = normalizeFrozenNoteFlowLayout({ version: 1, offsets });
    const signature = frozenNoteFlowLayoutSignature(next);
    if (signature === previous) {
      return false;
    }
    this.drawingData.noteFlowLayout = next;
    return true;
  }
  restoreFrozenNoteFlowLayout() {
    if (!this.supportsNoteFlow() || !this.previewEl?.isConnected) {
      return false;
    }
    this.pruneDisconnectedNoteFlowLayout();
    const frozen = normalizeFrozenNoteFlowLayout(this.drawingData?.noteFlowLayout);
    if (!this.drawingsVisible || !frozen.offsets.length) {
      const changed = Boolean(this.noteFlowStyledElements?.size || this.noteFlowLineSpacers?.size);
      if (changed) {
        this.clearNoteFlowLayout();
      }
      this.noteFlowLayoutSignature = "";
      return changed;
    }
    const candidates = this.noteFlowCandidates();
    const wanted = /* @__PURE__ */ new Map();
    const wantedOwners = /* @__PURE__ */ new Map();
    let missingAnchor = false;
    for (const record of frozen.offsets) {
      const anchor = this.noteFlowAnchorElement({
        path: record.path,
        line: record.line,
        side: record.side
      }, candidates);
      const element = this.noteFlowTargetElement(anchor, record.side);
      if (!element) {
        missingAnchor = true;
        continue;
      }
      let offsets = wanted.get(element);
      if (!offsets) {
        offsets = /* @__PURE__ */ new Map();
        wanted.set(element, offsets);
      }
      const previousOffset = offsets.get(record.property) || 0;
      if (record.offset >= previousOffset) {
        offsets.set(record.property, record.offset);
        let owners = wantedOwners.get(element);
        if (!owners) {
          owners = /* @__PURE__ */ new Map();
          wantedOwners.set(element, owners);
        }
        owners.set(record.property, {
          ownerStrokeIndex: this.findNoteFlowOwnerStrokeIndex(record),
          ownerRecord: record
        });
      }
    }
    let changed = false;
    for (const [element, states] of Array.from(this.noteFlowStyledElements.entries())) {
      const elementOffsets = wanted.get(element);
      for (const [property, state] of Array.from(states.entries())) {
        if (elementOffsets?.has(property) || missingAnchor && element?.isConnected) {
          continue;
        }
        if (state.value) {
          element.style.setProperty(state.styleProperty || property, state.value, state.priority || "");
        } else {
          element.style.removeProperty(state.styleProperty || property);
        }
        states.delete(property);
        changed = true;
      }
      if (!states.size) {
        element.classList.remove("notedraw-note-flow-anchor");
        this.noteFlowStyledElements.delete(element);
        this.removeNoteFlowBlockSpacer(element);
      }
    }
    for (const [element, offsets] of wanted) {
      let states = this.noteFlowStyledElements.get(element);
      if (!states) {
        states = /* @__PURE__ */ new Map();
        this.noteFlowStyledElements.set(element, states);
      }
      for (const [property, offset] of offsets) {
        if (!states.has(property)) {
          const styleProperty = this.noteFlowStyleProperty(element, property);
          const value = element.style.getPropertyValue(styleProperty);
          const priority = element.style.getPropertyPriority(styleProperty);
          states.set(property, {
            property,
            styleProperty,
            value,
            priority,
            base: Number.parseFloat(window.getComputedStyle(element).getPropertyValue(styleProperty)) || 0,
            applied: 0,
            ownerStrokeIndex: -1,
            ownerRecord: null
          });
        }
        const state = states.get(property);
        const appliedValue = Math.ceil(state.base + offset);
        const nextValue = `${appliedValue}px`;
        if (element.style.getPropertyValue(state.styleProperty) !== nextValue || element.style.getPropertyPriority(state.styleProperty) !== "important") {
          this.markNoteFlowLayoutMutation();
          element.style.setProperty(state.styleProperty, nextValue, "important");
          changed = true;
        }
        state.applied = Math.max(0, appliedValue - state.base);
        const owner = wantedOwners.get(element)?.get(property);
        state.ownerStrokeIndex = owner?.ownerStrokeIndex ?? -1;
        state.ownerRecord = owner?.ownerRecord || null;
      }
      element.classList.add("notedraw-note-flow-anchor");
    }
    const aligned = this.alignNoteFlowStrokesToReservedRows(candidates);
    this.noteFlowLayoutSignature = `frozen:${frozenNoteFlowLayoutSignature(frozen)}`;
    return changed || aligned;
  }
  clearNoteFlowLayout() {
    if (this.noteFlowStyledElements?.size) {
      this.markNoteFlowLayoutMutation();
    }
    for (const [element, states] of this.noteFlowStyledElements || []) {
      if (!element?.style) {
        continue;
      }
      for (const state of states.values()) {
        if (state.value) {
          this.markNoteFlowLayoutMutation();
          element.style.setProperty(state.styleProperty || state.property, state.value, state.priority || "");
        } else {
          this.markNoteFlowLayoutMutation();
          element.style.removeProperty(state.styleProperty || state.property);
        }
      }
      element.classList.remove("notedraw-note-flow-anchor");
    }
    this.noteFlowStyledElements?.clear();
    for (const spacer of this.noteFlowLineSpacers?.values?.() || []) {
      spacer?.remove?.();
    }
    this.noteFlowLineSpacers?.clear();
    for (const spacer of this.noteFlowBlockSpacers?.values?.() || []) {
      if (spacer) {
        spacer._noteDrawMeasureElement = null;
      }
      spacer?.remove?.();
    }
    this.noteFlowBlockSpacers?.clear();
  }
  repairRunawayNoteFlowSurface(referenceHeight) {
    const viewportHeight = Math.max(1, this.previewEl?.clientHeight || this.canvasRenderHeight || 1);
    const { stableHeight, runawayThreshold } = noteFlowSurfaceRepairLimits(referenceHeight, viewportHeight);
    let repaired = false;
    for (const element of this.previewEl.querySelectorAll?.(".markdown-preview-sizer, .markdown-preview-section") || []) {
      const minHeight = Number.parseFloat(element.style?.minHeight) || 0;
      if (minHeight > runawayThreshold) {
        element.style.removeProperty("min-height");
        repaired = true;
      }
    }
    for (const element of this.previewEl.querySelectorAll?.(".notedraw-note-flow-anchor") || []) {
      const properties = ["padding-top", "padding-bottom", "margin-top", "margin-bottom"];
      if (element.classList?.contains("notedraw-note-flow-block-spacer")) {
        properties.push("height");
      }
      for (const property of properties) {
        if ((Number.parseFloat(element.style.getPropertyValue(property)) || 0) > runawayThreshold) {
          element.style.removeProperty(property);
          repaired = true;
        }
      }
    }
    if (this.canvasCssHeight > runawayThreshold) {
      this.canvasCssHeight = stableHeight;
      this.canvasWindowTop = clamp(this.canvasWindowTop, 0, Math.max(0, stableHeight - Math.min(stableHeight, this.canvasRenderHeight)));
      repaired = true;
    }
    for (const element of [this.underlayEmbedLayer, this.embedLayer, this.readingZoomExtent]) {
      if ((Number.parseFloat(element?.style?.height) || 0) > runawayThreshold) {
        element.style.setProperty("height", `${Math.ceil(stableHeight * (element === this.readingZoomExtent ? this.readingZoomScale() : 1))}px`);
        repaired = true;
      }
    }
    if (repaired) {
      this.responsivePointsInitialized = false;
      this.responsiveLayoutContext = null;
      this.responsiveLayoutSignature = "";
    }
    return repaired;
  }
  applyNoteFlowLayout() {
    this.noteFlowLayoutIncomplete = false;
    const editingNoteFlow = this.active && (
      this.noteFlowOperationPending
      || this.draggingStroke
      || this.resizingSelection
      || this.currentStroke?.noteFlow?.enabled
    );
    if (!editingNoteFlow || this.isReadingZoomInteractionActive()) {
      return false;
    }
    this.pruneDisconnectedNoteFlowLayout();
    if (!this.supportsNoteFlow() || !this.drawingsVisible || !this.canvas?.isConnected || !isElementVisibleEnough(this.previewEl)) {
      this.noteFlowLayoutIncomplete = this.hasNoteFlowElements();
      return false;
    }
    const contentFrame = this.getResponsiveContentFrame();
    const viewportHeight = Math.max(1, this.previewEl?.clientHeight || this.canvasRenderHeight || 1);
    const flows = (this.drawingData?.strokes || []).map((stroke, index) => ({ stroke, index })).filter(({ stroke }) => stroke?.noteFlow?.enabled && !isConnectorStroke(stroke)).map(({ stroke, index }) => {
      const bounds = getStrokeBounds(stroke, this.canvasWidth(), this.canvasHeight());
      if (!bounds) {
        return null;
      }
      const stabilized = stabilizeNoteFlowBounds({
        bounds,
        layout: normalizeElementLayout(stroke.layout),
        contentWidth: contentFrame.width,
        viewportHeight,
        preferCurrent: Boolean(normalizeNoteFlow(stroke.noteFlow)?.positionBasis)
      });
      return { stroke, index, ...stabilized };
    }).filter(Boolean).sort((a, b) => a.bounds.minY - b.bounds.minY);
    if (!flows.length) {
      this.noteFlowLayoutIncomplete = false;
      const frozenLayoutChanged = this.updateFrozenNoteFlowLayout([]);
      const changed = Boolean(this.noteFlowLayoutSignature) || frozenLayoutChanged;
      this.clearNoteFlowLayout();
      this.noteFlowLayoutSignature = "";
      if (frozenLayoutChanged && this.noteFlowPersistencePending && this.file && this.drawingData) {
        this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: this.noteFlowPersistencePending });
      }
      return changed;
    }
    const runawayReferenceHeight = flows.filter((item) => item.runaway).reduce((height, item) => Math.max(height, item.referenceHeight), 0);
    if (runawayReferenceHeight > 0) {
      this.repairRunawayNoteFlowSurface(runawayReferenceHeight);
    }
    const canvasRect = this.noteFlowCanvasRect();
    if (!canvasRect || canvasRect.width <= 1 || canvasRect.height <= 1) {
      this.noteFlowLayoutIncomplete = true;
      return false;
    }
    const scaleY = canvasRect.height > 0 ? canvasRect.height / Math.max(1, this.canvasRenderHeight) : 1;
    const candidates = this.noteFlowCandidates();
    let missingStableAnchor = candidates.length === 0;
    const canRepairStoredAnchors = this.noteFlowAnchorRepairReady
      && !this.noteFlowAnchorRepairComplete
      && Date.now() - this.lastScrollAt > 480;
    const offsets = /* @__PURE__ */ new Map();
    const offsetDescriptors = /* @__PURE__ */ new Map();
    let migratedAnchor = false;
    let updatedNoteFlowMetadata = false;
    for (const item of flows) {
      let currentNoteFlow = normalizeNoteFlow(item.stroke.noteFlow);
      const hasStoredAnchor = hasStableNoteFlowAnchor(currentNoteFlow);
      if (!hasStoredAnchor) {
        const recaptured = this.captureNoteFlowAnchor(item.stroke, { preservePlacement: true });
        const resolved = Number.isFinite(recaptured?.line) && ["before", "after"].includes(recaptured?.side) && Boolean(recaptured?.positionBasis);
        if (resolved) {
          item.stroke.noteFlow = recaptured;
          currentNoteFlow = recaptured;
          this.captureNoteFlowResponsiveAnchors(item.stroke, this.getResponsiveLayoutContext(true));
          migratedAnchor = true;
        } else {
          item.stroke.noteFlow = currentNoteFlow;
        }
      }
      const exactPlacement = hasExactNoteFlowPlacement(currentNoteFlow);
      const strokeTop = canvasRect.top + (item.bounds.minY - this.canvasWindowTop) * scaleY;
      const strokeBottom = canvasRect.top + (item.bounds.maxY - this.canvasWindowTop) * scaleY;
      let anchor = this.noteFlowAnchorElement(currentNoteFlow, candidates, exactPlacement ? Number.NaN : strokeTop);
      const previewRect = this.previewEl.getBoundingClientRect();
      const strokeNearViewport = strokeTop >= previewRect.top - 64 && strokeTop <= previewRect.bottom + 64;
      if (!hasStoredAnchor && anchor && currentNoteFlow?.side === "before" && anchor.top < strokeTop - 4) {
        const recaptured = this.captureNoteFlowAnchor(item.stroke);
        const correctedAnchor = this.noteFlowAnchorElement(recaptured, candidates, strokeTop);
        if (correctedAnchor) {
          item.stroke.noteFlow = recaptured;
          currentNoteFlow = recaptured;
          anchor = correctedAnchor;
          this.captureNoteFlowResponsiveAnchors(item.stroke, this.getResponsiveLayoutContext(true));
          migratedAnchor = true;
        }
      }
      const samePathCandidates = candidates.filter((candidate) => candidate.path === normalizeVaultPath(currentNoteFlow?.path || this.file?.path || ""));
      const storedLine = Number(currentNoteFlow?.line);
      const renderedStart = Math.min(...samePathCandidates.map((candidate) => candidate.start));
      const renderedEnd = Math.max(...samePathCandidates.map((candidate) => candidate.end));
      const staleStoredAnchor = canRepairStoredAnchors
        && hasStoredAnchor
        && samePathCandidates.length > 1
        && Number.isFinite(storedLine)
        && (storedLine < renderedStart || storedLine > renderedEnd)
        && strokeNearViewport;
      if (!anchor && !exactPlacement && (!hasStoredAnchor || staleStoredAnchor)) {
        const recaptured = this.captureNoteFlowAnchor(item.stroke);
        anchor = this.noteFlowAnchorElement(recaptured, candidates, strokeTop);
        if (anchor && recaptured?.positionBasis) {
          item.stroke.noteFlow = recaptured;
          currentNoteFlow = recaptured;
          this.captureNoteFlowResponsiveAnchors(item.stroke, this.getResponsiveLayoutContext(true));
          migratedAnchor = true;
        }
      }
      const avoidanceKey = strokeElementId(item.stroke) || String(item.index);
      if (exactPlacement) {
        this.noteFlowAvoidanceAnchors.delete(avoidanceKey);
        if (currentNoteFlow.avoidancePath || Number.isFinite(currentNoteFlow.avoidanceLine)) {
          item.stroke.noteFlow = {
            ...currentNoteFlow,
            avoidancePath: "",
            avoidanceLine: null
          };
          currentNoteFlow = item.stroke.noteFlow;
          updatedNoteFlowMetadata = true;
        }
      }
      let avoidanceReference = exactPlacement
        ? null
        : noteFlowAvoidanceReference(currentNoteFlow, this.file?.path)
          || this.noteFlowAvoidanceAnchors.get(avoidanceKey)
          || null;
      let avoidanceAnchor = avoidanceReference ? this.noteFlowAnchorElement({
        path: avoidanceReference.path,
        line: avoidanceReference.line,
        side: "before"
      }, candidates, strokeTop) : null;
      if (avoidanceAnchor && !selectNoteFlowAvoidanceCandidate([avoidanceAnchor], { strokeTop, strokeBottom })) {
        avoidanceReference = null;
        avoidanceAnchor = null;
        this.noteFlowAvoidanceAnchors.delete(avoidanceKey);
        item.stroke.noteFlow = {
          ...currentNoteFlow,
          avoidancePath: "",
          avoidanceLine: null
        };
        currentNoteFlow = item.stroke.noteFlow;
        updatedNoteFlowMetadata = true;
      }
      if (!exactPlacement && !avoidanceReference) {
        avoidanceAnchor = selectNoteFlowAvoidanceCandidate(candidates, { strokeTop, strokeBottom });
        if (avoidanceAnchor) {
          avoidanceReference = { path: avoidanceAnchor.path, line: avoidanceAnchor.start };
          this.noteFlowAvoidanceAnchors.set(avoidanceKey, avoidanceReference);
          item.stroke.noteFlow = {
            ...currentNoteFlow,
            avoidancePath: avoidanceReference.path,
            avoidanceLine: avoidanceReference.line
          };
          currentNoteFlow = item.stroke.noteFlow;
          updatedNoteFlowMetadata = true;
        }
      }
      if (avoidanceReference && !avoidanceAnchor) {
        missingStableAnchor = true;
        continue;
      }
      const selectedAnchor = exactPlacement ? anchor : avoidanceAnchor || anchor;
      const side = exactPlacement ? currentNoteFlow.side : avoidanceAnchor ? "before" : currentNoteFlow.side;
      const element = this.noteFlowTargetElement(selectedAnchor, side);
      if (!element) {
        missingStableAnchor = true;
        continue;
      }
      const property = side === "after" ? "padding-bottom" : "padding-top";
      let states = this.noteFlowStyledElements.get(element);
      if (!states) {
        states = /* @__PURE__ */ new Map();
        this.noteFlowStyledElements.set(element, states);
      }
      if (!states.has(property)) {
        const styleProperty = this.noteFlowStyleProperty(element, property);
        const value = element.style.getPropertyValue(styleProperty);
        const priority = element.style.getPropertyPriority(styleProperty);
        states.set(property, {
          property,
          styleProperty,
          value,
          priority,
          base: Number.parseFloat(window.getComputedStyle(element).getPropertyValue(styleProperty)) || 0,
          applied: 0,
          ownerStrokeIndex: -1,
          ownerRecord: null
        });
      }
      const state = states.get(property);
      const stableHeight = currentNoteFlow.boxHeightRatio > 0
        ? currentNoteFlow.boxHeightRatio * Math.max(1, contentFrame.width)
        : Math.max(0, item.bounds.maxY - item.bounds.minY);
      // The reservation belongs to the logical row, like a Markdown block's
      // grid row. It is derived from stable box geometry, never from an anchor
      // that may already contain our padding, so repeated layout is idempotent.
      const required = noteFlowRowReservation({
        rowOffset: currentNoteFlow.rowOffset,
        boxHeight: stableHeight,
        gap: currentNoteFlow.gap
      });
      let elementOffsets = offsets.get(element);
      if (!elementOffsets) {
        elementOffsets = /* @__PURE__ */ new Map();
        offsets.set(element, elementOffsets);
      }
      const previousOffset = elementOffsets.get(property) || 0;
      if (required >= previousOffset) {
        elementOffsets.set(property, required);
        let descriptors = offsetDescriptors.get(element);
        if (!descriptors) {
          descriptors = /* @__PURE__ */ new Map();
          offsetDescriptors.set(element, descriptors);
        }
        descriptors.set(property, {
          path: normalizeVaultPath(selectedAnchor?.path || currentNoteFlow?.path || this.file?.path || ""),
          line: exactPlacement ? currentNoteFlow.line : side === "after" ? selectedAnchor?.end : selectedAnchor?.start,
          side,
          property,
          ownerId: strokeElementId(item.stroke),
          ownerStrokeIndex: item.index
        });
      }
    }
    let layoutStyleChanged = false;
    for (const [element, states] of Array.from(this.noteFlowStyledElements.entries())) {
      const elementOffsets = offsets.get(element);
      for (const [property, state] of Array.from(states.entries())) {
        if (elementOffsets?.has(property)) {
          continue;
        }
        if (missingStableAnchor && this.noteFlowLayoutSignature) {
          continue;
        }
        if (state.value) {
          element.style.setProperty(state.styleProperty || state.property, state.value, state.priority || "");
        } else {
          element.style.removeProperty(state.styleProperty || state.property);
        }
        states.delete(property);
        layoutStyleChanged = true;
      }
      if (!states.size) {
        element.classList.remove("notedraw-note-flow-anchor");
        this.noteFlowStyledElements.delete(element);
        this.removeNoteFlowBlockSpacer(element);
      }
    }
    for (const [element, elementOffsets] of offsets) {
      const states = this.noteFlowStyledElements.get(element);
      for (const [property, offset] of elementOffsets) {
        const state = states.get(property);
        const appliedValue = Math.ceil(state.base + offset);
        const nextValue = `${appliedValue}px`;
        if (element.style.getPropertyValue(state.styleProperty) !== nextValue || element.style.getPropertyPriority(state.styleProperty) !== "important") {
          this.markNoteFlowLayoutMutation();
          element.style.setProperty(state.styleProperty, nextValue, "important");
          layoutStyleChanged = true;
        }
        state.applied = Math.max(0, appliedValue - state.base);
        const descriptor = offsetDescriptors.get(element)?.get(property);
        state.ownerStrokeIndex = descriptor?.ownerStrokeIndex ?? -1;
        state.ownerRecord = descriptor || null;
      }
      element.classList.add("notedraw-note-flow-anchor");
    }
    const signature = Array.from(offsets, ([element, elementOffsets]) => {
      return Array.from(elementOffsets, ([property, offset]) => `${property}:${Math.round(offset)}`).join(",");
    }).join("|");
    const frozenOffsets = [];
    for (const [element, elementOffsets] of offsets) {
      const descriptors = offsetDescriptors.get(element);
      for (const [property, offset] of elementOffsets) {
        const descriptor = descriptors?.get(property);
        if (descriptor && Number.isFinite(Number(descriptor.line))) {
          frozenOffsets.push({ ...descriptor, line: Number(descriptor.line), offset });
        }
      }
    }
    const aligned = this.alignNoteFlowStrokesToReservedRows(candidates);
    const frozenLayoutChanged = !missingStableAnchor && this.updateFrozenNoteFlowLayout(frozenOffsets);
    this.captureReadingLogicalSizerHeight(undefined, { allowGrowth: true });
    this.noteFlowLayoutIncomplete = missingStableAnchor;
    if (canRepairStoredAnchors) {
      this.noteFlowAnchorRepairComplete = true;
      if (missingStableAnchor) {
        this.noteFlowAnchorRepairComplete = false;
      }
    }
    if (this.noteFlowPersistencePending && (migratedAnchor || updatedNoteFlowMetadata || frozenLayoutChanged) && this.file && this.drawingData) {
      this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: this.noteFlowPersistencePending });
    }
    const changed = aligned || migratedAnchor || updatedNoteFlowMetadata || frozenLayoutChanged || layoutStyleChanged || signature !== this.noteFlowLayoutSignature;
    this.noteFlowLayoutSignature = signature;
    return changed;
  }
  markNoteFlowLayoutMutation() {
    this.noteFlowSuppressResizeUntil = Math.max(this.noteFlowSuppressResizeUntil, Date.now() + 180);
    if (!this.destroyed && this.resizeFrameId !== null && this.resizeNeedsLayout) {
      this.cancelResizeFrame();
      this.scheduleResize({ layout: false, measure: false });
    }
  }
  noteFlowSettleEpochSignature() {
    const frame = this.getResponsiveContentFrame();
    return [
      this.file?.path || "",
      this.surfaceType,
      Math.round(Number(this.previewEl?.clientWidth) || 0),
      Math.round(Number(frame?.left) || 0),
      Math.round(Number(frame?.width) || 0),
      Math.round(this.readingZoomScale() * 1e3),
      this.layoutRefreshGeneration
    ].join(":");
  }
  resetNoteFlowSettle() {
    this.noteFlowSettleEpoch = "";
    this.noteFlowSettlePasses = 0;
  }
  scheduleNoteFlowAnchorRepair() {
    if (this.destroyed || !this.active || !this.noteFlowOperationPending || this.noteFlowAnchorRepairComplete || this.noteFlowAnchorRepairTimer !== null) {
      return;
    }
    this.noteFlowAnchorRepairTimer = window.setTimeout(() => {
      this.noteFlowAnchorRepairTimer = null;
      if (this.destroyed || !this.active || !this.noteFlowOperationPending || this.noteFlowAnchorRepairComplete || !this.previewEl?.isConnected) {
        return;
      }
      const layoutBusy = this.markdownAnnotationTimer !== null || Date.now() < this.noteFlowSuppressResizeUntil;
      if (layoutBusy || Date.now() - this.lastScrollAt <= 700) {
        this.scheduleNoteFlowAnchorRepair();
        return;
      }
      this.noteFlowAnchorRepairReady = true;
      // The first activation can run before Obsidian has attached line
      // metadata. Refresh the annotations once more before giving up on the
      // stored anchor; otherwise a failed first pass leaves NoteFlow pending
      // forever, which is especially visible after a large zoom.
      this.scheduleMarkdownAnnotationRefresh({ layout: false, delay: 0 });
      this.scheduleNoteFlowLayout();
    }, 700);
  }
  scheduleNoteFlowSettleResize() {
    if (this.destroyed || this.noteFlowResizeTimer !== null) {
      return;
    }
    const epoch = this.noteFlowSettleEpochSignature();
    if (epoch !== this.noteFlowSettleEpoch) {
      this.noteFlowSettleEpoch = epoch;
      this.noteFlowSettlePasses = 0;
    }
    if (this.noteFlowSettlePasses >= 2) {
      return;
    }
    const delay = Math.max(34, this.noteFlowSuppressResizeUntil - Date.now() + 20);
    this.noteFlowResizeTimer = window.setTimeout(() => {
      this.noteFlowResizeTimer = null;
      if (this.destroyed) {
        return;
      }
      if (this.draggingStroke || this.isReadingZoomInteractionActive() || Date.now() < this.noteFlowSuppressResizeUntil) {
        this.scheduleNoteFlowSettleResize();
        return;
      }
      const currentEpoch = this.noteFlowSettleEpochSignature();
      if (currentEpoch !== this.noteFlowSettleEpoch) {
        this.noteFlowSettleEpoch = currentEpoch;
        this.noteFlowSettlePasses = 0;
      }
      if (this.noteFlowSettlePasses >= 2) {
        return;
      }
      this.noteFlowSettlePasses += 1;
      this.scheduleResize({ layout: false, measure: true, preserveAbsolutePlacement: true });
    }, delay);
  }
  reflowNoteFlowElementsAfterDrag(movedIndexes, placement = null) {
    if (!this.supportsNoteFlow() || !this.dragStrokeOriginalPoints?.size) {
      return [];
    }
    const moved = new Set((movedIndexes || []).filter((index) => {
      const stroke = this.drawingData?.strokes?.[index];
      return normalizeNoteFlow(stroke?.noteFlow) && !isConnectorStroke(stroke);
    }));
    if (!moved.size) {
      return [];
    }
    const canvasWidth = this.canvasWidth();
    const canvasHeight = this.canvasHeight();
    const canvasRect = this.noteFlowCanvasRect();
    const scaleY = canvasRect?.height > 1 ? canvasRect.height / Math.max(1, this.canvasRenderHeight) : 1;
    const candidates = canvasRect?.height > 1 ? this.noteFlowCandidates() : [];
    const items = [];
    for (const [index, stroke] of (this.drawingData?.strokes || []).entries()) {
      const noteFlow = normalizeNoteFlow(stroke?.noteFlow);
      if (!noteFlow || isConnectorStroke(stroke)) {
        continue;
      }
      const bounds = getStrokeBounds(stroke, canvasWidth, canvasHeight);
      if (!bounds) {
        continue;
      }
      const movedItem = moved.has(index);
      const path = normalizeVaultPath(movedItem ? placement?.path : noteFlow.path || this.file?.path || "");
      const line = Number(movedItem ? placement?.line : noteFlow.line);
      const side = movedItem ? placement?.side : noteFlow.side;
      const placementMode = movedItem
        ? placement?.horizontalSide ? "inline" : "row"
        : noteFlow.placementMode;
      const anchor = movedItem && placement?.candidate
        ? placement.candidate
        : path && Number.isFinite(line) && ["before", "after"].includes(side)
          ? candidates.filter((candidate) => (
          normalizeVaultPath(candidate.path || this.file?.path || "") === path
          && line >= Number(candidate.start)
          && line <= Number(candidate.end)
        )).sort((a, b) => (
          Number(Boolean(b.lineSpacer)) - Number(Boolean(a.lineSpacer))
          || (a.bottom - a.top) - (b.bottom - b.top)
          || a.order - b.order
          ))[0] || null
          : null;
      const anchorBoundary = anchor
        ? placementMode === "inline" ? anchor.top : side === "after" ? anchor.bottom : anchor.top
        : Number.NaN;
      const baseMinY = Number.isFinite(anchorBoundary) && canvasRect
        ? this.canvasWindowTop + (anchorBoundary - canvasRect.top) / Math.max(0.0001, scaleY)
        : bounds.minY;
      items.push({
        id: strokeElementId(stroke) || String(index),
        index,
        order: index,
        minX: bounds.minX,
        maxX: bounds.maxX,
        minY: bounds.minY,
        maxY: bounds.maxY,
        baseMinY,
        originalMinY: bounds.minY,
        moved: movedItem,
        rowKey: path && Number.isFinite(line) && ["before", "after"].includes(side)
          ? `${path}\0${Math.floor(line)}\0${side}`
          : "",
        align: "top",
        gap: Math.min(8, noteFlow.gap)
      });
    }
    const placements = reflowNoteFlowRectangles(items);
    const changed = [];
    for (const placement of placements) {
      if (Math.abs(placement.deltaY) < 0.5) {
        continue;
      }
      const stroke = this.drawingData.strokes[placement.index];
      if (!stroke || stroke.locked) {
        continue;
      }
      const deltaY = placement.deltaY / Math.max(1, canvasHeight);
      stroke.points = stroke.points.map((point) => ({
        ...point,
        y: clamp(Number(point.y) + deltaY, 0, 1)
      }));
      changed.push(placement.index);
    }
    if (changed.length) {
      this.invalidateStaticCache();
    }
    return changed;
  }
  queueDraggedNoteFlowRefresh(indexes) {
    let queued = false;
    for (const index of indexes || []) {
      const stroke = this.drawingData?.strokes?.[index];
      if (stroke?.noteFlow?.enabled && !isConnectorStroke(stroke)) {
        this.pendingDraggedNoteFlowIndexes.add(index);
        queued = true;
      }
    }
    // A drag already has a final anchor/reflow pass on release. Running the
    // full NoteFlow layout on every pointer frame makes long notes fight the
    // pointer and is the main source of drag stalls.
    if (queued && !this.draggingStroke) {
      this.scheduleNoteFlowLayout();
    }
  }
  refreshDraggedNoteFlowAnchors() {
    if (!this.draggingStroke || !this.pendingDraggedNoteFlowIndexes.size) {
      this.pendingDraggedNoteFlowIndexes.clear();
      return false;
    }
    const indexes = Array.from(this.pendingDraggedNoteFlowIndexes);
    this.pendingDraggedNoteFlowIndexes.clear();
    this.clearNoteFlowLayout();
    let refreshed = false;
    for (const index of indexes) {
      const stroke = this.drawingData?.strokes?.[index];
      const current = normalizeNoteFlow(stroke?.noteFlow);
      if (!stroke || !current || isConnectorStroke(stroke)) {
        continue;
      }
      const captured = this.captureNoteFlowAnchor(stroke);
      stroke.noteFlow = {
        ...current,
        enabled: true,
        path: captured.path,
        line: captured.line,
        side: captured.side,
        gap: captured.gap
      };
      refreshed = true;
    }
    return refreshed;
  }
  scheduleNoteFlowLayout(options = {}) {
    if (options.operation === true && this.active) {
      this.cancelFrozenNoteFlowLayoutRestore();
      this.noteFlowOperationPending = true;
      this.noteFlowPersistencePending = true;
    }
    const editingNoteFlow = this.active && (
      this.noteFlowOperationPending
      || this.draggingStroke
      || this.resizingSelection
      || this.currentStroke?.noteFlow?.enabled
    );
    if (!editingNoteFlow) {
      return;
    }
    if (options.defer === true) {
      return;
    }
    if (this.noteFlowFrameId !== null || this.noteFlowFallbackTimer !== null) {
      return;
    }
    const run = () => {
      if (this.noteFlowFrameId !== null) {
        window.cancelAnimationFrame(this.noteFlowFrameId);
        this.noteFlowFrameId = null;
      }
      if (this.noteFlowFallbackTimer !== null) {
        window.clearTimeout(this.noteFlowFallbackTimer);
        this.noteFlowFallbackTimer = null;
      }
      if (this.destroyed) {
        return;
      }
      const refreshedDraggedFlow = this.refreshDraggedNoteFlowAnchors();
      const layoutChanged = this.applyNoteFlowLayout() || refreshedDraggedFlow;
      if (!this.draggingStroke && !this.resizingSelection) {
        if (this.noteFlowLayoutIncomplete) {
          this.scheduleNoteFlowAnchorRepair();
        } else {
          this.noteFlowOperationPending = false;
          this.noteFlowPersistencePending = false;
        }
      }
      if (layoutChanged && !this.draggingStroke) {
        this.scheduleNoteFlowSettleResize();
      }
    };
    this.noteFlowFrameId = window.requestAnimationFrame(run);
    this.noteFlowFallbackTimer = window.setTimeout(run, 120);
  }
  cancelNoteFlowLayout() {
    this.noteFlowOperationPending = false;
    this.noteFlowPersistencePending = false;
    this.noteFlowLayoutIncomplete = false;
    if (this.noteFlowFrameId !== null) {
      window.cancelAnimationFrame(this.noteFlowFrameId);
      this.noteFlowFrameId = null;
    }
    if (this.noteFlowFallbackTimer !== null) {
      window.clearTimeout(this.noteFlowFallbackTimer);
      this.noteFlowFallbackTimer = null;
    }
    if (this.noteFlowResizeTimer !== null) {
      window.clearTimeout(this.noteFlowResizeTimer);
      this.noteFlowResizeTimer = null;
    }
    if (this.noteFlowAnchorRepairTimer !== null) {
      window.clearTimeout(this.noteFlowAnchorRepairTimer);
      this.noteFlowAnchorRepairTimer = null;
    }
  }
  getSelectedStrokeIndexes() {
    if (this.selectedStrokeIndexes?.size) {
      return Array.from(this.selectedStrokeIndexes).filter((index) => index >= 0 && index < this.drawingData.strokes.length).sort((a, b) => a - b);
    }
    if (this.selectedStrokeIndex >= 0 && this.selectedStrokeIndex < this.drawingData.strokes.length) {
      return [this.selectedStrokeIndex];
    }
    return [];
  }
  isStrokeSelected(index) {
    return Boolean(this.selectedStrokeIndexes?.has(index)) || !this.selectedStrokeIndexes?.size && this.selectedStrokeIndex === index;
  }
  selectionHasDomStrokes() {
    return this.getSelectedMarkdownBlocks().length > 0 || this.getSelectedStrokeIndexes().some((index) => {
      const stroke = this.drawingData.strokes[index];
      return isEmbedStroke(stroke) || isRichTextStroke(stroke);
    });
  }
  getSelectedStrokeBounds() {
    const indexes = this.getSelectedStrokeIndexes();
    let result = this.getStrokeIndexesBounds(indexes);
    for (const block of this.getSelectedMarkdownBlocks()) {
      const bounds = this.markdownElementCanvasBounds(this.markdownBlockElement(block), { forSelection: true });
      if (!bounds) {
        continue;
      }
      result = result ? {
        minX: Math.min(result.minX, bounds.minX),
        maxX: Math.max(result.maxX, bounds.maxX),
        minY: Math.min(result.minY, bounds.minY),
        maxY: Math.max(result.maxY, bounds.maxY)
      } : { ...bounds };
    }
    return result;
  }
  selectionStateKey() {
    const strokeIds = this.getSelectedStrokeIndexes().map((index) => strokeElementId(this.drawingData?.strokes?.[index]) || `index:${index}`);
    const markdownIds = this.getSelectedMarkdownBlocks().map((block) => block.id);
    return `${strokeIds.join(",")}|${markdownIds.join(",")}`;
  }
  invalidateSelectionFrameSnapshot() {
    this.selectionFrameSnapshot = null;
  }
  captureSelectionFrameSnapshot({ force = false } = {}) {
    if (this.selectionFrameAwaitingMarkdownSync && !this.draggingStroke) {
      this.selectionFrameSnapshot = null;
      return null;
    }
    if (!this.hasHybridSelection()) {
      this.selectionFrameSnapshot = null;
      return null;
    }
    const key = this.selectionStateKey();
    if (!force && this.selectionFrameSnapshot?.key === key) {
      return this.selectionFrameSnapshot.rect;
    }
    const bounds = this.getSelectedStrokeBounds();
    if (!bounds) {
      this.selectionFrameSnapshot = null;
      return null;
    }
    const padding = this.selectionFramePaddingPx();
    const rect = {
      x: bounds.minX - padding,
      y: bounds.minY - padding,
      width: bounds.maxX - bounds.minX + padding * 2,
      height: bounds.maxY - bounds.minY + padding * 2
    };
    this.selectionFrameSnapshot = { key, rect };
    return rect;
  }
  noteFlowAppliedVerticalInsets(element) {
    const insets = { top: 0, bottom: 0 };
    const states = this.noteFlowStyledElements?.get(element);
    if (!states) {
      return insets;
    }
    for (const state of states.values()) {
      const applied = Math.max(0, Number(state.applied) || 0);
      if (state.styleProperty === "padding-top") {
        insets.top += applied;
      } else if (state.styleProperty === "padding-bottom") {
        insets.bottom += applied;
      }
    }
    return insets;
  }
  markdownElementVisibleClientRect(element) {
    const rect = element?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const localHeight = Number(element.offsetHeight) || 0;
    const visualScale = localHeight > 0 ? rect.height / localHeight : this.readingZoomScale();
    const flowInsets = this.noteFlowAppliedVerticalInsets(element);
    return trimMarkdownClientRect(rect, {
      insetTop: flowInsets.top,
      insetBottom: flowInsets.bottom,
      scale: visualScale
    });
  }
  markdownElementContainsClientPoint(element, clientPoint = null) {
    if (!clientPoint || !Number.isFinite(Number(clientPoint.x)) || !Number.isFinite(Number(clientPoint.y))) {
      return true;
    }
    const visibleRect = this.markdownElementVisibleClientRect(element);
    if (clientPointInRect(visibleRect, clientPoint)) {
      return true;
    }
    return clientPointInRect(this.markdownTaskCheckboxRect(element, visibleRect), clientPoint);
  }
  markdownTaskCheckboxRect(element, elementRect = null) {
    const listItem = element?.closest?.("li");
    if (!listItem) {
      return null;
    }
    let hasTaskCheckbox = false;
    for (const checkbox of listItem.querySelectorAll?.("input.task-list-item-checkbox, input[type='checkbox']") || []) {
      if (checkbox.closest?.("li") !== listItem) {
        continue;
      }
      hasTaskCheckbox = true;
      const rect = checkbox.getBoundingClientRect?.();
      if (rect?.width > 0 && rect?.height > 0) {
        return rect;
      }
    }
    const taskLike = hasTaskCheckbox
      || listItem.matches?.(".task-list-item, [data-task], [data-task-status]")
      || element?.matches?.(".task-list-item, [data-task], [data-task-status]");
    if (!taskLike) {
      return null;
    }
    const base = elementRect || element?.getBoundingClientRect?.();
    const listRect = listItem.getBoundingClientRect?.();
    const left = Number.isFinite(listRect?.left) ? listRect.left : base?.left;
    const top = Number.isFinite(base?.top) ? base.top : listRect?.top;
    const bottom = Number.isFinite(base?.bottom) ? base.bottom : listRect?.bottom;
    if (![left, top, bottom].every(Number.isFinite) || bottom <= top) {
      return null;
    }
    const markerWidth = Math.max(14, Math.min(24, bottom - top));
    return {
      left,
      right: left + markerWidth,
      top,
      bottom,
      width: markerWidth,
      height: bottom - top
    };
  }
  markdownElementCanvasBounds(element, { forSelection = false } = {}) {
    if (!element?.isConnected || !this.canvas) {
      return null;
    }
    const elementRect = element.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    if (elementRect.width <= 0 || elementRect.height <= 0 || canvasRect.width <= 0 || canvasRect.height <= 0) {
      return null;
    }
    let left = elementRect.left;
    let right = elementRect.right;
    let top = elementRect.top;
    let bottom = elementRect.bottom;
    if (forSelection) {
      const localHeight = Number(element.offsetHeight) || 0;
      const visualScale = localHeight > 0 ? elementRect.height / localHeight : this.readingZoomScale();
      const flowInsets = this.noteFlowAppliedVerticalInsets(element);
      top += flowInsets.top * visualScale;
      bottom -= flowInsets.bottom * visualScale;
      const checkboxRect = this.markdownTaskCheckboxRect(element, elementRect);
      if (checkboxRect) {
        left = Math.min(left, checkboxRect.left);
        right = Math.max(right, checkboxRect.right);
        top = Math.min(top, checkboxRect.top);
        bottom = Math.max(bottom, checkboxRect.bottom);
      }
    }
    if (right <= left || bottom <= top) {
      return null;
    }
    const scaleX = this.canvasWidth() / canvasRect.width;
    const scaleY = this.canvasRenderHeight / canvasRect.height;
    return {
      minX: (left - canvasRect.left) * scaleX,
      maxX: (right - canvasRect.left) * scaleX,
      minY: this.canvasWindowTop + (top - canvasRect.top) * scaleY,
      maxY: this.canvasWindowTop + (bottom - canvasRect.top) * scaleY
    };
  }
  getStrokeIndexesBounds(indexes) {
    let result = null;
    for (const index of indexes) {
      const bounds = getStrokeBounds(this.drawingData.strokes[index], this.canvasWidth(), this.canvasHeight());
      if (!bounds) {
        continue;
      }
      result = result ? {
        minX: Math.min(result.minX, bounds.minX),
        maxX: Math.max(result.maxX, bounds.maxX),
        minY: Math.min(result.minY, bounds.minY),
        maxY: Math.max(result.maxY, bounds.maxY)
      } : { ...bounds };
    }
    return result;
  }
  getStrokeIndexesNormalizedBounds(indexes) {
    const bounds = this.getStrokeIndexesBounds(indexes);
    const width = this.canvasWidth();
    const height = this.canvasHeight();
    if (!bounds || width <= 0 || height <= 0) {
      return null;
    }
    return {
      minX: clamp(bounds.minX / width, 0, 1),
      minY: clamp(bounds.minY / height, 0, 1),
      maxX: clamp(bounds.maxX / width, 0, 1),
      maxY: clamp(bounds.maxY / height, 0, 1)
    };
  }
  getSelectedStrokeNormalizedBounds() {
    const bounds = this.getSelectedStrokeBounds();
    if (!bounds) {
      return null;
    }
    return {
      minX: clamp(bounds.minX / this.canvasWidth(), 0, 1),
      minY: clamp(bounds.minY / this.canvasHeight(), 0, 1),
      maxX: clamp(bounds.maxX / this.canvasWidth(), 0, 1),
      maxY: clamp(bounds.maxY / this.canvasHeight(), 0, 1)
    };
  }
  shouldSnapStrokeIndexes(indexes) {
    return indexes.some((index) => isSnapStroke(this.drawingData.strokes[index]));
  }
  prepareDragSnapBounds(excludeIndexes = []) {
    if (this.dragSnapOtherBounds) {
      return this.dragSnapOtherBounds;
    }
    const exclude = new Set(excludeIndexes);
    const width = this.canvasWidth();
    const height = this.canvasHeight();
    this.dragSnapOtherBounds = [];
    for (let index = 0; index < this.drawingData.strokes.length; index += 1) {
      if (exclude.has(index)) {
        continue;
      }
      const itemBounds = getStrokeBounds(this.drawingData.strokes[index], width, height);
      if (itemBounds) {
        this.dragSnapOtherBounds.push(itemBounds);
      }
    }
    this.dragSnapOtherXValues = this.dragSnapOtherBounds.flatMap((item) => [item.minX, (item.minX + item.maxX) / 2, item.maxX]);
    this.dragSnapOtherYValues = this.dragSnapOtherBounds.flatMap((item) => [item.minY, (item.minY + item.maxY) / 2, item.maxY]);
    return this.dragSnapOtherBounds;
  }
  computeSnapDeltaForNormalizedBounds(bounds, excludeIndexes = []) {
    if (!bounds) {
      return { dx: 0, dy: 0 };
    }
    const width = this.canvasWidth();
    const height = this.canvasHeight();
    const otherBounds = this.draggingStroke && this.dragSnapOtherBounds
      ? this.dragSnapOtherBounds
      : [];
    let xCandidates = this.draggingStroke && this.dragSnapOtherXValues;
    let yCandidates = this.draggingStroke && this.dragSnapOtherYValues;
    if (!otherBounds.length && !(this.draggingStroke && this.dragSnapOtherBounds)) {
      const exclude = new Set(excludeIndexes);
      const fallbackBounds = [];
      for (let index = 0; index < this.drawingData.strokes.length; index += 1) {
        if (exclude.has(index)) {
          continue;
        }
        const itemBounds = getStrokeBounds(this.drawingData.strokes[index], width, height);
        if (itemBounds) {
          fallbackBounds.push(itemBounds);
        }
      }
      xCandidates = fallbackBounds.flatMap((item) => [item.minX, (item.minX + item.maxX) / 2, item.maxX]);
      yCandidates = fallbackBounds.flatMap((item) => [item.minY, (item.minY + item.maxY) / 2, item.maxY]);
    }
    const xValues = [bounds.minX * width, (bounds.minX + bounds.maxX) * width / 2, bounds.maxX * width];
    const yValues = [bounds.minY * height, (bounds.minY + bounds.maxY) * height / 2, bounds.maxY * height];
    return {
      dx: nearestSnapDelta(xValues, xCandidates || [], SNAP_GRID_PX, SNAP_THRESHOLD_PX) / width,
      dy: nearestSnapDelta(yValues, yCandidates || [], SNAP_GRID_PX, SNAP_THRESHOLD_PX) / height
    };
  }
  snapPointForPreset(point, preset) {
    if (!isSnapPreset(preset)) {
      return point;
    }
    const width = this.canvasWidth();
    const height = this.canvasHeight();
    const x = point.x * width;
    const y = point.y * height;
    const bounds = { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
    const delta = this.computeSnapDeltaForNormalizedBounds(bounds, []);
    return {
      ...point,
      x: clamp((x + delta.dx * width) / width, 0, 1),
      y: clamp((y + delta.dy * height) / height, 0, 1)
    };
  }
  reorderSelectedStrokes(direction) {
    const selectedIndexes = this.getSelectedStrokeIndexes();
    if (!selectedIndexes.length) {
      return;
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    const strokes = this.drawingData.strokes;
    const selectedStrokes = selectedIndexes.map((index) => strokes[index]).filter(Boolean);
    const selectedSet = new Set(selectedStrokes);
    if (direction === "front" || direction === "forward") {
      selectedStrokes.forEach((stroke) => {
        stroke.belowMarkdown = false;
      });
    } else if (direction === "back") {
      selectedStrokes.forEach((stroke) => {
        stroke.belowMarkdown = true;
      });
    }
    if (direction === "front" || direction === "back") {
      const rest = strokes.filter((stroke) => !selectedSet.has(stroke));
      this.drawingData.strokes = direction === "front" ? [...rest, ...selectedStrokes] : [...selectedStrokes, ...rest];
    } else if (direction === "forward") {
      for (let index = strokes.length - 2; index >= 0; index -= 1) {
        if (selectedSet.has(strokes[index]) && !selectedSet.has(strokes[index + 1])) {
          [strokes[index], strokes[index + 1]] = [strokes[index + 1], strokes[index]];
        }
      }
    } else if (direction === "backward") {
      for (let index = 1; index < strokes.length; index += 1) {
        if (selectedSet.has(strokes[index]) && !selectedSet.has(strokes[index - 1])) {
          [strokes[index], strokes[index - 1]] = [strokes[index - 1], strokes[index]];
        }
      }
    }
    this.setSelectedStrokes(selectedStrokes.map((stroke) => this.drawingData.strokes.indexOf(stroke)).filter((index) => index >= 0));
    this.hideSelectionMenu();
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.scheduleNoteFlowLayout();
    this.render();
  }
  toggleSelectedStrokeLock() {
    const indexes = this.getSelectedStrokeIndexes();
    const blocks = this.getSelectedMarkdownBlocks();
    if (!indexes.length && !blocks.length) {
      return;
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    const shouldUnlock = indexes.every((index) => this.drawingData.strokes[index]?.locked) && blocks.every((block) => block.locked);
    const itemCount = indexes.length + blocks.length;
    const existingGroup = [
      ...indexes.map((index) => this.drawingData.strokes[index]?.groupId),
      ...blocks.map((block) => block.groupId)
    ].find(Boolean);
    const groupId = shouldUnlock || itemCount < 2 ? "" : existingGroup || `group-${Date.now().toString(36)}-${hashString(`${this.file?.path || ""}:${itemCount}`)}`;
    for (const index of indexes) {
      const stroke = this.drawingData.strokes[index];
      if (stroke) {
        stroke.locked = !shouldUnlock;
        stroke.groupId = groupId;
      }
    }
    for (const block of blocks) {
      block.locked = !shouldUnlock;
      block.groupId = groupId;
    }
    if (groupId) {
      const group = this.elementGroup(groupId);
      if (group) {
        group.locked = true;
      } else {
        this.elementGroupRecords().push({ id: groupId, boxed: false, locked: true, borderColor: "#64748b", backgroundColor: "" });
      }
    }
    this.pruneElementGroups();
    this.hideSelectionMenu();
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.render();
  }
  pruneElementGroups() {
    const liveIds = new Set([
      ...this.drawingData.strokes.map((stroke) => stroke?.groupId),
      ...this.markdownBlockRecords().map((block) => block.groupId)
    ].filter(Boolean));
    this.drawingData.elementGroups = this.elementGroupRecords().filter((group) => liveIds.has(group.id));
  }
  toggleSelectedElementBox() {
    const indexes = this.getSelectedStrokeIndexes();
    const blocks = this.getSelectedMarkdownBlocks();
    if (!indexes.length && !blocks.length) {
      return;
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    const boxedGroups = this.selectedWholeElementGroups().filter((group) => group.boxed);
    if (boxedGroups.length === 1) {
      boxedGroups[0].boxed = false;
    } else {
      const existingGroupId = [
        ...indexes.map((index) => this.drawingData.strokes[index]?.groupId),
        ...blocks.map((block) => block.groupId)
      ].filter(Boolean).find((id) => this.isElementGroupFullySelected(id));
      const groupId = existingGroupId || `group-${Date.now().toString(36)}-${hashString(`${this.file?.path || ""}:box:${indexes.length + blocks.length}`)}`;
      for (const index of indexes) {
        const stroke = this.drawingData.strokes[index];
        stroke.groupId = groupId;
        stroke.locked = true;
      }
      for (const block of blocks) {
        block.groupId = groupId;
        block.locked = true;
      }
      let group = this.elementGroup(groupId);
      if (!group) {
        group = { id: groupId, boxed: true, locked: true, borderColor: "#64748b", backgroundColor: "" };
        this.elementGroupRecords().push(group);
      }
      group.boxed = true;
      group.locked = true;
    }
    this.pruneElementGroups();
    this.redoStack = [];
    this.invalidateStaticCache();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.recordDrawingHistory(historyBefore);
    this.syncSelectionMenuButtons();
    this.render();
  }
  getSelectedStrokeMaxWidth() {
    return this.getSelectedStrokeIndexes().map((index) => this.drawingData.strokes[index]?.width || this.penWidth).reduce((max, width) => Math.max(max, width), this.penWidth);
  }
  selectionFramePaddingPx() {
    const markdownPadding = this.getSelectedMarkdownBlocks().length ? 8 : 0;
    return Math.max(3, markdownPadding, this.getSelectedStrokeMaxWidth() / 2 + 2);
  }
  getSelectedFrameCanvasRect() {
    if (!this.hasHybridSelection()) {
      return null;
    }
    if (this.resizingSelection && this.resizeSelectionPreviewBounds) {
      const bounds = this.resizeSelectionPreviewBounds;
      const width = Math.max(1, Number(this.resizeSelectionPointerGeometry?.canvasWidth) || this.canvasWidth());
      const height = Math.max(1, Number(this.resizeSelectionPointerGeometry?.canvasHeight) || this.canvasHeight());
      const padding = this.selectionFramePaddingPx();
      return {
        x: bounds.minX * width - padding,
        y: bounds.minY * height - padding,
        width: (bounds.maxX - bounds.minX) * width + padding * 2,
        height: (bounds.maxY - bounds.minY) * height + padding * 2
      };
    }
    if (this.draggingStroke || this.resizingSelection) {
      const bounds = this.getSelectedStrokeBounds();
      if (!bounds) {
        return null;
      }
      const padding = this.selectionFramePaddingPx();
      return {
        x: bounds.minX - padding,
        y: bounds.minY - padding,
        width: bounds.maxX - bounds.minX + padding * 2,
        height: bounds.maxY - bounds.minY + padding * 2
      };
    }
    return this.captureSelectionFrameSnapshot() || null;
  }
  findSelectionHandleAt(point) {
    const hasUnlocked = this.getSelectedStrokeIndexes().some((index) => !this.drawingData.strokes[index]?.locked || this.drawingData.strokes[index]?.groupId)
      || this.getSelectedMarkdownBlocks().some((block) => !block.locked || block.groupId);
    if (!hasUnlocked) {
      return null;
    }
    const frame = this.getSelectedFrameCanvasRect();
    if (!frame) {
      return null;
    }
    const hitPoint = this.pointToCanvas(point);
    const rects = [frame];
    const canvasRect = this.canvas?.getBoundingClientRect?.();
    const scaleX = canvasRect?.width > 0 ? canvasRect.width / Math.max(1, this.canvasWidth()) : 1;
    const scaleY = canvasRect?.height > 0 ? canvasRect.height / Math.max(1, this.canvasRenderHeight) : 1;
    const screenHitRadius = Math.max(SELECT_RESIZE_HANDLE_HIT_RADIUS, this.selectionHitPaddingPx() + 6, 28);
    const hitRadiusX = screenHitRadius / Math.max(0.01, Math.abs(scaleX));
    const hitRadiusY = screenHitRadius / Math.max(0.01, Math.abs(scaleY));
    let best = null;
    for (const [rectIndex, rect] of rects.entries()) {
      if (rect.width <= hitRadiusX * 2
        && hitPoint.x >= rect.x - hitRadiusX
        && hitPoint.x <= rect.x + rect.width + hitRadiusX) {
        const topDistance = Math.abs(hitPoint.y - rect.y);
        const bottomDistance = Math.abs(hitPoint.y - (rect.y + rect.height));
        if (Math.min(topDistance, bottomDistance) <= hitRadiusY) {
          const top = topDistance <= bottomDistance;
          const right = hitPoint.x >= rect.x + rect.width / 2;
          const handle = top ? right ? "ne" : "nw" : right ? "se" : "sw";
          const handleX = right ? rect.x + rect.width : rect.x;
          const handleY = top ? rect.y : rect.y + rect.height;
          const distance = ((hitPoint.x - handleX) / hitRadiusX) ** 2
            + ((hitPoint.y - handleY) / hitRadiusY) ** 2;
          if (!best || distance < best.distance || distance === best.distance && rectIndex < best.rectIndex) {
            best = { handle, distance, rectIndex };
          }
          continue;
        }
      }
      for (const handle of getSelectionHandlePointsFromRect(rect)) {
        const dx = hitPoint.x - handle.x;
        const dy = hitPoint.y - handle.y;
        if (Math.abs(dx) > hitRadiusX || Math.abs(dy) > hitRadiusY) {
          continue;
        }
        const distance = (dx / hitRadiusX) ** 2 + (dy / hitRadiusY) ** 2;
        if (!best || distance < best.distance || distance === best.distance && rectIndex < best.rectIndex) {
          best = { handle: handle.handle, distance, rectIndex };
        }
      }
    }
    return best?.handle || null;
  }
  selectedStrokeFrameContains(point) {
    const rect = this.getSelectedFrameCanvasRect();
    if (!rect) {
      return false;
    }
    const hitPoint = this.pointToCanvas(point);
    const hitPadding = this.selectionHitPaddingPx();
    return hitPoint.x >= rect.x - hitPadding && hitPoint.x <= rect.x + rect.width + hitPadding &&
      hitPoint.y >= rect.y - hitPadding && hitPoint.y <= rect.y + rect.height + hitPadding;
  }
  applyTextEditingFlowClip(element) {
    const insets = this.noteFlowAppliedVerticalInsets(element);
    const top = Math.max(0, Number(insets.top) || 0);
    const bottom = Math.max(0, Number(insets.bottom) || 0);
    if (top <= 0 && bottom <= 0) {
      this.clearTextEditingFlowClip(element);
      return;
    }
    element.addClass("notedraw-editing-flow-clipped");
    setNoteDrawCssProps(element, {
      "--notedraw-editing-flow-top": `${top}px`,
      "--notedraw-editing-flow-bottom": `${bottom}px`
    });
  }
  clearTextEditingFlowClip(element) {
    element?.removeClass?.("notedraw-editing-flow-clipped");
    element?.style?.removeProperty("--notedraw-editing-flow-top");
    element?.style?.removeProperty("--notedraw-editing-flow-bottom");
  }
  startTextEdit(element, clientPoint = null) {
    if (!element?.isConnected || this.surfaceType !== "webview" && !this.previewEl?.contains?.(element)) {
      const block = this.findMarkdownBlockRecordForElement(element);
      const replacement = block ? this.markdownBlockElement(block) : null;
      if (!replacement?.isConnected || !this.previewEl?.contains?.(replacement)) {
        return false;
      }
      element = replacement;
    }
    if (this.currentEditor === element) {
      this.applyTextEditingFlowClip(element);
      element.focus();
      placeCaretInEditable(element, clientPoint);
      this.currentTextRange = window.getSelection?.()?.rangeCount ? window.getSelection().getRangeAt(0).cloneRange() : null;
      this.positionFormatToolbar();
      return true;
    }
    this.endTextEdit();
    this.currentEditor = element;
    this.currentEditorFile = this.plugin.resolveEditableFile(element, this.file);
    this.currentEditorEmbedded = this.embeddedSurface || isEmbeddedEditableElement(element) || normalizeVaultPath(this.currentEditorFile?.path) !== normalizeVaultPath(this.file?.path);
    this.formatToolbarManualPosition = null;
    element.dataset.noteDrawOriginal = element.innerText;
    const saveToVault = this.surfaceType !== "webview";
    if (saveToVault) {
      this.plugin.prepareTextEditState(this.currentEditorFile, element.innerText, element, this);
    }
    element.contentEditable = "true";
    element.spellcheck = true;
    element.addClass("notedraw-editing");
    this.applyTextEditingFlowClip(element);
    this.previewEl.addClass("is-native-text-editing");
    this.formatToolbar?.addClass("is-visible");
    element.focus();
    placeCaretInEditable(element, clientPoint);
    this.currentTextRange = window.getSelection?.()?.rangeCount ? window.getSelection().getRangeAt(0).cloneRange() : null;
    this.positionFormatToolbar();
    const onInput = () => {
      if (!saveToVault) {
        return;
      }
      const original = element.dataset.noteDrawOriginal || "";
      const edited = serializeControllerEditableSource(element, this.currentEditorEmbedded);
      if (this.currentEditorEmbedded) {
        this.plugin.stageTextSave(this.currentEditorFile, original, edited, element, this);
      } else {
        this.plugin.scheduleTextSave(this.currentEditorFile, original, edited, element, this);
      }
      this.positionFormatToolbar();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        this.endTextEdit();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        this.endTextEdit();
      }
      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        if (key === "b") {
          event.preventDefault();
          this.applyTextInlineFormat("strong");
        } else if (key === "i") {
          event.preventDefault();
          this.applyTextInlineFormat("em");
        } else if (key === "u") {
          event.preventDefault();
          this.applyTextInlineFormat("u");
        }
      }
    };
    const onBlur = () => {
      window.setTimeout(() => {
        const active = activeDocument.activeElement;
        if (this.currentEditor !== element || element.dataset.noteDrawSortDragging === "true" || element.contains(active) || this.formatToolbar?.contains(active)) {
          return;
        }
        this.endTextEdit();
      }, 0);
    };
    element._noteDrawCleanup = () => {
      element.removeEventListener("input", onInput);
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("blur", onBlur);
    };
    element.addEventListener("input", onInput);
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("blur", onBlur);
    return true;
  }
  focusSourceEditorAt(clientPoint) {
    if (!clientPoint || !Number.isFinite(clientPoint.x) || !Number.isFinite(clientPoint.y)) {
      return false;
    }
    const cmView = getCodeMirrorView(this.view, this.previewEl);
    if (cmView && typeof cmView.posAtCoords === "function") {
      const pos = cmView.posAtCoords({ x: clientPoint.x, y: clientPoint.y }, false) ?? cmView.posAtCoords({ x: clientPoint.x, y: clientPoint.y });
      if (Number.isFinite(pos)) {
        cmView.focus?.();
        cmView.dispatch?.({
          selection: { anchor: pos },
          scrollIntoView: false
        });
        return true;
      }
    }
    const editor = this.view?.editor;
    if (editor && typeof editor.focus === "function") {
      editor.focus();
    }
    return dispatchMouseClickThroughOverlay(this.canvas, clientPoint);
  }
  endTextEdit(options = {}) {
    const element = this.currentEditor;
    if (!element) {
      return Promise.resolve(true);
    }
    const original = element.dataset.noteDrawOriginal || "";
    const edited = this.surfaceType === "webview" ? element.innerText : serializeControllerEditableSource(element, this.currentEditorEmbedded, true);
    let commit = Promise.resolve(true);
    if (options.save === false) {
      // The caller already flushed the final value before a structural edit.
    } else if (this.surfaceType === "webview") {
      commit = Promise.resolve(this.commitWebviewTextEdit(element, original, edited));
    } else if (normalizeEditableSourceText(original) !== normalizeEditableSourceText(edited)) {
      commit = this.queueTextSaveAndWait(this.currentEditorFile || this.file, original, edited, element);
    }
    const markdownBlock = this.findMarkdownBlockRecordForElement(element);
    let markdownMetadataChanged = false;
    if (markdownBlock) {
      const nextHint = normalizeRenderedText(element.innerText || element.textContent || "").slice(0, 240);
      const info = getSourceInfo(element);
      markdownMetadataChanged = markdownBlock.textHint !== nextHint
        || markdownBlock.lineStart !== (Number.isFinite(info.lineStart) ? info.lineStart : markdownBlock.lineStart)
        || markdownBlock.lineEnd !== (Number.isFinite(info.lineEnd) ? info.lineEnd : markdownBlock.lineEnd);
      markdownBlock.textHint = nextHint;
      if (Number.isFinite(info.lineStart)) {
        markdownBlock.lineStart = info.lineStart;
        markdownBlock.lineEnd = info.lineEnd ?? info.lineStart;
      }
    }
    element._noteDrawCleanup?.();
    delete element._noteDrawCleanup;
    delete element.dataset.noteDrawOriginal;
    element.querySelector(":scope > .notedraw-text-sort-handle")?.remove();
    element.contentEditable = "false";
    this.clearTextEditingFlowClip(element);
    element.removeClass("notedraw-editing");
    this.previewEl.removeClass("is-native-text-editing");
    this.formatToolbar?.removeClass("is-visible");
    this.stopFormatToolbarDrag();
    this.currentTextRange = null;
    this.formatToolbarManualPosition = null;
    this.currentEditor = null;
    this.currentEditorFile = null;
    this.currentEditorEmbedded = false;
    if (markdownMetadataChanged && this.surfaceType === "preview") {
      this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    }
    return commit;
  }
  commitWebviewTextEdit(element, originalText, editedText) {
    const normalizedOriginal = normalizeRenderedText(originalText);
    const normalizedEdited = normalizeRenderedText(editedText);
    if (!normalizedOriginal || normalizedOriginal === normalizedEdited) {
      return;
    }
    const edit = {
      kind: "text",
      path: domPathForElement(element, this.previewEl),
      originalText: String(originalText || ""),
      editedText: String(editedText || ""),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (!edit.path) {
      return;
    }
    const historyBefore = this.captureDrawingHistorySnapshot();
    const edits = Array.isArray(this.drawingData.webEdits) ? this.drawingData.webEdits : [];
    const existingIndex = edits.findIndex((item) => item?.kind === "text" && item.path === edit.path && normalizeRenderedText(item.originalText) === normalizedOriginal);
    if (existingIndex >= 0) {
      edits[existingIndex] = edit;
    } else {
      edits.push(edit);
    }
    this.drawingData.webEdits = edits;
    this.redoStack = [];
    this.recordDrawingHistory(historyBefore);
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true });
    this.render();
    return true;
  }
  applyWebEdits() {
    if (this.surfaceType !== "webview" || this.currentEditor || !Array.isArray(this.drawingData?.webEdits)) {
      return;
    }
    const used = /* @__PURE__ */ new Set();
    for (const edit of this.drawingData.webEdits) {
      if (edit?.kind !== "text" || !edit.path || typeof edit.editedText !== "string") {
        continue;
      }
      const original = normalizeRenderedText(edit.originalText);
      const edited = normalizeRenderedText(edit.editedText);
      if (!original || !edited) {
        continue;
      }
      const element = findWebEditElement(this.previewEl, edit, used);
      if (!element) {
        continue;
      }
      const current = normalizeRenderedText(element.innerText);
      if (current !== original && current !== edited) {
        continue;
      }
      if (current !== edited) {
        element.innerText = edit.editedText;
      }
      used.add(element);
    }
  }
  recordMarkdownHistory(file, before, after, coalesceKey = null) {
    if (String(before ?? "") === String(after ?? "")) {
      return;
    }
    this.plugin.recordControllerHistory(this, { kind: "markdown", file, before, after }, { coalesceKey });
  }
  recordCompoundHistory(markdownFile, markdownBefore, markdownAfter, drawingBefore) {
    const drawingAfter = this.captureDrawingHistorySnapshot();
    if (String(markdownBefore ?? "") === String(markdownAfter ?? "") && JSON.stringify(drawingBefore) === JSON.stringify(drawingAfter)) {
      return;
    }
    this.plugin.recordControllerHistory(this, {
      kind: "compound",
      drawingFile: this.file,
      drawingBefore,
      drawingAfter,
      markdownFile,
      markdownBefore,
      markdownAfter
    });
  }
  captureDrawingHistorySnapshot() {
    return cloneDrawingData(this.drawingData, this.file);
  }
  recordDrawingHistory(before, options = {}) {
    const after = this.captureDrawingHistorySnapshot();
    if (options.knownChanged !== true && JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }
    this.plugin.recordControllerHistory(this, { kind: "drawing", file: this.file, before, after });
  }
  async commitActiveTextEditForHistory() {
    if (this.currentEditor) {
      await this.endTextEdit();
    }
    await this.textCommitBarrier.wait();
  }
  async undoLastStroke() {
    await this.commitActiveTextEditForHistory();
    await this.plugin.undoControllerHistory(this);
    this.clearSelectedStrokes();
    this.render();
  }
  async redoLastStroke() {
    await this.commitActiveTextEditForHistory();
    await this.plugin.redoControllerHistory(this);
    this.clearSelectedStrokes();
    this.render();
  }
  deleteSelectedStroke() {
    const indexes = this.getSelectedStrokeIndexes().filter((index) => !this.drawingData.strokes[index]?.locked || Boolean(this.drawingData.strokes[index]?.groupId));
    if (!indexes.length) {
      return;
    }
    const removedNoteFlow = indexes.some((index) => this.drawingData.strokes[index]?.noteFlow?.enabled);
    const historyBefore = this.captureDrawingHistorySnapshot();
    const deletedIds = new Set(indexes.map((index) => strokeElementId(this.drawingData.strokes[index])).filter(Boolean));
    for (const index of indexes.slice().sort((a, b) => b - a)) {
      this.drawingData.strokes.splice(index, 1);
    }
    this.drawingData.strokes = this.drawingData.strokes.filter((stroke) => {
      const connector = normalizeConnector(stroke.connector);
      return !connector || !deletedIds.has(connector.fromId) && !deletedIds.has(connector.toId);
    });
    this.clearSelectedStrokes();
    this.redoStack = [];
    this.rebuildElementRelations();
    this.plugin.scheduleDrawingSave(this.file, this.drawingData, { userOperation: true, replace: true });
    this.recordDrawingHistory(historyBefore);
    this.scheduleNoteFlowLayout({ operation: removedNoteFlow });
    this.render();
  }
};
export default NoteDrawPlugin;
var NoteDrawSettingTab = class extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  [["dis", "play"].join("")]() {
    const { containerEl } = this;
    containerEl.empty();
    for (const definition of this.getSettingDefinitions()) {
      const setting = new Setting(containerEl);
      definition.render(setting);
    }
  }
  refreshSettingsView() {
    const render = this[["dis", "play"].join("")];
    if (typeof render === "function") {
      render.call(this);
    }
  }
  getSettingDefinitions() {
    const settings = sanitizeSettings(this.plugin.noteDrawSettings);
    return [
      this.createSectionDefinition("settingsSectionInterface"),
      this.createSettingDefinition("settingsLanguage", "settingsLanguageDesc", (setting) => {
        setting.addDropdown((component) => {
          for (const option of LANGUAGE_OPTIONS) {
            component.addOption(option.value, option.value === LANGUAGE_AUTO ? `${this.plugin.t("languageAuto")} (${languageNativeName(detectNoteDrawLanguage(this.plugin.app))})` : option.label);
          }
          component.setValue(settings.language).onChange(async (value) => {
            this.plugin.noteDrawSettings.language = value;
            await this.plugin.saveSettings();
            this.refreshSettingsView();
          });
        });
      }),
      this.createSectionDefinition("settingsSectionStorage"),
      this.createSettingDefinition("drawingStorageMode", "drawingStorageModeDesc", (setting) => {
        setting.addDropdown((component) => {
          component
            .addOption(DRAWING_STORAGE_CONFIG, this.plugin.t("drawingStorageConfig"))
            .addOption(DRAWING_STORAGE_NOTE_SUBFOLDER, this.plugin.t("drawingStorageNoteSubfolder"))
            .addOption(DRAWING_STORAGE_NOTE_FOLDER, this.plugin.t("drawingStorageNoteFolder"))
            .addOption(DRAWING_STORAGE_EMBEDDED, this.plugin.t("drawingStorageEmbedded"))
            .setValue(settings.drawingStorageMode)
            .onChange(async (value) => {
              await this.plugin.changeDrawingStorageMode(value);
              this.refreshSettingsView();
            });
        });
      }),
      this.createSectionDefinition("settingsSectionPen"),
      this.createSettingDefinition("defaultPenColor", "defaultPenColorDesc", (setting) => {
        setting.addColorPicker((component) => component.setValue(settings.defaultPenColor).onChange(async (value) => {
          this.plugin.noteDrawSettings.defaultPenColor = value;
          await this.plugin.saveSettings();
        }));
      }),
      this.createSettingDefinition("defaultPenWidth", "defaultPenWidthDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.defaultPenWidth,
          min: MIN_BRUSH_WIDTH,
          max: MAX_BRUSH_WIDTH,
          step: 0.5,
          format: (value) => `${formatSettingNumber(value)} px`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.defaultPenWidth = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSettingDefinition("defaultPenOpacity", "defaultPenOpacityDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.defaultPenOpacity,
          min: 0,
          max: 1,
          step: 0.02,
          format: (value) => `${Math.round(value * 100)}%`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.defaultPenOpacity = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSectionDefinition("settingsSectionWatercolor"),
      this.createSettingDefinition("defaultWatercolorColor", "defaultWatercolorColorDesc", (setting) => {
        setting.addColorPicker((component) => component.setValue(settings.defaultWatercolorColor).onChange(async (value) => {
          this.plugin.noteDrawSettings.defaultWatercolorColor = value;
          await this.plugin.saveSettings();
        }));
      }),
      this.createSettingDefinition("defaultWatercolorWidth", "defaultWatercolorWidthDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.defaultWatercolorWidth,
          min: MIN_BRUSH_WIDTH,
          max: MAX_BRUSH_WIDTH,
          step: 0.5,
          format: (value) => `${formatSettingNumber(value)} px`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.defaultWatercolorWidth = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSettingDefinition("defaultWatercolorOpacity", "defaultWatercolorOpacityDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.defaultWatercolorOpacity,
          min: 0,
          max: 1,
          step: 0.02,
          format: (value) => `${Math.round(value * 100)}%`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.defaultWatercolorOpacity = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSettingDefinition("resetBrushDefaults", "resetBrushDefaultsDesc", (setting) => {
        setting.addButton((component) => component.setButtonText(this.plugin.t("reset")).onClick(async () => {
          Object.assign(this.plugin.noteDrawSettings, {
            defaultPenColor: DEFAULT_SETTINGS.defaultPenColor,
            defaultPenWidth: DEFAULT_SETTINGS.defaultPenWidth,
            defaultPenOpacity: DEFAULT_SETTINGS.defaultPenOpacity,
            defaultWatercolorColor: DEFAULT_SETTINGS.defaultWatercolorColor,
            defaultWatercolorWidth: DEFAULT_SETTINGS.defaultWatercolorWidth,
            defaultWatercolorOpacity: DEFAULT_SETTINGS.defaultWatercolorOpacity
          });
          await this.plugin.saveSettings();
          this.refreshSettingsView();
        }));
      }),
      this.createSectionDefinition("settingsSectionInteraction"),
      this.createSettingDefinition("longPressMs", "longPressMsDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.longPressMs,
          min: MIN_LONG_PRESS_MS,
          max: MAX_LONG_PRESS_MS,
          step: 25,
          format: (value) => `${Math.round(value)} ms`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.longPressMs = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSettingDefinition("selectTapDistance", "selectTapDistanceDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.selectTapDistance,
          min: MIN_SELECT_TAP_DISTANCE,
          max: MAX_SELECT_TAP_DISTANCE,
          step: 1,
          format: (value) => `${Math.round(value)} px`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.selectTapDistance = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSettingDefinition("selectStrokePadding", "selectStrokePaddingDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.selectStrokePadding,
          min: MIN_SELECT_STROKE_PADDING,
          max: MAX_SELECT_STROKE_PADDING,
          step: 1,
          format: (value) => `${Math.round(value)} px`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.selectStrokePadding = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSettingDefinition("selectedStrokeAlpha", "selectedStrokeAlphaDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.selectedStrokeAlpha,
          min: MIN_SELECTED_STROKE_ALPHA,
          max: MAX_SELECTED_STROKE_ALPHA,
          step: 0.02,
          format: (value) => `${Math.round(value * 100)}%`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.selectedStrokeAlpha = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSectionDefinition("settingsSectionPerformance"),
      this.createSettingDefinition("drawingInterpolationStep", "drawingInterpolationStepDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.drawingInterpolationStep,
          min: MIN_DRAWING_INTERPOLATION_STEP_PX,
          max: MAX_DRAWING_INTERPOLATION_STEP_PX,
          step: 0.25,
          format: (value) => `${formatSettingNumber(value)} px`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.drawingInterpolationStep = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSettingDefinition("drawingMinPointDistance", "drawingMinPointDistanceDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.drawingMinPointDistance,
          min: MIN_DRAWING_MIN_POINT_DISTANCE_PX,
          max: MAX_DRAWING_MIN_POINT_DISTANCE_PX,
          step: 0.05,
          format: (value) => `${formatSettingNumber(value)} px`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.drawingMinPointDistance = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSettingDefinition("drawingCompactDistance", "drawingCompactDistanceDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.drawingCompactDistance,
          min: MIN_DRAWING_COMPACT_DISTANCE_PX,
          max: MAX_DRAWING_COMPACT_DISTANCE_PX,
          step: 0.1,
          format: (value) => `${formatSettingNumber(value)} px`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.drawingCompactDistance = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSettingDefinition("autoSaveDelayMs", "autoSaveDelayMsDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.autoSaveDelayMs,
          min: MIN_AUTO_SAVE_DELAY_MS,
          max: MAX_AUTO_SAVE_DELAY_MS,
          step: 20,
          format: (value) => `${Math.round(value)} ms`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.autoSaveDelayMs = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSectionDefinition("settingsSectionLayout"),
      this.createSettingDefinition("toolbarTopOffset", "toolbarTopOffsetDesc", (setting) => {
        this.addSliderWithValue(setting, {
          value: settings.toolbarTopOffset,
          min: 0,
          max: 48,
          step: 1,
          format: (value) => `${Math.round(value)} px`,
          onChange: async (value) => {
            this.plugin.noteDrawSettings.toolbarTopOffset = value;
            await this.plugin.saveSettings();
          }
        });
      }),
      this.createSettingDefinition("resetLayoutDefaults", "resetLayoutDefaultsDesc", (setting) => {
        setting.addButton((component) => component.setButtonText(this.plugin.t("reset")).onClick(async () => {
          Object.assign(this.plugin.noteDrawSettings, {
            toolbarTopOffset: DEFAULT_SETTINGS.toolbarTopOffset,
            longPressMs: DEFAULT_SETTINGS.longPressMs,
            selectTapDistance: DEFAULT_SETTINGS.selectTapDistance,
            selectStrokePadding: DEFAULT_SETTINGS.selectStrokePadding,
            selectedStrokeAlpha: DEFAULT_SETTINGS.selectedStrokeAlpha,
            drawingInterpolationStep: DEFAULT_SETTINGS.drawingInterpolationStep,
            drawingMinPointDistance: DEFAULT_SETTINGS.drawingMinPointDistance,
            drawingCompactDistance: DEFAULT_SETTINGS.drawingCompactDistance,
            autoSaveDelayMs: DEFAULT_SETTINGS.autoSaveDelayMs
          });
          await this.plugin.saveSettings();
          this.refreshSettingsView();
        }));
      }),
      this.createSectionDefinition("settingsSectionDiagnostics"),
      this.createSettingDefinition("debugLog", "debugLogDesc", (setting) => {
        setting.addToggle((component) => component.setValue(settings.enableDebugLog).onChange(async (value) => {
          this.plugin.noteDrawSettings.enableDebugLog = value;
          await this.plugin.saveSettings();
        }));
      }),
      this.createSectionDefinition("settingsSectionSupport"),
      this.createCodesDefinition()
    ];
  }
  addSliderWithValue(setting, options) {
    let valueEl = null;
    setting.addSlider((component) => {
      component.setLimits(options.min, options.max, options.step).setValue(options.value).onChange(async (value) => {
        if (valueEl) {
          valueEl.setText(options.format(value));
        }
        await options.onChange(value);
      });
    });
    valueEl = setting.controlEl.createSpan({
      cls: "notedraw-setting-value",
      text: options.format(options.value)
    });
  }
  createSectionDefinition(key) {
    return {
      name: this.plugin.t(key),
      searchable: false,
      render: (setting) => {
        setting.setName(this.plugin.t(key)).setHeading();
        setting.settingEl.addClass("notedraw-settings-section-title");
      }
    };
  }
  createSettingDefinition(nameKey, descKey, renderControl) {
    return {
      name: this.plugin.t(nameKey),
      desc: this.plugin.t(descKey),
      render: (setting) => {
        setting.setName(this.plugin.t(nameKey)).setDesc(this.plugin.t(descKey));
        renderControl(setting);
      }
    };
  }
  createCodesDefinition() {
    return {
      name: this.plugin.t("supportTitle"),
      desc: this.plugin.t("supportSubtitle"),
      render: (setting) => {
        setting.settingEl.empty();
        const codesContainer = setting.settingEl.createDiv({ cls: "notedraw-settings-codes" });
        void this.renderExtraCodes(codesContainer);
      }
    };
  }
  async renderExtraCodes(containerEl) {
    const codeItems = (await Promise.all(
      SETTINGS_EXTRA_CODE_ASSETS.map(async (asset) => {
        const src = await this.plugin.getOptionalAssetResourcePath(asset.path) || asset.dataUrl;
        return src ? { ...asset, src } : null;
      })
    )).filter(Boolean);
    if (!codeItems.length) {
      containerEl.remove();
      return;
    }
    containerEl.createDiv({
      cls: "notedraw-settings-codes-title",
      text: this.plugin.t("supportTitle")
    });
    containerEl.createDiv({
      cls: "notedraw-settings-codes-subtitle",
      text: this.plugin.t("supportSubtitle")
    });
    const gridEl = containerEl.createDiv({ cls: "notedraw-settings-codes-grid" });
    for (const item of codeItems) {
      const label = this.plugin.t(item.labelKey);
      const codeEl = gridEl.createDiv({ cls: "notedraw-settings-code" });
      const imageEl = codeEl.createEl("img", {
        cls: "notedraw-settings-code-image",
        attr: {
          alt: label,
          loading: "lazy",
          src: item.src
        }
      });
      imageEl.src = item.src;
      codeEl.createDiv({
        cls: "notedraw-settings-code-label",
        text: label
      });
    }
  }
};
function isConcreteMarkdownBlockElement(element) {
  if (!element?.matches?.(MARKDOWN_TEXT_SELECTOR)) {
    return false;
  }
  if (element.matches(".callout-content")) {
    return false;
  }
  if (element.querySelector?.(".internal-embed, .markdown-embed, .markdown-embed-content")) {
    return false;
  }
  return !element.querySelector?.(MARKDOWN_TEXT_SELECTOR);
}
function findEditableTarget(target, previewEl, clientPoint = null) {
  if (!target || !previewEl.contains(target)) {
    return null;
  }
  const controller = previewEl?._noteDrawController;
  if (controller?.surfaceType === "webview") {
    return findWebviewEditableTarget(target, previewEl);
  }
  if (target.closest(BLOCKED_EDIT_SELECTOR)) {
    return null;
  }
  const editable = target.closest(EDITABLE_SELECTOR);
  if (!editable || !previewEl.contains(editable)) {
    return null;
  }
  if (!isConcreteMarkdownBlockElement(editable)) {
    return null;
  }
  if (!normalizeRenderedText(editable.innerText)) {
    return null;
  }
  if (clientPoint && controller?.markdownElementContainsClientPoint
    && !controller.markdownElementContainsClientPoint(editable, clientPoint)) {
    return null;
  }
  return editable;
}
function findWebviewEditableTarget(target, previewEl) {
  if (!target || !previewEl.contains(target) || target.closest(WEBVIEW_BLOCKED_EDIT_SELECTOR)) {
    return null;
  }
  let current = target.closest(WEBVIEW_EDITABLE_SELECTOR);
  while (current && current !== previewEl) {
    if (!current.closest(WEBVIEW_BLOCKED_EDIT_SELECTOR) && normalizeRenderedText(current.innerText)) {
      return current;
    }
    current = current.parentElement?.closest?.(WEBVIEW_EDITABLE_SELECTOR);
  }
  return null;
}
function sanitizeSettings(settings) {
  const input = settings || {};
  return {
    language: normalizeLanguageCode(input.language ?? DEFAULT_SETTINGS.language),
    drawingStorageMode: normalizeDrawingStorageMode(input.drawingStorageMode ?? DEFAULT_SETTINGS.drawingStorageMode),
    defaultPenColor: isCssColor(input.defaultPenColor) ? input.defaultPenColor : DEFAULT_SETTINGS.defaultPenColor,
    defaultPenWidth: clamp(Number(input.defaultPenWidth ?? DEFAULT_SETTINGS.defaultPenWidth), MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH),
    defaultPenOpacity: clamp(Number(input.defaultPenOpacity ?? DEFAULT_SETTINGS.defaultPenOpacity), 0, 1),
    defaultWatercolorColor: isCssColor(input.defaultWatercolorColor) ? input.defaultWatercolorColor : DEFAULT_SETTINGS.defaultWatercolorColor,
    defaultWatercolorWidth: clamp(Number(input.defaultWatercolorWidth ?? DEFAULT_SETTINGS.defaultWatercolorWidth), MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH),
    defaultWatercolorOpacity: clamp(Number(input.defaultWatercolorOpacity ?? DEFAULT_SETTINGS.defaultWatercolorOpacity), 0, 1),
    lastToolMode: normalizeToolMode(input.lastToolMode),
    lastBrushMode: input.lastBrushMode === BRUSH_WATERCOLOR ? BRUSH_WATERCOLOR : BRUSH_PEN,
    lastPenVariant: normalizeBrushVariant(BRUSH_PEN, input.lastPenVariant),
    lastWatercolorVariant: normalizeBrushVariant(BRUSH_WATERCOLOR, input.lastWatercolorVariant),
    lastTextPreset: normalizeTextPreset(input.lastTextPreset),
    lastReadingZoom: clamp(Number(input.lastReadingZoom ?? DEFAULT_SETTINGS.lastReadingZoom), MIN_READING_ZOOM, MAX_READING_ZOOM),
    mindMapAffectsSource: input.mindMapAffectsSource !== false,
    toolbarTopOffset: clamp(Number(input.toolbarTopOffset ?? DEFAULT_SETTINGS.toolbarTopOffset), 0, 48),
    longPressMs: clamp(Number(input.longPressMs ?? DEFAULT_SETTINGS.longPressMs), MIN_LONG_PRESS_MS, MAX_LONG_PRESS_MS),
    selectTapDistance: clamp(Number(input.selectTapDistance ?? DEFAULT_SETTINGS.selectTapDistance), MIN_SELECT_TAP_DISTANCE, MAX_SELECT_TAP_DISTANCE),
    selectStrokePadding: clamp(Number(input.selectStrokePadding ?? DEFAULT_SETTINGS.selectStrokePadding), MIN_SELECT_STROKE_PADDING, MAX_SELECT_STROKE_PADDING),
    selectedStrokeAlpha: clamp(Number(input.selectedStrokeAlpha ?? DEFAULT_SETTINGS.selectedStrokeAlpha), MIN_SELECTED_STROKE_ALPHA, MAX_SELECTED_STROKE_ALPHA),
    drawingInterpolationStep: clamp(Number(input.drawingInterpolationStep ?? DEFAULT_SETTINGS.drawingInterpolationStep), MIN_DRAWING_INTERPOLATION_STEP_PX, MAX_DRAWING_INTERPOLATION_STEP_PX),
    drawingMinPointDistance: clamp(Number(input.drawingMinPointDistance ?? DEFAULT_SETTINGS.drawingMinPointDistance), MIN_DRAWING_MIN_POINT_DISTANCE_PX, MAX_DRAWING_MIN_POINT_DISTANCE_PX),
    drawingCompactDistance: clamp(Number(input.drawingCompactDistance ?? DEFAULT_SETTINGS.drawingCompactDistance), MIN_DRAWING_COMPACT_DISTANCE_PX, MAX_DRAWING_COMPACT_DISTANCE_PX),
    autoSaveDelayMs: clamp(Number(input.autoSaveDelayMs ?? DEFAULT_SETTINGS.autoSaveDelayMs), MIN_AUTO_SAVE_DELAY_MS, MAX_AUTO_SAVE_DELAY_MS),
    enableDebugLog: Boolean(input.enableDebugLog)
  };
}
function translateNoteDraw(plugin, key, vars = {}) {
  const language = resolveNoteDrawLanguage(plugin);
  const template = I18N[language]?.[key] ?? I18N.en[key] ?? key;
  return String(template).replace(/\{(\w+)\}/g, (_, name) => vars?.[name] ?? "");
}
function formatSettingNumber(value) {
  return String(Math.round(Number(value || 0) * 100) / 100);
}
function resolveNoteDrawLanguage(plugin) {
  const language = normalizeLanguageCode(plugin?.noteDrawSettings?.language ?? DEFAULT_SETTINGS.language);
  if (language !== LANGUAGE_AUTO) {
    return language;
  }
  return detectNoteDrawLanguage(plugin?.app);
}
function detectNoteDrawLanguage(app) {
  const navigatorLanguage = typeof navigator !== "undefined" ? navigator.language : "";
  const navigatorLanguages = typeof navigator !== "undefined" ? Array.from(navigator.languages ?? []) : [];
  const candidates = [
    app?.vault?.getConfig?.("language"),
    app?.vault?.getConfig?.("locale"),
    activeDocument.documentElement.lang,
    navigatorLanguage,
    ...navigatorLanguages,
    app?.appId
  ];
  for (const candidate of candidates) {
    const language = normalizeLanguageCode(candidate, false);
    if (language && language !== LANGUAGE_AUTO) {
      return language;
    }
  }
  return "en";
}
function normalizeLanguageCode(value, allowAuto = true) {
  const text = String(value || "").trim();
  if (!text) {
    return allowAuto ? LANGUAGE_AUTO : "";
  }
  const lower = text.replace("_", "-").toLowerCase();
  if (allowAuto && lower === LANGUAGE_AUTO) {
    return LANGUAGE_AUTO;
  }
  if (lower.startsWith("zh-tw") || lower.startsWith("zh-hk") || lower.includes("hant")) {
    return "zh-TW";
  }
  if (lower.startsWith("zh")) {
    return "zh";
  }
  if (lower.startsWith("ug") || lower.startsWith("uig")) {
    return "ug";
  }
  const primary = lower.split("-")[0];
  return I18N[primary] ? primary : allowAuto ? LANGUAGE_AUTO : "";
}
function languageNativeName(language) {
  return LANGUAGE_OPTIONS.find((option) => option.value === language)?.label || LANGUAGE_OPTIONS.find((option) => option.value === "en")?.label || "English";
}
function setNoteDrawCssProps(element, props) {
  if (typeof element?.setCssProps === "function") {
    element.setCssProps(props);
  }
}
function createNoteDrawControlElement(parent, cls) {
  const element = parent.createDiv({ cls });
  if (parent === activeDocument.body) {
    element.addClass("notedraw-body-control");
  }
  return element;
}
function bindNoteDrawControlTap(element, action) {
  let touchPointer = null;
  let suppressClickUntil = 0;
  element.addEventListener("pointerdown", (event) => {
    if (event.button !== void 0 && event.button !== 0) {
      return;
    }
    event.stopPropagation();
    if (event.pointerType && event.pointerType !== "mouse") {
      touchPointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY
      };
      try {
        element.setPointerCapture?.(event.pointerId);
      } catch (error) {
        void error;
      }
    }
  });
  element.addEventListener("pointerup", (event) => {
    if (!touchPointer || event.pointerId !== touchPointer.id) {
      return;
    }
    const moved = pointerDistance(touchPointer, { x: event.clientX, y: event.clientY });
    touchPointer = null;
    if (moved > 12) {
      return;
    }
    suppressClickUntil = Date.now() + 700;
    try {
      element.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      void error;
    }
    event.preventDefault();
    event.stopPropagation();
    action(event);
  });
  element.addEventListener("pointercancel", (event) => {
    touchPointer = null;
    try {
      element.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      void error;
    }
  });
  element.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (Date.now() <= suppressClickUntil) {
      suppressClickUntil = 0;
      return;
    }
    action(event);
  });
}
function shouldUseBodyFloatingControls(previewEl, surfaceType) {
  if (surfaceType !== "preview") {
    return false;
  }
  return isMobileRuntime() && Boolean(previewEl.closest?.(".markdown-preview-view"));
}
function isMobileRuntime() {
  return Boolean(Platform.isMobileApp || activeDocument?.body?.classList?.contains("is-mobile"));
}
function isAppleMobileRuntime() {
  return Boolean(Platform.isIosApp);
}
function isAppleTouchEvent(event) {
  if (!isAppleMobileRuntime()) {
    return false;
  }
  return event?.type?.startsWith?.("touch") || event?.pointerType === "touch";
}
function setAccessibleLabel(element, label) {
  if (!element || !label) {
    return;
  }
  element.setAttribute("title", label);
  element.setAttribute("aria-label", label);
}
function isCssColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
function contrastTextColor(hexColor) {
  if (!isCssColor(hexColor)) {
    return "#111827";
  }
  const red = parseInt(hexColor.slice(1, 3), 16);
  const green = parseInt(hexColor.slice(3, 5), 16);
  const blue = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.58 ? "#111827" : "#ffffff";
}
function brushWidthToPaletteSlider(value) {
  const width = clamp(Number(value) || MIN_BRUSH_WIDTH, MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH);
  const ratio = Math.log(width / MIN_BRUSH_WIDTH) / Math.log(MAX_BRUSH_WIDTH / MIN_BRUSH_WIDTH);
  return Math.round(clamp(ratio, 0, 1) * 1000);
}
function paletteSliderToBrushWidth(value) {
  const ratio = clamp(Number(value) / 1000, 0, 1);
  const width = MIN_BRUSH_WIDTH * Math.pow(MAX_BRUSH_WIDTH / MIN_BRUSH_WIDTH, ratio);
  return Math.round(width * 100) / 100;
}
function opacityToPaletteSlider(value) {
  return Math.round(Math.sqrt(clamp(Number(value), 0, 1)) * 1000);
}
function paletteSliderToOpacity(value) {
  const normalized = clamp(Number(value) / 1000, 0, 1);
  return Math.round(normalized * normalized * 10000) / 10000;
}
function isSourceTextTarget(target, previewEl) {
  if (!target || !previewEl?.contains(target)) {
    return false;
  }
  if (target.closest(BLOCKED_EDIT_SELECTOR)) {
    return false;
  }
  return Boolean(
    target.closest?.(".cm-line, .cm-content, .cm-activeLine") || target.classList?.contains("cm-line") || target.classList?.contains("cm-content")
  );
}
function normalizeRenderedText(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean).join("\n").trim();
}
function normalizeEditableSourceText(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function placeCaretInEditable(element, clientPoint) {
  const selection = window.getSelection?.();
  if (!selection) {
    return;
  }
  const range = rangeFromClientPoint(element, clientPoint) || nearestTextRangeFromPoint(element, clientPoint) || rangeAtEditableEnd(element);
  if (!range) {
    return;
  }
  selection.removeAllRanges();
  selection.addRange(range);
}
function rangeFromClientPoint(element, clientPoint) {
  if (!clientPoint || !Number.isFinite(clientPoint.x) || !Number.isFinite(clientPoint.y)) {
    return null;
  }
  let range = null;
  const overlay = element.closest(".notedraw-shell")?.querySelector(".notedraw-canvas");
  const previousPointerEvents = overlay?.style.pointerEvents;
  try {
    if (overlay) {
      applyElementStyles(overlay, { pointerEvents: "none" });
    }
    if (typeof activeDocument.caretPositionFromPoint === "function") {
      const position = activeDocument.caretPositionFromPoint(clientPoint.x, clientPoint.y);
      if (position?.offsetNode) {
        range = activeDocument.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      }
    } else {
      const legacyCaretRangeFromPoint = activeDocument[["caret", "Range", "From", "Point"].join("")];
      if (typeof legacyCaretRangeFromPoint === "function") {
        range = legacyCaretRangeFromPoint.call(activeDocument, clientPoint.x, clientPoint.y);
      }
    }
  } finally {
    if (overlay) {
      applyElementStyles(overlay, { pointerEvents: previousPointerEvents || "" });
    }
  }
  if (!range || !element.contains(range.startContainer)) {
    return null;
  }
  range.collapse(true);
  return range;
}
function nearestTextRangeFromPoint(element, clientPoint) {
  const walker = activeDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node2) {
        return node2.nodeValue && node2.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    }
  );
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue || "";
    for (let offset = 0; offset < value.length; offset += 1) {
      const charRange = activeDocument.createRange();
      charRange.setStart(node, offset);
      charRange.setEnd(node, offset + 1);
      for (const rect of Array.from(charRange.getClientRects())) {
        if (!isUsableRect(rect)) {
          continue;
        }
        const score = scoreRectDistance(rect, clientPoint);
        if (score < bestScore) {
          const caretOffset = clientPoint.x > rect.left + rect.width / 2 ? offset + 1 : offset;
          const caretRange = activeDocument.createRange();
          caretRange.setStart(node, caretOffset);
          caretRange.collapse(true);
          best = caretRange;
          bestScore = score;
        }
      }
    }
    node = walker.nextNode();
  }
  return best;
}
function isUsableRect(rect) {
  return rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 0 && rect.height > 0;
}
function rangeLineRect(range) {
  if (!range) {
    return null;
  }
  const rects = Array.from(range.getClientRects?.() || []).filter(isUsableRect);
  if (rects.length) {
    return rects[rects.length - 1];
  }
  const rect = range.getBoundingClientRect?.();
  if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.height > 0) {
    return rect;
  }
  return null;
}
function scoreRectDistance(rect, point) {
  const xDistance = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0;
  const centerY = rect.top + rect.height / 2;
  const sameLineBonus = point.y >= rect.top - 2 && point.y <= rect.bottom + 2 ? 0 : 1e5;
  const linePenalty = Math.abs(point.y - centerY) * 200;
  const inlinePenalty = xDistance;
  return sameLineBonus + linePenalty + inlinePenalty;
}
function rangeAtEditableEnd(element) {
  const range = activeDocument.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  return range;
}
function applyInlineFormatStyles(element, styles = {}) {
  const safeStyles = {};
  if (styles.color && isCssColor(styles.color)) {
    safeStyles.color = styles.color;
  }
  if (styles.backgroundColor && isCssColor(styles.backgroundColor)) {
    safeStyles.backgroundColor = styles.backgroundColor;
  }
  if (styles.fontSize && isSafeCssSize(styles.fontSize)) {
    safeStyles.fontSize = styles.fontSize;
  }
  if (Object.keys(safeStyles).length) {
    applyElementStyles(element, safeStyles);
  }
}
function selectNodeContents(node) {
  const selection = window.getSelection?.();
  if (!selection) {
    return;
  }
  const range = activeDocument.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}
function serializeEditableSource(element) {
  return stripGeneratedTerminalBreaks(serializeEditableChildren(element)).replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function isClearableInlineFormattingElement(element) {
  const tag = String(element?.tagName || "").toUpperCase();
  return ["A", "B", "CODE", "DEL", "EM", "I", "KBD", "MARK", "S", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "U"].includes(tag);
}
function serializeControllerEditableSource(element, embeddedSurface = false, cleanupTerminalBreak = false) {
  const source = serializeEditableSource(element);
  return cleanupTerminalBreak ? stripOneTerminalBreakPerLine(source) : source;
}
function stripOneTerminalBreakPerLine(value) {
  return String(value || "").replace(/<br\s*\/?>[ \t]*(?=\n|$)/gim, "").trim();
}
function stripGeneratedTerminalBreaks(value) {
  return String(value || "").replace(/(?:<br>\s*)+$/gi, "");
}
function serializeEditableChildren(node) {
  return Array.from(node.childNodes || []).map((child) => serializeEditableNode(child)).join("");
}
function serializeEditableNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue || "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }
  const element = node;
  const tag = element.tagName.toLowerCase();
  if (tag === "br") {
    return "<br>";
  }
  if (tag === "pre") {
    const code = element.querySelector("code");
    const text = code ? code.textContent || "" : element.textContent || "";
    return `\n\`\`\`\n${text.replace(/\n+$/g, "")}\n\`\`\`\n`;
  }
  let inner = serializeEditableChildren(element);
  if (["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "td", "th", "figcaption", "caption"].includes(tag)) {
    inner = stripGeneratedTerminalBreaks(inner);
  }
  if (!inner && !["span", "mark"].includes(tag)) {
    return "";
  }
  if (tag === "strong" || tag === "b") {
    return wrapInlineMarkdown(inner, "**");
  }
  if (tag === "em" || tag === "i") {
    return wrapInlineMarkdown(inner, "*");
  }
  if (tag === "u") {
    return `<u>${inner}</u>`;
  }
  if (tag === "code") {
    return inlineCodeMarkdown(element.textContent || inner);
  }
  if (tag === "mark") {
    const background = normalizeCssColor(element.style.backgroundColor);
    return background ? `<mark style="background-color: ${background};">${inner}</mark>` : `==${inner}==`;
  }
  if (tag === "span") {
    const styleText = serializeInlineStyle(element);
    return styleText ? `<span style="${styleText}">${inner}</span>` : inner;
  }
  if (tag === "kbd" || tag === "sup" || tag === "sub" || tag === "small") {
    return `<${tag}>${inner}</${tag}>`;
  }
  if (tag === "div" || tag === "p") {
    return `${inner.replace(/<br>$/, "")}\n`;
  }
  if (tag === "li") {
    return inner;
  }
  return inner;
}
function wrapInlineMarkdown(text, marker) {
  const value = String(text || "");
  return value.trim() ? `${marker}${value}${marker}` : value;
}
function inlineCodeMarkdown(text) {
  const value = String(text || "");
  const longest = Math.max(0, ...Array.from(value.matchAll(/`+/g)).map((match) => match[0].length));
  const fence = "`".repeat(longest + 1 || 1);
  return `${fence}${value}${fence}`;
}
function serializeInlineStyle(element) {
  const styles = [];
  const color = normalizeCssColor(element.style.color);
  const background = normalizeCssColor(element.style.backgroundColor);
  const fontSize = isSafeCssSize(element.style.fontSize) ? element.style.fontSize : "";
  const fontFamily = /monospace/i.test(element.style.fontFamily || "") ? "monospace" : "";
  if (color) {
    styles.push(`color: ${color}`);
  }
  if (background) {
    styles.push(`background-color: ${background}`);
  }
  if (fontSize) {
    styles.push(`font-size: ${fontSize}`);
  }
  if (fontFamily) {
    styles.push(`font-family: ${fontFamily}`);
  }
  return styles.join("; ");
}
function normalizeCssColor(value) {
  const text = String(value || "").trim();
  if (isCssColor(text)) {
    return text;
  }
  const rgb = text.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgb) {
    return "";
  }
  const toHex = (part) => clamp(Math.round(Number(part)), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
}
function isSafeCssSize(value) {
  return /^(0?\.?\d+|\d+(?:\.\d+)?)(em|rem|px|%)$/i.test(String(value || "").trim());
}
function normalizeMarkdownBlock(value) {
  let text = String(value || "").trim();
  text = text.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6])>/gi, "\n").replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "$1").replace(/<\/?(span|u|mark|kbd|sup|sub|small|strong|b|em|i|code)[^>]*>/gi, "").replace(/<[^>]+>/g, "");
  text = text.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "").replace(/^#{1,6}\s+/gm, "").replace(/^\s{0,3}>\s?/gm, "").replace(/^\s*[-*+]\s+/gm, "").replace(/^\s*\d+[.)]\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/_([^_]+)_/g, "$1").replace(/==([^=]+)==/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return normalizeRenderedText(text);
}
function collectMarkdownBlocks(source) {
  const blocks = [];
  const lines = source.split(/(\r?\n)/);
  let offset = 0;
  let lineNumber = 0;
  let start = 0;
  let startLine = 0;
  let buffer = "";
  let inFence = false;
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i] || "";
    const newline = lines[i + 1] || "";
    const fullLine = line + newline;
    const trimmed = line.trim();
    const lineStart = offset;
    const currentLine = lineNumber;
    offset += fullLine.length;
    lineNumber += 1;
    if (/^```|^~~~/.test(trimmed)) {
      if (buffer.trim()) {
        blocks.push({
          start,
          end: lineStart,
          line: startLine,
          endLine: Math.max(startLine, currentLine - 1),
          text: buffer.replace(/\s+$/, "")
        });
        buffer = "";
      }
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    if (!trimmed) {
      if (buffer.trim()) {
        blocks.push({
          start,
          end: lineStart,
          line: startLine,
          endLine: Math.max(startLine, currentLine - 1),
          text: buffer.replace(/\s+$/, "")
        });
        buffer = "";
      }
      start = offset;
      startLine = lineNumber;
      continue;
    }
    if (!buffer) {
      start = lineStart;
      startLine = currentLine;
    }
    buffer += fullLine;
  }
  if (buffer.trim()) {
    blocks.push({
      start,
      end: source.length,
      line: startLine,
      endLine: Math.max(startLine, lineNumber - 1),
      text: buffer.replace(/\s+$/, "")
    });
  }
  return blocks;
}
function resolveRenderedSourcePath(app, root, fallbackPath) {
  const embed = root?.closest?.(".internal-embed, .markdown-embed, .markdown-embed-content");
  if (!embed) {
    return normalizeVaultPath(fallbackPath);
  }
  const owner = embed.matches?.(".internal-embed") ? embed : embed.closest?.(".internal-embed") || embed.querySelector?.(".internal-embed") || embed;
  const rawLink = owner?.getAttribute?.("data-src") || owner?.getAttribute?.("data-path") || owner?.getAttribute?.("src") || "";
  const link = unwrapWikiLink(String(rawLink || "").replace(/^!/, "")).split("|")[0].split("#")[0].trim();
  if (!link) {
    return normalizeVaultPath(fallbackPath);
  }
  const file = app.metadataCache.getFirstLinkpathDest?.(link, fallbackPath || "") || getVaultFileByPath(app.vault, link);
  return normalizeVaultPath(file?.path || fallbackPath);
}
function annotateVisibleMarkdownElements(app, root, fallbackPath) {
  for (const element of root?.querySelectorAll?.(EDITABLE_SELECTOR) || []) {
    element.dataset.noteDrawSourcePath = resolveRenderedSourcePath(app, element, fallbackPath);
    if (element.dataset.noteDrawLineStart) {
      continue;
    }
    const dataLine = parseDataLine(element.getAttribute("data-line")) ?? parseDataLine(element.closest?.("[data-line]")?.getAttribute("data-line"));
    if (Number.isFinite(dataLine)) {
      element.dataset.noteDrawLineStart = String(dataLine);
      element.dataset.noteDrawLineEnd = String(dataLine);
      element.dataset.noteDrawDataLine = String(dataLine);
    }
  }
}
async function annotateRenderedMarkdownLines(app, root, fallbackPath, options = {}) {
  annotateVisibleMarkdownElements(app, root, fallbackPath);
  const annotated = Array.from(root?.querySelectorAll?.(EDITABLE_SELECTOR) || []).filter((element) => element.dataset.noteDrawSourcePath);
  const elements = annotated.filter((element) => {
    if (options.force === true) {
      return true;
    }
    const line = parseInteger(element.dataset.noteDrawLineStart);
    if (!Number.isFinite(line)) {
      return true;
    }
    return line === 0;
  });
  const sources = /* @__PURE__ */ new Map();
  for (const path of new Set(elements.map((element) => normalizeVaultPath(element.dataset.noteDrawSourcePath || fallbackPath)))) {
    const file = getVaultFileByPath(app.vault, path);
    if (!file) {
      continue;
    }
    try {
      sources.set(path, await app.vault.cachedRead(file));
    } catch (error) {
      void error;
    }
  }
  const usedTargets = /* @__PURE__ */ new Map();
  const sourceIndexes = new Map(Array.from(sources.entries()).map(([path, source]) => {
    return [path, createMarkdownSourceIndex(source)];
  }));
  for (const element of elements) {
    const path = normalizeVaultPath(element.dataset.noteDrawSourcePath || fallbackPath);
    const source = sources.get(path);
    const sourceIndex = sourceIndexes.get(path);
    if (typeof source !== "string") {
      continue;
    }
    const renderedText = element.innerText || element.textContent || element._noteDrawSourceText || "";
    const sourceInfo = getSourceInfo(element);
    const used = usedTargets.get(path) || /* @__PURE__ */ new Set();
    const sourceTargets = findRenderedMarkdownSourceTargets(source, renderedText, sourceIndex);
    let target = resolveRenderedMarkdownSourceTarget(source, renderedText, sourceInfo, sourceIndex);
    if (!target || used.has(`${target.start}:${target.end}`)) {
      target = sourceTargets.find((candidate) => {
        return !used.has(`${candidate.start}:${candidate.end}`);
      }) || null;
    }
    const fallback = target || sourceTargets.length ? null : matchRenderedTextToMarkdown(source, renderedText, sourceIndex);
    const match = target ? {
      lineStart: target.line,
      lineEnd: target.endLine,
      confidence: 1
    } : fallback;
    if (!match) {
      continue;
    }
    if (target) {
      used.add(`${target.start}:${target.end}`);
      usedTargets.set(path, used);
    }
    element.dataset.noteDrawLineStart = String(match.lineStart);
    element.dataset.noteDrawLineEnd = String(match.lineEnd);
    element.dataset.noteDrawLineConfidence = String(match.confidence);
  }
}
function annotateEditableElements(root, ctx, sourcePath = ctx?.sourcePath || "") {
  const elements = [];
  if (root.matches?.(EDITABLE_SELECTOR)) {
    elements.push(root);
  }
  elements.push(...root.querySelectorAll(EDITABLE_SELECTOR));
  for (const element of elements) {
    element.dataset.noteDrawSourcePath = normalizeVaultPath(sourcePath);
    const info = safeGetSectionInfo(ctx, element) || safeGetSectionInfo(ctx, root);
    const ownDataLine = parseDataLine(element.getAttribute("data-line"));
    const dataLineEl = element.closest("[data-line]");
    const closestDataLine = parseDataLine(dataLineEl?.getAttribute("data-line"));
    const dataLine = Number.isFinite(ownDataLine) ? ownDataLine : closestDataLine;
    if (Number.isFinite(dataLine)) {
      element.dataset.noteDrawDataLine = String(dataLine);
      element.dataset.noteDrawDataLineScope = Number.isFinite(ownDataLine) ? "self" : "ancestor";
    }
    if (!info) {
      continue;
    }
    if (typeof info.text === "string" && info.text.trim()) {
      element._noteDrawSourceText = info.text;
    }
    if (Number.isFinite(info.lineStart)) {
      element.dataset.noteDrawLineStart = String(info.lineStart);
      element.dataset.noteDrawLineConfidence = "1";
    }
    if (Number.isFinite(info.lineEnd)) {
      element.dataset.noteDrawLineEnd = String(info.lineEnd);
    }
  }
}
function safeGetSectionInfo(ctx, element) {
  try {
    return ctx.getSectionInfo?.(element) || null;
  } catch (error) {
    void error;
    return null;
  }
}
function findOwningMarkdownView(app, element, sourcePath) {
  const leaves = app.workspace.getLeavesOfType?.("markdown") || [];
  for (const leaf of leaves) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) {
      continue;
    }
    if (sourcePath && view.file?.path !== sourcePath) {
      continue;
    }
    if (view.containerEl?.contains(element)) {
      return view;
    }
  }
  return null;
}
function findOwningWorkspaceView(app, element) {
  const leaves = typeof app.workspace?.iterateAllLeaves === "function" ? collectWorkspaceLeaves(app) : [];
  for (const leaf of leaves) {
    const view = leaf?.view;
    if (view?.containerEl?.contains(element)) {
      return view;
    }
  }
  const leafContent = element.closest?.(".workspace-leaf-content");
  return leafContent?._notedrawFallbackView || {
    containerEl: leafContent || element,
    addAction: null,
    getViewType: () => leafContent?.dataset?.type || "webview"
  };
}
function findOwningLeaf(app, element) {
  if (!element) {
    return null;
  }
  return collectWorkspaceLeaves(app).find((leaf) => leaf?.view?.containerEl?.contains(element)) || null;
}
function findActiveWorkspaceLeaf(app) {
  try {
    const recent = app.workspace?.getMostRecentLeaf?.();
    if (recent?.view?.containerEl?.isConnected) {
      return recent;
    }
  } catch (error) {
    void error;
  }
  return collectWorkspaceLeaves(app).find((leaf) => {
    const container = leaf?.view?.containerEl;
    return Boolean(container?.closest?.(".workspace-leaf.mod-active, .workspace-tab-header.is-active")) || container?.classList?.contains("mod-active");
  }) || null;
}
function collectWorkspaceLeaves(app) {
  const leaves = [];
  try {
    app.workspace.iterateAllLeaves((leaf) => leaves.push(leaf));
  } catch (error) {
    void error;
    return [];
  }
  return leaves;
}
function collectImageWorkspaceLeaves(app) {
  const leaves = /* @__PURE__ */ new Set(app.workspace.getLeavesOfType?.("image") || []);
  for (const leaf of collectWorkspaceLeaves(app)) {
    if (isImageWorkspaceView(leaf?.view, workspaceViewType(leaf?.view))) {
      leaves.add(leaf);
    }
  }
  return Array.from(leaves);
}
function isMainWorkspaceView(view) {
  const container = view?.containerEl;
  if (!container?.isConnected || container.closest?.(".workspace-drawer, .mod-sidedock")) {
    return false;
  }
  return Boolean(container.closest?.(".workspace-split.mod-root"));
}
function workspaceViewType(view) {
  return String(view?.getViewType?.() || view?.containerEl?.querySelector?.(".workspace-leaf-content")?.dataset?.type || view?.containerEl?.dataset?.type || "").toLowerCase();
}
function isNativeGraphWorkspaceType(viewType) {
  return viewType === "graph" || viewType === "localgraph";
}
function isWebviewWorkspaceType(viewType) {
  return /(webview|web-view|browser|iframe)/i.test(String(viewType || ""));
}
var IMAGE_WORKSPACE_EXTENSIONS = /* @__PURE__ */ new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "apng", "ico", "tif", "tiff", "heic", "heif", "jxl"
]);
function isImageWorkspaceView(view, viewType = workspaceViewType(view)) {
  const normalizedType = String(viewType || "").trim().toLowerCase();
  if (normalizedType === "image" || normalizedType === "image-view" || normalizedType === "imageview") {
    return true;
  }
  const extension = String(view?.file?.extension || view?.file?.path?.split(".").pop() || "").trim().toLowerCase();
  return IMAGE_WORKSPACE_EXTENSIONS.has(extension);
}
function createWorkspaceDrawingFile(view, viewType) {
  const sourcePath = workspaceSurfaceStoragePath(view, viewType);
  return {
    path: sourcePath,
    name: sourcePath.split("/").pop() || "workspace.md",
    extension: "md"
  };
}
function normalizeRegisteredSurfaceOptions(app, options = {}) {
  const host = options.host || options.container || options.element;
  if (!isHtmlElementLike(host)) {
    throw new Error("NoteDraw registerSurface requires a host HTMLElement");
  }
  const owner = String(options.owner || "external").trim() || "external";
  const id = String(options.id || options.surfaceId || options.key || options.name || "").trim() || `${safeStorageName(owner)}-${hashString(Date.now())}`;
  const key = registeredSurfaceKey(owner, id);
  const normalizedSource = normalizeRegisteredSurfaceSource(options.source || {
    kind: options.kind,
    path: options.path || options.file?.path,
    url: options.url,
    key: options.sourceKey,
    title: options.title
  }, { owner, id });
  const source = normalizedSource.kind ? normalizedSource : {
    kind: "virtual",
    key: id,
    title: String(options.title || id)
  };
  const capabilities = normalizeRegisteredSurfaceCapabilities(options.capabilities);
  const file = createRegisteredSurfaceDrawingFile(app, { owner, id, key, source });
  return {
    owner,
    id,
    key,
    host,
    view: options.view || findOwningWorkspaceView(app, host) || { containerEl: host, getViewType: () => "notedraw-registered-surface" },
    source,
    capabilities,
    viewport: options.viewport || {},
    file
  };
}
function normalizeRegisteredSurfaceSource(source = {}, fallback = {}) {
  if (!source || typeof source !== "object") {
    return {};
  }
  const hasSource = Boolean(source.kind || source.path || source.file?.path || source.url || source.href || source.key || source.title);
  if (!hasSource) {
    return {};
  }
  const kind = String(source.kind || (source.url || source.href ? "url" : source.path || source.file?.path ? "vault" : "virtual")).trim().toLowerCase();
  const normalizedKind = ["vault", "url", "virtual"].includes(kind) ? kind : "virtual";
  const result = {
    kind: normalizedKind,
    title: String(source.title || source.name || fallback.id || "").trim()
  };
  if (normalizedKind === "vault") {
    result.path = normalizeVaultPath(source.path || source.file?.path || source.key || "");
    result.key = result.path || String(source.key || fallback.id || "").trim();
  } else if (normalizedKind === "url") {
    result.url = canonicalizeWebviewUrl(source.url || source.href || source.key || "");
    result.key = result.url || String(source.key || fallback.id || "").trim();
  } else {
    result.key = String(source.key || source.path || source.url || fallback.id || "").trim();
  }
  return result;
}
function normalizeRegisteredSurfaceCapabilities(capabilities = {}) {
  return {
    drawing: capabilities.drawing !== false,
    textEditing: capabilities.textEditing !== false,
    elements: capabilities.elements !== false,
    attachments: capabilities.attachments !== false
  };
}
function createRegisteredSurfaceDrawingFile(app, record) {
  const source = record.source || {};
  if (source.kind === "vault" && source.path) {
    const file = getVaultFileByPath(app?.vault, source.path);
    if (file) {
      return file;
    }
    return {
      path: source.path,
      name: source.path.split("/").pop() || "registered-surface.md",
      extension: source.path.split(".").pop() || "md"
    };
  }
  const sourcePath = registeredSurfaceStoragePath(record);
  return {
    path: sourcePath,
    name: sourcePath.split("/").pop() || "registered-surface.md",
    extension: "md"
  };
}
function registeredSurfaceStoragePath(record) {
  const source = record.source || {};
  const identity = [record.owner, record.id, source.kind, source.path, source.url, source.key, source.title].filter(Boolean).join("|") || `${record.owner}|${record.id}`;
  const owner = safeStorageName(record.owner || "external");
  const label = safeStorageName(source.title || source.url || source.path || source.key || record.id || "surface");
  return `${REGISTERED_SURFACE_PREFIX}/${owner}/${label}__${hashString(identity)}.md`;
}
function registeredSurfaceKey(owner, id) {
  return `${String(owner || "external").trim() || "external"}::${String(id || "surface").trim() || "surface"}`;
}
function isHtmlElementLike(value) {
  return Boolean(value && value.nodeType === 1 && typeof value.querySelector === "function" && typeof value.appendChild === "function");
}
function workspaceSurfaceStoragePath(view, viewType) {
  let state = {};
  try {
    state = view?.getState?.() || {};
  } catch (error) {
    void error;
  }
  const title = viewTitle(view) || viewType || "workspace";
  let serializedState = "";
  try {
    serializedState = JSON.stringify(state);
  } catch (error) {
    void error;
  }
  const identity = `${viewType || "workspace"}|${title}|${serializedState}`;
  return `${WORKSPACE_DRAWING_PREFIX}/${safeStorageName(title)}__${hashString(identity)}.md`;
}
function findWorkspaceDrawingSurface(view) {
  const candidates = [
    view?.contentEl,
    view?.containerEl?.querySelector?.(":scope > .view-content"),
    view?.containerEl?.querySelector?.(".view-content")
  ].filter((element) => element?.isConnected && !element.closest?.(".notedraw-body-control"));
  return candidates.find((element) => element.getBoundingClientRect?.().width > 8 && element.getBoundingClientRect?.().height > 8) || candidates[0] || null;
}
function findRootPreviewsForView(view) {
  const rendererPreview = view?.previewMode?.renderer?.previewEl;
  const candidates = [rendererPreview, ...Array.from(view?.containerEl?.querySelectorAll(".markdown-preview-view") || [])];
  return Array.from(new Set(candidates)).filter((preview) => preview?.isConnected && !isEmbeddedPreview(preview));
}
function findRootPreviewForView(view) {
  const previews = findRootPreviewsForView(view);
  const rendererPreview = view?.previewMode?.renderer?.previewEl;
  return pickRootPreview(previews, rendererPreview, isElementVisibleEnough, isElementLaidOut);
}
function rootPreviewSizer(preview) {
  return preview?.querySelector?.(":scope > .markdown-preview-sizer") || preview?.querySelector?.(".markdown-preview-sizer") || null;
}
function rootPreviewHasRenderedContent(preview) {
  const sizer = rootPreviewSizer(preview);
  if (!sizer) {
    return false;
  }
  const ignored = ".mod-ui, .mod-header, .mod-footer, .markdown-preview-pusher, .notedraw-reading-zoom-extent, .notedraw-reading-bottom-spacer, .notedraw-embed-layer, .notedraw-underlay-embed-layer, .notedraw-underlay-canvas, .notedraw-static-canvas, .notedraw-canvas";
  for (const section of sizer.querySelectorAll?.(".markdown-preview-section") || []) {
    if (Array.from(section.children || []).some((element) => !element.matches?.(ignored))) {
      return true;
    }
  }
  return Array.from(sizer.children || []).some((element) => {
    return !element.matches?.(`${ignored}, .markdown-preview-section`);
  });
}
function markdownViewHasSourceContent(view) {
  const candidates = [view?.data];
  try {
    candidates.push(view?.editor?.getValue?.());
  } catch (error) {
    void error;
  }
  if (candidates.some((value) => typeof value === "string" && value.trim().length > 0)) {
    return true;
  }
  return Number(view?.file?.stat?.size) > 0;
}
function rootPreviewLifecycleState(view, preview) {
  return {
    sourceMode: isSourceMode(view) && !isElementVisibleEnough(preview),
    visible: isMarkdownPreviewVisible(view, preview),
    hasSurface: Boolean(preview && rootPreviewSizer(preview)),
    sourceHasContent: markdownViewHasSourceContent(view),
    renderedContent: rootPreviewHasRenderedContent(preview)
  };
}
function isRootPreviewReady(view, preview) {
  return shouldMountRootPreview(rootPreviewLifecycleState(view, preview));
}
function resetDormantRootPreview(view, preview) {
  if (!preview || !shouldResetDormantRootPreview(rootPreviewLifecycleState(view, preview))) {
    return false;
  }
  cleanupDrawingUi(preview);
  const sizer = rootPreviewSizer(preview);
  for (const property of ["min-height", "padding-bottom"]) {
    sizer?.style?.removeProperty(property);
  }
  cleanupOrphanedNoteFlowLayout(preview);
  return true;
}
function findPrimaryMarkdownSurface(view) {
  const source = findSourceSurfaceForView(view);
  const preview = findRootPreviewForView(view);
  if (isMarkdownPreviewVisible(view, preview)) {
    return preview;
  }
  if (isMarkdownSourceVisible(view, source)) {
    return source;
  }
  return isSourceMode(view) ? source || preview : preview || source;
}
function currentMarkdownSurfaceType(view) {
  const preview = findRootPreviewForView(view);
  if (isMarkdownPreviewVisible(view, preview)) {
    return "preview";
  }
  const source = findSourceSurfaceForView(view);
  if (isMarkdownSourceVisible(view, source)) {
    return "source";
  }
  return isSourceMode(view) ? "source" : "preview";
}
function isReadingSurfaceVisible(view) {
  const preview = findRootPreviewForView(view);
  return isMarkdownPreviewVisible(view, preview);
}
function isElementVisibleEnough(element) {
  if (!isElementLaidOut(element)) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return Boolean(rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth);
}
function isMarkdownPreviewVisible(view, preview) {
  if (!view || !preview?.isConnected || !isElementDisplayVisible(preview)) {
    return false;
  }
  if (hasVisibleAlternateWorkspaceSurface(view, preview)) {
    return false;
  }
  const viewContent = view.containerEl?.querySelector?.(":scope > .view-content")
    || view.containerEl?.querySelector?.(".view-content")
    || view.containerEl;
  if (!isElementVisibleEnough(viewContent)) {
    return false;
  }
  return Boolean(rootPreviewSizer(preview) && isElementLaidOut(preview));
}
function hasVisibleAlternateWorkspaceSurface(view, preview) {
  if (!view?.containerEl || !preview) {
    return false;
  }
  return findWebviewSurfaces(view.containerEl).some((surface) => (
    isElementVisibleEnough(surface)
    && (!preview.contains?.(surface) || isDominantEmbeddedWebviewSurface(preview, surface))
  ));
}
function isDominantEmbeddedWebviewSurface(preview, surface) {
  if (!preview?.contains?.(surface) || !surface?.matches?.(".mwv-embed[data-url]")) {
    return false;
  }
  const previewWidth = Math.max(1, Number(preview.clientWidth) || Number(preview.offsetWidth) || 1);
  const previewHeight = Math.max(1, Number(preview.clientHeight) || Number(preview.offsetHeight) || 1);
  const surfaceWidth = Math.max(0, Number(surface.offsetWidth) || 0);
  const surfaceHeight = Math.max(0, Number(surface.offsetHeight) || 0);
  const surfaceBlock = surface.closest?.(".el-div, .el-p, .el-pre, .el-table, .el-blockquote, .el-ul, .el-ol") || surface;
  const sizer = rootPreviewSizer(preview);
  const otherBodyBlocks = Array.from(sizer?.children || []).filter((element) => {
    return element !== surfaceBlock
      && element.matches?.("[class*='el-']")
      && !element.matches?.(".el-h1, .el-h2, .el-h3, .el-h4, .el-h5, .el-h6");
  });
  const primaryDocumentSurface = preview.classList?.contains("mwv-note-browser-document")
    && otherBodyBlocks.length === 0;
  return surfaceWidth >= previewWidth * 0.8
    && (surfaceHeight >= previewHeight * 0.8 || primaryDocumentSurface);
}
function isElementDisplayVisible(element) {
  if (!element?.isConnected) {
    return false;
  }
  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  return style?.display !== "none" && style?.visibility !== "hidden" && Number(style?.opacity ?? 1) !== 0;
}
function isMarkdownSourceVisible(view, source = findSourceSurfaceForView(view)) {
  if (!view || !source?.isConnected || !isElementDisplayVisible(source) || !isElementLaidOut(source)) {
    return false;
  }
  const sourceRoot = source.closest?.(".markdown-source-view") || source;
  return isElementDisplayVisible(sourceRoot) && isElementLaidOut(sourceRoot);
}
function isElementLaidOut(element) {
  if (!element?.isConnected) {
    return false;
  }
  const rect = element.getBoundingClientRect?.();
  return Boolean(rect && rect.width > 8 && rect.height > 8);
}
function isElementNearViewport(element, margin = 320) {
  if (!isElementLaidOut(element)) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.bottom > -margin && rect.right > -margin && rect.top < window.innerHeight + margin && rect.left < window.innerWidth + margin;
}
function isBlockingObsidianOverlayOpen(document) {
  const candidates = document?.querySelectorAll?.(".modal-container .modal, .modal-container.mod-dim, .modal-bg") || [];
  return Array.from(candidates).some((element) => {
    if (!element?.isConnected) {
      return false;
    }
    const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
    const rect = element.getBoundingClientRect?.();
    return style?.display !== "none" && style?.visibility !== "hidden" && Number(style?.opacity ?? 1) !== 0 && Boolean(rect && rect.width > 1 && rect.height > 1);
  });
}
function findWebviewSurfaces(root) {
  if (!root) {
    return [];
  }
  const selectors = [
    ".mwv-embed[data-url]",
    ".workspace-leaf-content[data-type='mobile-webviewer-view'] .view-content",
    ".workspace-leaf-content[data-type*='webview'] .view-content",
    ".workspace-leaf-content[data-type*='web-view'] .view-content",
    ".workspace-leaf-content[data-type*='browser'] .view-content",
    ".workspace-leaf-content[data-type*='iframe'] .view-content"
  ];
  const candidates = selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)));
  const iframeHosts = Array.from(root.querySelectorAll("webview, iframe")).map((element) => element.closest(".mwv-embed[data-url], .view-content, .workspace-leaf-content") || element);
  return uniqueConnectedElements([...candidates, ...iframeHosts]).filter((element) => {
    const viewType = String(element.closest?.(".workspace-leaf-content")?.dataset?.type || "").toLowerCase();
    return !isNativeGraphWorkspaceType(viewType) && !element.closest(".notedraw-toolbar, .notedraw-palette-panel, .notedraw-brush-panel, .notedraw-text-panel");
  });
}
function findWebviewButtonHost(previewEl, view) {
  const candidates = [
    previewEl?.querySelector?.(".mwv-toolbar"),
    previewEl?.querySelector?.(".mwv-note-actions"),
    previewEl?.querySelector?.(".mwv-note-source"),
    previewEl?.querySelector?.(".mwv-address-row"),
    previewEl?.querySelector?.(".mwv-header"),
    view?.containerEl?.querySelector?.(".view-actions")
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate?.isConnected) {
      return candidate;
    }
  }
  return null;
}
function uniqueConnectedElements(elements) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const element of elements) {
    if (!element?.isConnected || seen.has(element)) {
      continue;
    }
    seen.add(element);
    result.push(element);
  }
  return result.filter((element) => !result.some((other) => other !== element && element.contains(other)));
}
function createWebviewDrawingFile(surface, view) {
  const sourcePath = webviewSurfaceStoragePath(surface, view);
  return {
    path: sourcePath,
    name: sourcePath.split("/").pop() || "webview.md",
    extension: "md"
  };
}
function webviewSurfaceStoragePath(surface, view) {
  const explicitUrl = surface?.dataset?.url || surface?.querySelector?.("[data-url]")?.dataset?.url || webviewCurrentUrl(view) || surface?.querySelector?.("webview, iframe")?.getAttribute?.("src") || "";
  const identity = canonicalizeWebviewUrl(explicitUrl) || viewTitle(view) || surface?.closest?.(".workspace-leaf-content")?.getAttribute?.("data-type") || "webview";
  const label = safeStorageName(webviewSurfaceLabel(identity, view));
  return `${WEBVIEW_DRAWING_PREFIX}/${label}__${hashString(identity)}.md`;
}
function webviewCurrentUrl(view) {
  const candidates = [
    view?.currentUrl,
    view?.iframeEl?.getAttribute?.("src"),
    view?.iframeEl?.src,
    view?.addressEl?.value
  ];
  return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
}
function canonicalizeWebviewUrl(url) {
  const text = String(url || "").trim();
  if (!text) {
    return "";
  }
  try {
    return new URL(text).toString();
  } catch (error) {
    void error;
    return text;
  }
}
function webviewSurfaceLabel(identity, view) {
  try {
    const parsed = new URL(identity);
    return parsed.hostname.replace(/^www\./, "") || viewTitle(view) || "webview";
  } catch (error) {
    void error;
    return viewTitle(view) || "webview";
  }
}
function viewTitle(view) {
  try {
    if (typeof view?.getDisplayText === "function") {
      return view.getDisplayText();
    }
  } catch (error) {
    void error;
  }
  return view?.containerEl?.querySelector?.(".view-header-title")?.textContent?.trim() || view?.containerEl?.getAttribute?.("data-type") || view?.getViewType?.() || "webview";
}
function safeStorageName(value) {
  return String(value || "webview").replace(/\\/g, "/").split("/").pop().replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "webview";
}
function applyElementStyles(element, styles) {
  if (!element || !styles) {
    return;
  }
  if (typeof element.setCssStyles === "function") {
    element.setCssStyles(styles);
    return;
  }
  for (const [key, value] of Object.entries(styles)) {
    element.style[key] = value;
  }
}
function findNoteDrawExportHost(container) {
  const closestShell = container.closest?.(".notedraw-shell");
  if (closestShell instanceof HTMLElement) {
    return closestShell;
  }
  const nestedShell = container.querySelector?.(".notedraw-shell");
  if (nestedShell instanceof HTMLElement) {
    return nestedShell;
  }
  return container;
}
async function prepareExportImages(root) {
  const images = root instanceof HTMLImageElement ? [root] : Array.from(root?.querySelectorAll?.("img") || []);
  for (const image of images) {
    await prepareExportImage(image);
  }
}
async function prepareExportImage(image) {
  if (!(image instanceof HTMLImageElement)) {
    return;
  }
  image.removeAttribute("srcset");
  image.setAttribute("decoding", "sync");
  image.setAttribute("loading", "eager");
  await waitForImage(image, 1800).catch(() => null);
  if (!image.naturalWidth || !image.naturalHeight) {
    return;
  }
  flattenImageOnWhite(image);
}
function flattenImageOnWhite(image) {
  try {
    const width = Math.max(1, image.naturalWidth || image.width);
    const height = Math.max(1, image.naturalHeight || image.height);
    const canvas = activeDocument.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return false;
    }
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    image.src = canvas.toDataURL("image/png");
    return true;
  } catch (error) {
    void error;
    return false;
  }
}
function hashString(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function isSourceMode(view) {
  try {
    if (typeof view?.getMode === "function") {
      return view.getMode() === "source";
    }
  } catch (error) {
    void error;
  }
  const stateMode = view?.getState?.()?.mode;
  if (stateMode) {
    return stateMode === "source";
  }
  return Boolean(findSourceSurfaceForView(view));
}
function findSourceSurfaceForView(view) {
  const container = view?.containerEl;
  if (!container) {
    return null;
  }
  const candidates = [
    container.querySelector(".markdown-source-view .cm-scroller"),
    container.querySelector(".markdown-source-view .cm-editor"),
    container.querySelector(".markdown-source-view")
  ].filter(Boolean);
  return candidates.find((element) => isElementDisplayVisible(element) && isElementLaidOut(element))
    || candidates.find((element) => isElementLaidOut(element))
    || candidates[0]
    || null;
}
function getCodeMirrorView(markdownView, sourceEl) {
  const candidates = [
    markdownView?.editor?.cm,
    markdownView?.editor?.editor?.cm,
    markdownView?.editor?.editor,
    markdownView?.cm,
    markdownView?.cmEditor,
    sourceEl?.cmView
  ];
  return candidates.find((candidate) => candidate && typeof candidate.posAtCoords === "function" && typeof candidate.dispatch === "function") || null;
}
function dispatchMouseClickThroughOverlay(canvas, clientPoint) {
  if (!canvas || !clientPoint) {
    return false;
  }
  const previousPointerEvents = canvas.style.pointerEvents;
  applyElementStyles(canvas, { pointerEvents: "none" });
  const target = activeDocument.elementFromPoint(clientPoint.x, clientPoint.y);
  applyElementStyles(canvas, { pointerEvents: previousPointerEvents || "" });
  if (!target) {
    return false;
  }
  const eventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: clientPoint.x,
    clientY: clientPoint.y,
    button: 0,
    buttons: 1
  };
  target.dispatchEvent(new MouseEvent("mousedown", eventInit));
  target.dispatchEvent(new MouseEvent("mouseup", { ...eventInit, buttons: 0 }));
  target.dispatchEvent(new MouseEvent("click", { ...eventInit, buttons: 0 }));
  return true;
}
function collectTextLineRectsBelowCanvas(canvas, root) {
  const document = canvas?.ownerDocument || activeDocument;
  const canvasRect = canvas?.getBoundingClientRect?.();
  if (!canvas || !root || !canvasRect || !document?.createTreeWalker) {
    return [];
  }
  const nodeFilter = document.defaultView?.NodeFilter || window.NodeFilter;
  if (!nodeFilter) {
    return [];
  }
  const seenNodes = /* @__PURE__ */ new Set();
  const seenRects = /* @__PURE__ */ new Set();
  const rects = [];
  const addRect = (rect, element) => {
    if (
      !rect || rect.width <= 1 || rect.height <= 1 ||
      rect.bottom < canvasRect.top - 48 || rect.top > canvasRect.bottom + 48 ||
      rect.right < canvasRect.left - 180 || rect.left > canvasRect.right + 180
    ) {
      return;
    }
    const key = [rect.left, rect.top, rect.right, rect.bottom].map((value) => Math.round(value * 2)).join(":");
    if (seenRects.has(key)) {
      return;
    }
    seenRects.add(key);
    rects.push({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      sourcePath: element.dataset.noteDrawSourcePath || "",
      lineStart: parseInteger(element.dataset.noteDrawLineStart),
      lineEnd: parseInteger(element.dataset.noteDrawLineEnd)
    });
  };
  for (const textElement of root.querySelectorAll?.(MARKDOWN_TEXT_SELECTOR) || []) {
    if (
      textElement.closest?.(WEBVIEW_BLOCKED_EDIT_SELECTOR) ||
      textElement.closest?.(NOTEDRAW_OWNED_MUTATION_SELECTOR) ||
      textElement.querySelector?.(MARKDOWN_TEXT_SELECTOR)
    ) {
      continue;
    }
    const beforeCount = rects.length;
    const walker = document.createTreeWalker(textElement, nodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && rects.length < 1200) {
      if (!seenNodes.has(node) && String(node.nodeValue || "").trim()) {
        seenNodes.add(node);
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          addRect(rect, textElement);
        }
      }
      node = walker.nextNode();
    }
    if (beforeCount === rects.length) {
      addRect(textElement.getBoundingClientRect?.(), textElement);
    }
    if (rects.length >= 1200) {
      break;
    }
  }
  for (const textElement of root.querySelectorAll?.(".cm-line") || []) {
    if (rects.length >= 1200 || textElement.closest?.(WEBVIEW_BLOCKED_EDIT_SELECTOR) || textElement.closest?.(NOTEDRAW_OWNED_MUTATION_SELECTOR)) {
      continue;
    }
    const beforeCount = rects.length;
    const walker = document.createTreeWalker(textElement, nodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && rects.length < 1200) {
      if (!seenNodes.has(node) && String(node.nodeValue || "").trim()) {
        seenNodes.add(node);
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          addRect(rect, textElement);
        }
      }
      node = walker.nextNode();
    }
    if (beforeCount === rects.length) {
      addRect(textElement.getBoundingClientRect?.(), textElement);
    }
  }
  return rects;
}
function domPathForElement(element, root) {
  if (!element || !root?.contains(element) || element === root) {
    return "";
  }
  const parts = [];
  let current = element;
  while (current && current !== root && current.nodeType === Node.ELEMENT_NODE) {
    const parent = current.parentElement;
    if (!parent) {
      return "";
    }
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
    const index = Math.max(0, siblings.indexOf(current));
    parts.unshift(`${tag}:${index}`);
    current = parent;
  }
  return parts.join("/");
}
function elementForDomPath(root, path) {
  if (!root || !path) {
    return null;
  }
  let current = root;
  for (const part of String(path).split("/")) {
    const [tag, indexText] = part.split(":");
    const index = Number(indexText);
    if (!tag || !Number.isInteger(index) || index < 0) {
      return null;
    }
    const matches = Array.from(current.children || []).filter((child) => child.tagName.toLowerCase() === tag);
    current = matches[index] || null;
    if (!current) {
      return null;
    }
  }
  return current;
}
function findWebEditElement(root, edit, used = /* @__PURE__ */ new Set()) {
  const direct = elementForDomPath(root, edit.path);
  if (direct && !used.has(direct)) {
    return direct;
  }
  const original = normalizeRenderedText(edit.originalText);
  if (!original) {
    return null;
  }
  const candidates = Array.from(root.querySelectorAll(WEBVIEW_EDITABLE_SELECTOR)).filter((element) => !used.has(element) && !element.closest(WEBVIEW_BLOCKED_EDIT_SELECTOR));
  return candidates.find((element) => normalizeRenderedText(element.innerText) === original) || null;
}
function isEmbeddedPreview(preview) {
  return Boolean(preview.closest(".markdown-embed, .markdown-embed-content, .internal-embed, .external-embed"));
}
function isEmbeddedEditableElement(element) {
  return Boolean(element?.closest?.(".markdown-embed, .markdown-embed-content, .internal-embed"));
}
function cleanupAllDrawingHeaderButtons() {
  activeDocument.querySelectorAll(".notedraw-header-button, .notedraw-webview-button").forEach((button) => button.remove());
  activeDocument.body?.querySelectorAll?.(".notedraw-body-control, .notedraw-file-input").forEach((element) => element.remove());
}
function cleanupOrphanedNoteFlowLayout(preview) {
  preview?.querySelectorAll?.(".notedraw-note-flow-line-spacer, .notedraw-note-flow-block-spacer").forEach((spacer) => spacer.remove());
  for (const anchor of preview?.querySelectorAll?.(".notedraw-note-flow-anchor") || []) {
    for (const property of ["padding-top", "padding-bottom", "margin-top", "margin-bottom"]) {
      if (anchor.style?.getPropertyPriority(property) === "important") {
        anchor.style.removeProperty(property);
      }
    }
    anchor.classList?.remove("notedraw-note-flow-anchor");
  }
}
function cleanupDrawingUi(preview) {
  cleanupOrphanedNoteFlowLayout(preview);
  preview.querySelectorAll(".notedraw-button, .notedraw-fallback-button, .notedraw-webview-button, .notedraw-toolbar, .notedraw-palette-panel, .notedraw-brush-panel, .notedraw-text-panel, .notedraw-selection-menu, .notedraw-format-toolbar, .notedraw-reading-zoom-extent, .notedraw-reading-bottom-spacer, .notedraw-embed-layer, .notedraw-underlay-embed-layer, .notedraw-note-flow-line-spacer, .notedraw-note-flow-block-spacer, .notedraw-file-input, .notedraw-underlay-canvas, .notedraw-static-canvas, .notedraw-canvas").forEach((element) => element.remove());
  preview.classList.remove("notedraw-shell", "is-drawing-active", "is-drawing-hidden", "is-select-mode", "is-palette-open", "is-brush-panel-open", "is-text-panel-open", "is-selection-menu-open", "is-watercolor-mode", "is-edit-md-mode", "is-selecting-strokes", "is-resizing-selection", "is-native-text-editing", "is-reading-zoomed", "is-editing-layout-zoomed", "is-notedraw-webview-shell", "is-notedraw-workspace-shell", "is-notedraw-embedded-shell", "is-notedraw-registered-shell", "is-notedraw-responsive-layout", "is-notedraw-controls-visible", "has-notedraw-body-controls", "has-notedraw-canvas");
  for (const property of [
    "--notedraw-toolbar-right",
    "--notedraw-toolbar-left",
    "--notedraw-toolbar-top",
    "--notedraw-palette-top",
    "--notedraw-palette-left",
    "--notedraw-palette-right",
    "--notedraw-brush-panel-top",
    "--notedraw-brush-panel-left",
    "--notedraw-brush-panel-right",
    "--notedraw-text-panel-top",
    "--notedraw-text-panel-left",
    "--notedraw-text-panel-right"
  ]) {
    preview.style?.removeProperty(property);
  }
}
function isNoteDrawOwnedMutation(mutation) {
  if (!mutation) {
    return false;
  }
  const target = mutation.target;
  if (target?.nodeType === Node.ELEMENT_NODE && (
    target.matches?.(NOTEDRAW_OWNED_MUTATION_SELECTOR) || target.closest?.(NOTEDRAW_OWNED_MUTATION_SELECTOR)
  )) {
    return true;
  }
  const nodes = [...Array.from(mutation.addedNodes || []), ...Array.from(mutation.removedNodes || [])];
  return nodes.length > 0 && nodes.every((node) => (
    node?.nodeType !== Node.ELEMENT_NODE ||
    node.matches?.(NOTEDRAW_OWNED_MUTATION_SELECTOR) ||
    node.closest?.(NOTEDRAW_OWNED_MUTATION_SELECTOR)
  ));
}
function isMarkdownContentMutation(mutation) {
  if (mutation?.type !== "childList" || isNoteDrawOwnedMutation(mutation)) {
    return false;
  }
  const markdownRootSelector = ".markdown-preview-view, .markdown-embed-content, .internal-embed";
  return Array.from(mutation.addedNodes || []).some((node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    const insideMarkdown = Boolean(node.closest?.(markdownRootSelector));
    return node.matches?.(markdownRootSelector) || node.querySelector?.(markdownRootSelector) || insideMarkdown && (node.matches?.(MARKDOWN_TEXT_SELECTOR) || node.querySelector?.(MARKDOWN_TEXT_SELECTOR));
  });
}
function isEmbeddedSurfaceSyncMutation(mutation) {
  if (!mutation || isNoteDrawOwnedMutation(mutation)) {
    return false;
  }
  const selector = ".markdown-embed, .markdown-embed-content, .internal-embed";
  if (mutation.type === "attributes") {
    return mutation.attributeName === "class" && Boolean(
      mutation.target?.matches?.(selector) || mutation.target?.closest?.(selector) || mutation.target?.querySelector?.(selector)
    );
  }
  if (mutation.type !== "childList") {
    return false;
  }
  return [...Array.from(mutation.addedNodes || []), ...Array.from(mutation.removedNodes || [])].some((node) => (
    node?.nodeType === Node.ELEMENT_NODE && (node.matches?.(selector) || node.querySelector?.(selector) || node.closest?.(selector))
  ));
}
function isWebviewSyncMutation(mutation) {
  if (!mutation || isNoteDrawOwnedMutation(mutation)) {
    return false;
  }
  if (mutation.type === "attributes") {
    return mutation.attributeName === "data-url" || mutation.attributeName === "src";
  }
  if (mutation.type !== "childList") {
    return false;
  }
  return [...Array.from(mutation.addedNodes || []), ...Array.from(mutation.removedNodes || [])].some((node) => isWebviewRelatedNode(node));
}
function isWorkspaceSurfaceMutation(mutation) {
  if (!mutation || isNoteDrawOwnedMutation(mutation)) {
    return false;
  }
  if (mutation.type === "attributes") {
    return Boolean(mutation.target?.matches?.(".workspace-leaf, .workspace-leaf-content, .view-content, .canvas-wrapper"));
  }
  if (mutation.type !== "childList") {
    return false;
  }
  const nodes = [...Array.from(mutation.addedNodes || []), ...Array.from(mutation.removedNodes || [])].filter((node) => {
    return node?.nodeType === Node.ELEMENT_NODE && !node.matches?.(".notedraw-reading-bottom-spacer, .notedraw-underlay-canvas, .notedraw-static-canvas, .notedraw-canvas, .notedraw-embed-layer, .notedraw-underlay-embed-layer, .notedraw-body-control");
  });
  if (!nodes.length) {
    return false;
  }
  const leafContent = mutation.target?.closest?.(".workspace-leaf-content");
  const viewType = leafContent?.dataset?.type || "";
  return Boolean(leafContent) && viewType !== "markdown" && !isWebviewWorkspaceType(viewType) && !isNativeGraphWorkspaceType(viewType);
}
function isFloatingControlsVisibilityMutation(mutation) {
  if (!mutation || isNoteDrawOwnedMutation(mutation)) {
    return false;
  }
  if (mutation.type === "attributes") {
    return Boolean(mutation.target?.matches?.(".workspace-leaf, .workspace-leaf-content, .workspace-tabs, .modal-container, .modal, .app-container, body"));
  }
  if (mutation.type !== "childList") {
    return false;
  }
  const selector = ".modal-container, .modal, .modal-bg, .workspace-leaf, .workspace-leaf-content";
  return [...Array.from(mutation.addedNodes || []), ...Array.from(mutation.removedNodes || [])].some((node) => (
    node?.nodeType === Node.ELEMENT_NODE && (node.matches?.(selector) || node.querySelector?.(selector))
  ));
}
function isWebviewRelatedNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }
  return node.matches?.(".mwv-embed, webview, iframe, .workspace-leaf-content[data-type*='webview'], .workspace-leaf-content[data-type*='web-view'], .workspace-leaf-content[data-type*='browser'], .workspace-leaf-content[data-type*='iframe']") || Boolean(node.querySelector?.(".mwv-embed, webview, iframe, .workspace-leaf-content[data-type*='webview'], .workspace-leaf-content[data-type*='web-view'], .workspace-leaf-content[data-type*='browser'], .workspace-leaf-content[data-type*='iframe']"));
}
function getVaultFileByPath(vault, path) {
  const normalized = normalizeVaultPath(path);
  if (!vault || !normalized) {
    return null;
  }
  const file = vault.getAbstractFileByPath(normalizePath(normalized));
  return file && typeof file.extension === "string" ? file : null;
}
function normalizeVaultPath(path) {
  return String(path || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}
function sanitizeAssetFileName(name) {
  const cleaned = String(name || "attachment.bin").replace(/\\/g, "/").split("/").pop().split("").map((character) => {
    const code = character.charCodeAt(0);
    if (character === "<" || character === ">" || character === ":" || character === '"' || character === "|" || character === "?" || character === "*" || code <= 31) {
      return "_";
    }
    return character;
  }).join("").replace(/\s+/g, " ").trim();
  return cleaned || "attachment.bin";
}
function normalizeStrokeKind(kind) {
  if (kind === TOOL_TEXT || kind === TOOL_EMBED) {
    return kind;
  }
  return void 0;
}
function normalizeBrushVariant(brush, variant) {
  const value = String(variant || BRUSH_VARIANT_DEFAULT).trim().toLowerCase();
  if (brush === BRUSH_WATERCOLOR) {
    return [WATERCOLOR_VARIANT_TEXT, WATERCOLOR_VARIANT_STRAIGHT].includes(value) ? value : BRUSH_VARIANT_DEFAULT;
  }
  return [PEN_VARIANT_FOUNTAIN, PEN_VARIANT_NOTE].includes(value) ? value : BRUSH_VARIANT_DEFAULT;
}
function normalizeToolMode(value) {
  return [TOOL_DRAW, TOOL_SELECT, TOOL_EDIT_MD, TOOL_TEXT].includes(value) ? value : TOOL_DRAW;
}
function normalizeTextPreset(value) {
  const preset = String(value || "plain");
  const migrated = {
    title: "plain",
    code: "plain",
    file: "plain",
    button: "plain",
    buttonPrimary: "plain",
    buttonOutline: "rectangle",
    buttonPill: "circle",
    arrowUp: "arrow",
    arrowDown: "arrow",
    arrowLeft: "arrow",
    arrowRight: "arrow"
  }[preset] || preset;
  return [
    "plain", "rectangle", "circle", "arrow", "image", "video", "attachment",
    "markdown", "html", "note", "mindMap"
  ].includes(migrated) ? migrated : "plain";
}
function normalizeConnector(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const fromId = typeof value.fromId === "string" ? value.fromId : "";
  const toId = typeof value.toId === "string" ? value.toId : "";
  const isFreeConnector = value.kind === "connector";
  if (!isFreeConnector && (!fromId || !toId || fromId === toId)) {
    return null;
  }
  return {
    kind: "connector",
    fromId,
    toId,
    style: value.style === "mindmap" ? "mindmap" : "curve",
    arrow: value.arrow !== false
  };
}
function normalizeNoteFlow(value) {
  if (!value?.enabled) {
    return null;
  }
  const line = value.line === null || value.line === void 0 || value.line === "" ? NaN : Number(value.line);
  const positionLine = value.positionLine === null || value.positionLine === void 0 || value.positionLine === "" ? NaN : Number(value.positionLine);
  const avoidanceLine = value.avoidanceLine === null || value.avoidanceLine === void 0 || value.avoidanceLine === "" ? NaN : Number(value.avoidanceLine);
  const positionBasis = value.positionBasis === "document"
    ? "document"
    : value.positionBasis === "above" && Number.isFinite(positionLine) && positionLine >= 0 ? "above" : null;
  const placementMode = value.placementMode === "inline" ? "inline" : "row";
  const hasStoredPlacement = Number.isFinite(line)
    && line >= 0
    && ["before", "after"].includes(value.side)
    && Number(value.positionVersion) >= 1;
  return {
    enabled: true,
    path: normalizeVaultPath(value.path || ""),
    line: Number.isFinite(line) && line >= 0 ? line : null,
    side: ["before", "after"].includes(value.side) ? value.side : null,
    positionBasis,
    positionPath: normalizeVaultPath(value.positionPath || value.path || ""),
    positionLine: positionBasis === "above" ? positionLine : null,
    positionVersion: Number(value.positionVersion) >= 1 ? 1 : 0,
    placementVersion: Number(value.placementVersion) >= 1 || hasStoredPlacement ? 1 : 0,
    placementMode,
    inlineSide: placementMode === "inline" && value.inlineSide === "right" ? "right" : null,
    leftSnap: placementMode === "row" && value.leftSnap === true,
    rowOffset: clamp(Number(value.rowOffset) || 0, 0, 200_000),
    boxLeftRatio: clamp(Number(value.boxLeftRatio) || 0, -2, 3),
    boxWidthRatio: clamp(Number(value.boxWidthRatio) || 0, 0, 5),
    boxHeightRatio: clamp(Number(value.boxHeightRatio) || 0, 0, 5),
    avoidancePath: Number.isFinite(avoidanceLine) && avoidanceLine >= 0 ? normalizeVaultPath(value.avoidancePath || value.path || "") : "",
    avoidanceLine: Number.isFinite(avoidanceLine) && avoidanceLine >= 0 ? avoidanceLine : null,
    gap: clamp(Number(value.gap) || 12, 4, 64)
  };
}
function normalizeMindMapNode(value) {
  if (!value || typeof value.mapId !== "string" || typeof value.nodeId !== "string") {
    return null;
  }
  const sourceLine = Number(value.sourceLine);
  const sourceEndLine = Number(value.sourceEndLine);
  const type = ["root", "heading", "paragraph", "list", "task", "quote", "table", "code"].includes(value.type) ? value.type : value.role === "root" ? "root" : value.role === "heading" ? "heading" : "paragraph";
  return {
    mapId: value.mapId,
    nodeId: value.nodeId,
    parentId: typeof value.parentId === "string" ? value.parentId : "",
    depth: Math.max(0, Math.round(Number(value.depth) || 0)),
    role: value.role === "root" ? "root" : value.role === "heading" ? "heading" : "node",
    type,
    sourcePath: normalizeVaultPath(value.sourcePath || ""),
    sourceLine: Number.isFinite(sourceLine) && sourceLine >= 0 ? Math.round(sourceLine) : -1,
    sourceEndLine: Number.isFinite(sourceEndLine) && sourceEndLine >= 0 ? Math.round(sourceEndLine) : Number.isFinite(sourceLine) && sourceLine >= 0 ? Math.round(sourceLine) : -1,
    sourceText: typeof value.sourceText === "string" ? value.sourceText : "",
    affectsSource: value.affectsSource !== false
  };
}
function normalizeTextRenderMode(mode) {
  if ([TEXT_RENDER_MARKDOWN, TEXT_RENDER_HTML, TEXT_RENDER_NOTE].includes(mode)) {
    return mode;
  }
  return TEXT_RENDER_PLAIN;
}
function normalizeEmbedType(type) {
  if ([EMBED_IMAGE, EMBED_VIDEO, EMBED_FILE].includes(type)) {
    return type;
  }
  return EMBED_FILE;
}
function isAssetTextPreset(preset) {
  return ["image", "video", "attachment"].includes(preset);
}
function filePickerAcceptForPreset(preset) {
  if (preset === "image") {
    return "image/*";
  }
  if (preset === "video") {
    return "video/*";
  }
  return "image/*,video/*,.pdf,.md,.markdown,.txt,.csv,.json,.html,.htm";
}
function classifyImportedAsset(asset) {
  const mime = String(asset?.mime || "").toLowerCase();
  const name = String(asset?.name || "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) {
    return EMBED_IMAGE;
  }
  if (mime.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv)$/.test(name)) {
    return EMBED_VIDEO;
  }
  return EMBED_FILE;
}
function classifyImportedPreviewRender(asset) {
  const mime = String(asset?.mime || "").toLowerCase();
  const name = String(asset?.name || "").toLowerCase();
  if (mime === "text/markdown" || /\.(md|markdown)$/.test(name)) {
    return TEXT_RENDER_MARKDOWN;
  }
  if (mime === "text/html" || /\.(html|htm)$/.test(name)) {
    return TEXT_RENDER_HTML;
  }
  return null;
}
function isTextAssetMime(name, mime) {
  const lowerName = String(name || "").toLowerCase();
  const lowerMime = String(mime || "").toLowerCase();
  return lowerMime.startsWith("text/") || lowerMime === "application/json" || /\.(md|markdown|txt|csv|json|html|htm)$/.test(lowerName);
}
function guessMimeType(name) {
  const lower = String(name || "").toLowerCase();
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/.test(lower)) {
    return lower.endsWith(".svg") ? "image/svg+xml" : "image/*";
  }
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(lower)) {
    return "video/*";
  }
  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "text/markdown";
  }
  if (/\.(html|htm)$/.test(lower)) {
    return "text/html";
  }
  if (/\.(txt|csv)$/.test(lower)) {
    return "text/plain";
  }
  if (lower.endsWith(".json")) {
    return "application/json";
  }
  return "application/octet-stream";
}
function formatBytes(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "Attachment";
  }
  if (size < 1024) {
    return `${Math.round(size)} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
function unwrapWikiLink(value) {
  const text = String(value || "").trim();
  const wiki = text.match(/^\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]$/);
  if (wiki) {
    return wiki[1].trim();
  }
  return text.replace(/^!?\[\[/, "").replace(/\]\]$/, "").trim();
}
function getEmbedRenderToken(stroke) {
  return [
    stroke.kind,
    stroke.embedType,
    normalizeTextRenderMode(stroke.render),
    stroke.text || "",
    stroke.assetPath || "",
    stroke.assetName || "",
    stroke.assetSize || 0,
    stroke.exportImageDataUrl ? String(stroke.exportImageDataUrl).length : 0
  ].join("|");
}
function sanitizeHTMLToDomSafe(content) {
  const parsed = new DOMParser().parseFromString(String(content || ""), "text/html");
  const fragment = activeDocument.createDocumentFragment();
  Array.from(parsed.body.childNodes).forEach((node) => {
    fragment.appendChild(activeDocument.importNode(node, true));
  });
  fragment.querySelectorAll("script, iframe, object, embed, link[rel='import']").forEach((node) => node.remove());
  fragment.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes || [])) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value || "";
      if (name.startsWith("on") || /^\s*javascript:/i.test(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  return fragment;
}
function portableTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}
function normalizePortableBundle(value, file) {
  if (!value || typeof value !== "object" || !value.drawing || typeof value.drawing !== "object") {
    return null;
  }
  return {
    format: "notedraw-portable",
    version: Math.max(1, Number(value.version) || 1),
    purpose: value.purpose === "share" ? "share" : "storage",
    sourcePath: normalizeVaultPath(value.sourcePath || file?.path || ""),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : value.drawing?.updatedAt || null,
    drawing: normalizeDrawingData(value.drawing, file),
    resources: normalizePortableResources(value.resources),
    skippedResources: Array.isArray(value.skippedResources) ? value.skippedResources.map(String).filter(Boolean) : []
  };
}
function normalizePortableResources(value) {
  return Array.isArray(value) ? value.map(normalizePortableResource).filter(Boolean) : [];
}
function normalizePortableResource(value) {
  const dataBase64 = typeof value?.dataBase64 === "string" ? value.dataBase64.replace(/\s+/g, "") : "";
  if (!dataBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)) {
    return null;
  }
  const source = typeof value?.source === "string" ? value.source : "";
  const resolvedPath = typeof value?.resolvedPath === "string" ? value.resolvedPath : "";
  const name = sanitizeAssetFileName(value?.name || portableUrlName(resolvedPath || source) || "attachment.bin");
  const aliases = Array.from(new Set([
    source,
    resolvedPath,
    name,
    ...Array.from(Array.isArray(value?.aliases) ? value.aliases : [])
  ].map((item) => String(item || "").trim()).filter(Boolean)));
  return {
    id: typeof value?.id === "string" && value.id ? value.id : portableResourceId(resolvedPath || source || name),
    source,
    resolvedPath,
    aliases,
    name,
    mime: String(value?.mime || portableMimeType(name) || "application/octet-stream").split(";")[0].trim().toLowerCase(),
    size: Number.isFinite(Number(value?.size)) ? Math.max(0, Number(value.size)) : Math.floor(dataBase64.length * 0.75),
    dataBase64
  };
}
function findPortableResource(resources, reference, aliases = []) {
  const targets = portableReferenceKeys([reference, ...aliases]);
  if (!targets.exact.size && !targets.basename.size) {
    return null;
  }
  let basenameMatch = null;
  for (const resource of normalizePortableResources(resources)) {
    const keys = portableReferenceKeys([resource.source, resource.resolvedPath, resource.name, ...resource.aliases]);
    if (Array.from(targets.exact).some((key) => keys.exact.has(key))) {
      return resource;
    }
    if (!basenameMatch && Array.from(targets.basename).some((key) => keys.basename.has(key))) {
      basenameMatch = resource;
    }
  }
  return basenameMatch;
}
function portableReferenceKeys(values) {
  const exact = /* @__PURE__ */ new Set();
  const basename = /* @__PURE__ */ new Set();
  for (const value of values.flatMap((item) => Array.isArray(item) ? item : [item])) {
    let text = String(value || "").trim();
    if (!text) {
      continue;
    }
    try {
      text = decodeURIComponent(text);
    } catch {
    }
    text = unwrapWikiLink(text.replace(/^!/, "")).split("|")[0].trim();
    const withoutFragment = text.replace(/[?#].*$/, "").replace(/\\/g, "/").replace(/^\/+/, "");
    for (const candidate of [text, withoutFragment]) {
      if (candidate) {
        exact.add(candidate.toLowerCase());
      }
    }
    let name = withoutFragment.split("/").pop() || "";
    if (/^[a-z]+:\/\//i.test(text)) {
      try {
        name = decodeURIComponent(new URL(text).pathname.split("/").pop() || name);
      } catch {
      }
    }
    if (name) {
      basename.add(name.toLowerCase());
    }
  }
  return { exact, basename };
}
function portableResourceIdentity(resource) {
  return String(resource?.resolvedPath || resource?.source || resource?.id || "");
}
function portableResourceId(value) {
  return `${PORTABLE_RESOURCE_PREFIX}-${hashString(String(value || "resource"))}`;
}
function portableResourceDataUrl(resource) {
  const normalized = normalizePortableResource(resource);
  return normalized ? `data:${normalized.mime || "application/octet-stream"};base64,${normalized.dataBase64}` : "";
}
function portableResourceText(resource) {
  const normalized = normalizePortableResource(resource);
  if (!normalized) {
    return "";
  }
  const binary = atob(normalized.dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}
function portableMimeType(name) {
  const lower = String(name || "").split(/[?#]/)[0].toLowerCase();
  const types = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".pdf": "application/pdf",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
    ".html": "text/html",
    ".htm": "text/html",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  };
  const extension = Object.keys(types).find((candidate) => lower.endsWith(candidate));
  return extension ? types[extension] : "application/octet-stream";
}
function portableResponseMime(headers) {
  if (!headers) {
    return "";
  }
  if (typeof headers.get === "function") {
    return String(headers.get("content-type") || "").split(";")[0].trim();
  }
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type");
  return String(entry?.[1] || "").split(";")[0].trim();
}
function portableUrlName(value) {
  try {
    const url = new URL(String(value || ""));
    return decodeURIComponent(url.pathname.split("/").pop() || url.hostname || "resource.bin");
  } catch {
    return String(value || "").replace(/\\/g, "/").split("/").pop() || "resource.bin";
  }
}
function extractPortableMarkdownLinks(markdown) {
  const source = stripNotedrawDataBlocks(markdown);
  const links = [];
  for (const match of source.matchAll(/!?\[\[([^\]]+)\]\]/g)) {
    links.push(match[1]);
  }
  for (const match of source.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))/g)) {
    links.push(match[1] || match[2]);
  }
  for (const match of source.matchAll(/<((?:https?):\/\/[^>]+)>/gi)) {
    links.push(match[1]);
  }
  return Array.from(new Set(links.map((link) => String(link || "").trim()).filter(Boolean)));
}
function extractPortableHtmlLinks(html) {
  const links = [];
  for (const match of String(html || "").matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    links.push(match[1] || match[2] || match[3]);
  }
  return Array.from(new Set(links.map((link) => String(link || "").trim()).filter(Boolean)));
}
function portableElementReferences(element) {
  const values = [
    element.getAttribute?.("src"),
    element.getAttribute?.("href"),
    element.getAttribute?.("data-src"),
    element.getAttribute?.("data-href"),
    element.getAttribute?.("data-path"),
    element.getAttribute?.("alt"),
    element.dataset?.href,
    element.dataset?.src,
    element.dataset?.path
  ];
  const text = String(element.textContent || "").trim();
  if (text && text.length <= 240) {
    values.push(text);
  }
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}
function createEmptyDrawingData(file) {
  return {
    version: 3,
    sourcePath: file.path,
    visible: true,
    strokes: [],
    markdownBlocks: [],
    elementGroups: [],
    noteFlowLayout: normalizeFrozenNoteFlowLayout(null),
    webEdits: [],
    updatedAt: null
  };
}
function createDrawingDataFile(path) {
  const normalized = normalizeVaultPath(path) || "NoteDraw.md";
  const name = normalized.split("/").pop() || "NoteDraw.md";
  const dot = name.lastIndexOf(".");
  return {
    path: normalized,
    name,
    basename: dot > 0 ? name.slice(0, dot) : name,
    extension: dot > 0 ? name.slice(dot + 1) : "md"
  };
}
function clonePortableValue(value) {
  return JSON.parse(JSON.stringify(value));
}
function waitForNextFrame() {
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(resolve);
    } else {
      window.setTimeout(resolve, 16);
    }
  });
}
function parseNoteDrawElementLink(rawLink) {
  const raw = String(rawLink || "").trim();
  if (!raw.toLowerCase().startsWith("notedraw://element")) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "notedraw:" || url.hostname.toLowerCase() !== "element") {
      return null;
    }
    const file = normalizeVaultPath(url.searchParams.get("file") || "");
    const ids = Array.from(new Set(
      [
        ...url.searchParams.getAll("id"),
        ...url.searchParams.getAll("ids").flatMap((value) => value.split(","))
      ].map((id) => String(id || "").trim()).filter(Boolean)
    ));
    return file && ids.length ? { file, ids } : null;
  } catch {
    return null;
  }
}
async function writeTextToClipboard(text) {
  const value = String(text ?? "");
  try {
    if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
  }
  const textarea = activeDocument.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  activeDocument.body?.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = Boolean(activeDocument.execCommand?.("copy"));
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}
function normalizeDrawingData(data, file) {
  const strokes = Array.isArray(data?.strokes) ? data.strokes : [];
  return {
    version: Math.max(1, Number.isFinite(data?.version) ? data.version : 1),
    sourcePath: file.path,
    visible: data?.visible !== false,
    strokes: strokes.map(normalizeStroke).map((stroke) => ({
      ...stroke,
      points: compactStrokePoints(stroke.points)
    })).filter((stroke) => stroke.points.length),
    markdownBlocks: normalizeMarkdownBlocks(data?.markdownBlocks, file),
    elementGroups: normalizeElementGroups(data?.elementGroups),
    noteFlowLayout: normalizeFrozenNoteFlowLayout(data?.noteFlowLayout),
    webEdits: normalizeWebEdits(data?.webEdits),
    updatedAt: data?.updatedAt || null
  };
}
function normalizeMarkdownBlocks(value, file) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = /* @__PURE__ */ new Set();
  return value.map((block, index) => {
    const path = normalizeVaultPath(block?.path || file?.path || "");
    const textHint = normalizeRenderedText(block?.textHint || "").slice(0, 240);
    const lineStart = Number.isFinite(Number(block?.lineStart)) ? Math.max(0, Math.round(Number(block.lineStart))) : null;
    const id = typeof block?.id === "string" && block.id
      ? block.id
      : `md-${hashString(`${path}:${lineStart ?? "x"}:${textHint}:${index}`)}`;
    const floatBox = normalizeMarkdownFloatBox(block?.floatBox);
    return {
      id,
      path,
      lineStart,
      lineEnd: Number.isFinite(Number(block?.lineEnd)) ? Math.max(lineStart ?? 0, Math.round(Number(block.lineEnd))) : lineStart,
      textHint,
      span: clamp(Math.round(Number(block?.span) || 12), 2, 12),
      widthScale: normalizeMarkdownBlockWidthScale(block?.widthScale),
      minHeight: normalizeMarkdownBlockMinHeight(block?.minHeight),
      borderColor: isCssColor(block?.borderColor) ? block.borderColor : "",
      backgroundColor: isCssColor(block?.backgroundColor) ? block.backgroundColor : "",
      floating: Boolean(block?.floating && floatBox),
      floatingExplicit: Boolean(block?.floatingExplicit),
      floatBox,
      locked: Boolean(block?.locked),
      groupId: typeof block?.groupId === "string" ? block.groupId : ""
    };
  }).filter((block) => block.path && block.id && !seen.has(block.id) && seen.add(block.id));
}
function normalizeMarkdownBlockWidthScale(value) {
  const widthScale = Number(value);
  return Number.isFinite(widthScale) ? clamp(widthScale, 0.2, 1) : 1;
}
function collectDeletedVaultFiles(file, output = []) {
  if (!file?.path) {
    return output;
  }
  if (Array.isArray(file.children)) {
    for (const child of file.children) {
      collectDeletedVaultFiles(child, output);
    }
    return output;
  }
  output.push(file);
  return output;
}
function normalizeElementGroups(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = /* @__PURE__ */ new Set();
  return value.map((group) => ({
    id: typeof group?.id === "string" ? group.id : "",
    boxed: Boolean(group?.boxed),
    locked: group?.locked !== false,
    borderColor: isCssColor(group?.borderColor) ? group.borderColor : "#64748b",
    backgroundColor: isCssColor(group?.backgroundColor) ? group.backgroundColor : ""
  })).filter((group) => group.id && !seen.has(group.id) && seen.add(group.id));
}
function normalizeDrawingDataForStorage(data, file) {
  const normalized = normalizeDrawingData(data, file);
  normalized.strokes = normalized.strokes.map((stroke) => {
    const layout = normalizeElementLayout(stroke.layout);
    if (!layout || elementLayoutNeedsRepair(layout) || !stroke.points.some((point) => point.anchor)) {
      return stroke;
    }
    return {
      ...stroke,
      points: projectElementPoints(stroke.points, layout, {
        id: layout.id,
        x: layout.box.x,
        y: layout.box.y,
        width: layout.box.width,
        height: layout.box.height,
        scale: 1
      }, {
        canvasWidth: layout.sourceFrame.surfaceWidth,
        canvasHeight: layout.sourceFrame.documentHeight
      })
    };
  });
  return normalized;
}
function cloneDrawingData(data, file) {
  return JSON.parse(JSON.stringify(normalizeDrawingDataForStorage(data, file)));
}
function normalizeWebEdits(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((edit) => ({
    kind: edit?.kind === "text" ? "text" : "",
    path: typeof edit?.path === "string" ? edit.path : "",
    originalText: typeof edit?.originalText === "string" ? edit.originalText : "",
    editedText: typeof edit?.editedText === "string" ? edit.editedText : "",
    updatedAt: typeof edit?.updatedAt === "string" ? edit.updatedAt : null
  })).filter((edit) => edit.kind === "text" && edit.path && normalizeRenderedText(edit.editedText));
}
function normalizeStroke(stroke) {
  const points = Array.isArray(stroke?.points) ? stroke.points : [];
  const kind = normalizeStrokeKind(stroke?.kind);
  const brush = stroke?.brush === BRUSH_WATERCOLOR ? BRUSH_WATERCOLOR : BRUSH_PEN;
  const layout = normalizeElementLayout(stroke?.layout);
  const connector = normalizeConnector(stroke?.connector);
  const noteFlow = normalizeNoteFlow(stroke?.noteFlow)
    || (!connector && stroke?.belowMarkdown ? normalizeNoteFlow({ enabled: true, placementMode: "row" }) : null);
  return {
    elementId: typeof stroke?.elementId === "string" && stroke.elementId ? stroke.elementId : layout?.id || "",
    kind,
    embedType: normalizeEmbedType(stroke?.embedType),
    brush,
    variant: normalizeBrushVariant(brush, stroke?.variant),
    color: typeof stroke?.color === "string" ? stroke.color : "#e53935",
    width: Number.isFinite(Number(stroke?.width)) ? clamp(Number(stroke.width), MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH) : 3,
    opacity: clamp(Number(stroke?.opacity ?? DEFAULT_PEN_OPACITY), 0, 1),
    count: clamp(Math.round(Number(stroke?.count) || 1), 1, MAX_PEN_COUNT),
    text: typeof stroke?.text === "string" ? stroke.text : "",
    render: normalizeTextRenderMode(stroke?.render),
    assetPath: normalizeVaultPath(stroke?.assetPath || ""),
    assetName: typeof stroke?.assetName === "string" ? stroke.assetName : "",
    assetMime: typeof stroke?.assetMime === "string" ? stroke.assetMime : "",
    assetSize: Number.isFinite(Number(stroke?.assetSize)) ? Math.max(0, Number(stroke.assetSize)) : 0,
    exportImageDataUrl: normalizeImageDataUrl(stroke?.exportImageDataUrl),
    previewWidth: Number.isFinite(Number(stroke?.previewWidth)) ? clamp(Number(stroke.previewWidth), 80, 900) : 260,
    previewHeight: Number.isFinite(Number(stroke?.previewHeight)) ? clamp(Number(stroke.previewHeight), 40, 700) : 160,
    textWidth: Number.isFinite(Number(stroke?.textWidth)) && Number(stroke.textWidth) > 0 ? clamp(Number(stroke.textWidth), 24, 900) : null,
    fontSize: Number.isFinite(Number(stroke?.fontSize)) ? clamp(Number(stroke.fontSize), 10, 72) : 18,
    bold: Boolean(stroke?.bold),
    code: Boolean(stroke?.code),
    boxed: Boolean(stroke?.boxed),
    file: Boolean(stroke?.file),
    uiRole: normalizeUiRole(stroke?.uiRole),
    buttonStyle: normalizeButtonStyle(stroke?.buttonStyle),
    snap: Boolean(stroke?.snap),
    locked: Boolean(stroke?.locked),
    groupId: typeof stroke?.groupId === "string" ? stroke.groupId : "",
    belowMarkdown: Boolean(noteFlow),
    connector,
    noteFlow,
    mindMapNode: normalizeMindMapNode(stroke?.mindMapNode),
    layout,
    points: points.map((point) => ({
      x: clamp(Number(point?.x), 0, 1),
      y: clamp(Number(point?.y), 0, 1),
      t: Number.isFinite(Number(point?.t)) ? Number(point.t) : Date.now(),
      anchor: normalizeResponsiveAnchor(point?.anchor)
    })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  };
}
function isTextStroke(stroke) {
  return stroke?.kind === TOOL_TEXT && normalizeTextRenderMode(stroke.render) === TEXT_RENDER_PLAIN && typeof stroke.text === "string" && stroke.text.trim().length > 0;
}
function isRichTextStroke(stroke) {
  return stroke?.kind === TOOL_TEXT && normalizeTextRenderMode(stroke.render) !== TEXT_RENDER_PLAIN && typeof stroke.text === "string" && stroke.text.trim().length > 0;
}
function isTextLikeStroke(stroke) {
  return (isTextStroke(stroke) || isRichTextStroke(stroke)) && typeof stroke.text === "string" && stroke.text.trim().length > 0;
}
function isEmbedStroke(stroke) {
  return stroke?.kind === TOOL_EMBED && Boolean(stroke.assetPath || stroke.text || stroke.assetName);
}
function isImageEmbedStroke(stroke) {
  return stroke?.kind === TOOL_EMBED && normalizeEmbedType(stroke.embedType) === EMBED_IMAGE && Boolean(stroke.assetPath || stroke.exportImageDataUrl);
}
function strokeElementId(stroke) {
  return typeof stroke?.elementId === "string" && stroke.elementId ? stroke.elementId : normalizeElementLayout(stroke?.layout)?.id || "";
}
function isConnectorStroke(stroke) {
  return Boolean(normalizeConnector(stroke?.connector));
}
function isButtonLikeStroke(stroke) {
  return stroke?.uiRole === "button" || Boolean(normalizeButtonStyle(stroke?.buttonStyle));
}
function isSnapStroke(stroke) {
  return Boolean(stroke?.snap) || stroke?.uiRole === "button" || stroke?.uiRole === "arrow" || isConnectorStroke(stroke);
}
function isSnapPreset(preset) {
  return ["button", "rectangle", "circle", "arrow", "buttonPrimary", "buttonOutline", "buttonPill", "arrowUp", "arrowDown", "arrowLeft", "arrowRight"].includes(preset);
}
function instantTextForPreset(preset) {
  return {
    arrowUp: "\u2191",
    arrowDown: "\u2193",
    arrowLeft: "\u2190",
    arrowRight: "\u2192"
  }[preset] || "";
}
function normalizeUiRole(value) {
  return ["button", "arrow"].includes(value) ? value : "";
}
function normalizeButtonStyle(value) {
  return ["solid", "outline", "pill", "circle"].includes(value) ? value : "";
}
function createTextPreset(preset, text, color) {
  const normalized = String(text || "").trim();
  if (preset === "title") {
    return { kind: TOOL_TEXT, text: normalized, render: TEXT_RENDER_PLAIN, color, fontSize: 26, bold: true, code: false, boxed: false, file: false };
  }
  if (preset === "code") {
    return { kind: TOOL_TEXT, text: normalized, render: TEXT_RENDER_PLAIN, color: "#374151", fontSize: 16, bold: false, code: true, boxed: true, file: false };
  }
  if (preset === "button") {
    return { kind: TOOL_TEXT, text: normalized, render: TEXT_RENDER_PLAIN, color, fontSize: 17, bold: true, code: false, boxed: true, file: false, uiRole: "button", buttonStyle: "", snap: true };
  }
  if (preset === "buttonPrimary") {
    return { kind: TOOL_TEXT, text: normalized, render: TEXT_RENDER_PLAIN, color: "#2563eb", fontSize: 17, bold: true, code: false, boxed: true, file: false, uiRole: "button", buttonStyle: "solid", snap: true };
  }
  if (["rectangle", "buttonOutline"].includes(preset)) {
    return { kind: TOOL_TEXT, text: normalized, render: TEXT_RENDER_PLAIN, color: "#2563eb", fontSize: 17, bold: true, code: false, boxed: true, file: false, uiRole: "button", buttonStyle: "outline", snap: true };
  }
  if (["circle", "buttonPill"].includes(preset)) {
    return { kind: TOOL_TEXT, text: normalized, render: TEXT_RENDER_PLAIN, color: "#7c3aed", fontSize: 17, bold: true, code: false, boxed: true, file: false, uiRole: "button", buttonStyle: preset === "circle" ? "solid" : "pill", snap: true };
  }
  if (["arrowUp", "arrowDown", "arrowLeft", "arrowRight"].includes(preset)) {
    return { kind: TOOL_TEXT, text: normalized, render: TEXT_RENDER_PLAIN, color: "#111827", fontSize: 28, bold: true, code: false, boxed: false, file: false, uiRole: "arrow", buttonStyle: "", snap: true };
  }
  if (preset === "file") {
    return { kind: TOOL_TEXT, text: normalized.startsWith("@") ? normalized : `@${normalized}`, render: TEXT_RENDER_PLAIN, color, fontSize: 17, bold: false, code: false, boxed: true, file: true };
  }
  if (preset === "markdown") {
    return { kind: TOOL_TEXT, text: normalized, render: TEXT_RENDER_MARKDOWN, color: "#1f2937", fontSize: 16, bold: false, code: false, boxed: true, file: false, previewWidth: 300, previewHeight: 180 };
  }
  if (preset === "html") {
    return { kind: TOOL_TEXT, text: normalized, render: TEXT_RENDER_HTML, color: "#1f2937", fontSize: 16, bold: false, code: true, boxed: true, file: false, previewWidth: 300, previewHeight: 180 };
  }
  if (preset === "note") {
    return { kind: TOOL_TEXT, text: normalized, render: TEXT_RENDER_NOTE, color: "#1f2937", fontSize: 16, bold: false, code: false, boxed: true, file: true, previewWidth: 320, previewHeight: 220 };
  }
  return { kind: TOOL_TEXT, text: normalized, render: TEXT_RENDER_PLAIN, color, fontSize: 18, bold: false, code: false, boxed: false, file: false };
}
function compactDrawingData(data, compactDistance = DEFAULT_SETTINGS.drawingCompactDistance) {
  if (!Array.isArray(data?.strokes)) {
    return data;
  }
  data.strokes = data.strokes.map((stroke) => ({
    ...stroke,
    points: compactStrokePoints(stroke.points, compactDistance)
  }));
  return data;
}
function compactStrokePoints(points, compactDistance = DEFAULT_SETTINGS.drawingCompactDistance) {
  if (!Array.isArray(points) || points.length <= 2) {
    return points || [];
  }
  const compacted = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const last = compacted[compacted.length - 1];
    const distance = pointDistanceOnCanvas(last, point, 1, 1) * 1e3;
    if (distance >= compactDistance) {
      compacted.push(point);
    }
  }
  compacted.push(points[points.length - 1]);
  return compacted;
}
function getSourceInfo(element) {
  const lineStart = parseInteger(element.dataset.noteDrawLineStart);
  const lineEnd = parseInteger(element.dataset.noteDrawLineEnd);
  const dataLine = parseInteger(element.dataset.noteDrawDataLine) ?? parseDataLine(element.closest("[data-line]")?.getAttribute("data-line"));
  const dataLineScope = element.dataset.noteDrawDataLineScope || (Number.isFinite(parseDataLine(element.getAttribute("data-line"))) ? "self" : "ancestor");
  const exactDataLine = dataLineScope === "self" ? dataLine : null;
  const resolvedStart = exactDataLine ?? lineStart ?? null;
  const resolvedEnd = exactDataLine ?? lineEnd ?? resolvedStart;
  return {
    lineStart: resolvedStart,
    lineEnd: resolvedEnd,
    dataLine,
    dataLineScope,
    sourceText: typeof element._noteDrawSourceText === "string" ? element._noteDrawSourceText : null
  };
}
function resolveSourceEditTarget(source, sourceInfo, originalText) {
  const normalizedOriginal = normalizeRenderedText(originalText);
  if (!normalizedOriginal) {
    return null;
  }
  const blocks = collectMarkdownBlocks(source);
  const sourceLine = sourceInfo?.lineStart ?? (sourceInfo?.dataLineScope === "self" ? sourceInfo?.dataLine : null);
  let match = pickFromSectionText(source, sourceInfo, normalizedOriginal) || collectSourceLineBlock(source, sourceInfo, normalizedOriginal) || pickLineInSourceRange(source, sourceInfo, normalizedOriginal) || pickBlockInSourceRange(blocks, sourceInfo, normalizedOriginal) || pickBlockBySourceInfo(blocks, sourceInfo, normalizedOriginal);
  if (!match) {
    const candidates = blocks.filter((block) => normalizeMarkdownBlock(block.text) === normalizedOriginal);
    match = pickNearestBlock(candidates, sourceLine);
  }
  if (!match) {
    const partialCandidates = blocks.filter((block) => {
      const normalized = normalizeMarkdownBlock(block.text);
      return isReasonablePartialMatch(block, normalized, normalizedOriginal);
    });
    match = pickNearestBlock(partialCandidates, sourceLine);
  }
  if (!match) {
    match = pickNearestPlainLine(source, normalizedOriginal, sourceLine);
  }
  return match ? createTextEditTarget(match, sourceInfo, originalText) : null;
}
function resolveSourceDropTarget(source, sourceInfo, originalText, sourceIndex = null) {
  const stableTarget = resolveRenderedMarkdownSourceTarget(source, originalText, sourceInfo, sourceIndex);
  return stableTarget ? createTextEditTarget(stableTarget, sourceInfo, originalText) : null;
}
function resolveLockedTarget(source, target, baselineText) {
  if (!target) {
    return null;
  }
  const normalizedBaseline = normalizeRenderedText(baselineText);
  const start = Number(target.start);
  const end = Number(target.end);
  if (isValidSourceRange(source, start, end)) {
    const currentText = source.slice(start, end);
    const normalizedCurrent = normalizeMarkdownBlock(currentText);
    if (currentText === target.text || normalizedCurrent === normalizedBaseline || normalizedCurrent === target.normalizedText) {
      return {
        ...target,
        text: currentText
      };
    }
  }
  const exactIndex = findNearestTextIndex(source, target.text, target.start);
  if (exactIndex >= 0) {
    return {
      ...target,
      start: exactIndex,
      end: exactIndex + target.text.length,
      text: target.text
    };
  }
  return null;
}
function createTextEditTarget(match, sourceInfo, renderedText) {
  if (!match || !Number.isFinite(match.start) || !Number.isFinite(match.end)) {
    return null;
  }
  const text = String(match.text ?? "");
  return {
    start: match.start,
    end: match.end,
    line: Number.isFinite(match.line) ? match.line : null,
    endLine: Number.isFinite(match.endLine) ? match.endLine : match.line ?? null,
    text,
    normalizedText: normalizeRenderedText(renderedText),
    normalizedMarkdown: normalizeMarkdownBlock(text),
    sourceInfo: {
      lineStart: sourceInfo?.lineStart ?? null,
      lineEnd: sourceInfo?.lineEnd ?? null,
      dataLine: sourceInfo?.dataLine ?? null
    }
  };
}
function pickFromSectionText(source, sourceInfo, normalizedOriginal) {
  const sectionText = typeof sourceInfo?.sourceText === "string" ? sourceInfo.sourceText : "";
  if (!sectionText.trim()) {
    return null;
  }
  const section = locateSectionRange(source, sourceInfo, sectionText);
  if (!section) {
    return null;
  }
  const lineMatch = pickNearestPlainLine(section.text, normalizedOriginal, null);
  if (lineMatch) {
    return shiftMatch(lineMatch, section.start);
  }
  const blocks = collectMarkdownBlocks(section.text);
  let match = blocks.find((block) => normalizeMarkdownBlock(block.text) === normalizedOriginal);
  if (!match) {
    match = blocks.find((block) => {
      const normalized = normalizeMarkdownBlock(block.text);
      return isReasonablePartialMatch(block, normalized, normalizedOriginal);
    });
  }
  if (match) {
    return shiftMatch(match, section.start);
  }
  const normalizedSection = normalizeMarkdownBlock(section.text);
  const sectionLines = section.text.split(/\r?\n/).filter((line) => line.trim()).length;
  if (sectionLines <= 3 && isReasonableLineMatch(normalizedSection, normalizedOriginal)) {
    return {
      start: section.start,
      end: section.end,
      line: sourceInfo?.lineStart ?? null,
      endLine: sourceInfo?.lineEnd ?? sourceInfo?.lineStart ?? null,
      text: section.text
    };
  }
  return null;
}
function locateSectionRange(source, sourceInfo, sectionText) {
  const byLines = collectSourceLineRange(source, sourceInfo?.lineStart, sourceInfo?.lineEnd);
  if (byLines && (normalizeMarkdownBlock(byLines.text) === normalizeMarkdownBlock(sectionText) || normalizeMarkdownBlock(byLines.text).includes(normalizeMarkdownBlock(sectionText)) || normalizeMarkdownBlock(sectionText).includes(normalizeMarkdownBlock(byLines.text)))) {
    return byLines;
  }
  const preferredStart = getLineStartOffset(source, sourceInfo?.lineStart) ?? 0;
  const exactIndex = findNearestTextIndex(source, sectionText, preferredStart);
  if (exactIndex >= 0) {
    return {
      start: exactIndex,
      end: exactIndex + sectionText.length,
      line: sourceInfo?.lineStart ?? null,
      endLine: sourceInfo?.lineEnd ?? sourceInfo?.lineStart ?? null,
      text: source.slice(exactIndex, exactIndex + sectionText.length)
    };
  }
  return byLines;
}
function pickLineInSourceRange(source, sourceInfo, normalizedOriginal) {
  const lineStart = sourceInfo?.lineStart;
  const lineEnd = sourceInfo?.lineEnd ?? lineStart;
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) {
    return null;
  }
  const start = Math.max(0, Math.min(lineStart, lineEnd) - 1);
  const end = Math.max(lineStart, lineEnd) + 1;
  const candidates = collectLineMatches(source, normalizedOriginal).filter((match) => match.line >= start && match.line <= end);
  return pickNearestBlock(candidates, lineStart);
}
function pickNearestPlainLine(source, normalizedOriginal, sourceLine) {
  return pickNearestBlock(collectLineMatches(source, normalizedOriginal), sourceLine);
}
function collectLineMatches(source, normalizedOriginal) {
  const matches = [];
  const lines = source.split(/(\r?\n)/);
  let offset = 0;
  let inFence = false;
  for (let index = 0, currentLine = 0; index < lines.length; index += 2, currentLine += 1) {
    const line = lines[index] || "";
    const newline = lines[index + 1] || "";
    const trimmed = line.trim();
    const start = offset;
    const end = start + line.length;
    offset += line.length + newline.length;
    if (/^```|^~~~/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !trimmed) {
      continue;
    }
    const normalizedLine = normalizeMarkdownBlock(line);
    if (normalizedLine === normalizedOriginal || normalizedLine && normalizedOriginal && normalizedLine.includes(normalizedOriginal) || isReasonableLineMatch(normalizedLine, normalizedOriginal)) {
      matches.push({
        start,
        end,
        line: currentLine,
        endLine: currentLine,
        text: line
      });
    }
  }
  return matches;
}
function collectSourceLineRange(source, lineStart, lineEnd) {
  if (!Number.isFinite(lineStart)) {
    return null;
  }
  const startLine = Math.max(0, Math.min(lineStart, Number.isFinite(lineEnd) ? lineEnd : lineStart));
  const endLine = Math.max(startLine, Number.isFinite(lineEnd) ? Math.max(lineStart, lineEnd) : lineStart);
  const lines = source.split(/(\r?\n)/);
  let offset = 0;
  let start = null;
  let end = null;
  for (let index = 0, currentLine = 0; index < lines.length; index += 2, currentLine += 1) {
    const line = lines[index] || "";
    const newline = lines[index + 1] || "";
    const lineStartOffset = offset;
    const lineEndOffset = lineStartOffset + line.length;
    offset += line.length + newline.length;
    if (currentLine === startLine) {
      start = lineStartOffset;
    }
    if (currentLine === endLine) {
      end = lineEndOffset;
      break;
    }
  }
  if (!Number.isFinite(start)) {
    return null;
  }
  if (!Number.isFinite(end)) {
    end = source.length;
  }
  return {
    start,
    end,
    line: startLine,
    endLine,
    text: source.slice(start, end)
  };
}
function getLineStartOffset(source, wantedLine) {
  if (!Number.isFinite(wantedLine) || wantedLine < 0) {
    return null;
  }
  const lines = source.split(/(\r?\n)/);
  let offset = 0;
  for (let index = 0, currentLine = 0; index < lines.length; index += 2, currentLine += 1) {
    if (currentLine === wantedLine) {
      return offset;
    }
    offset += (lines[index] || "").length + (lines[index + 1] || "").length;
  }
  return null;
}
function shiftMatch(match, offset) {
  return {
    ...match,
    start: match.start + offset,
    end: match.end + offset
  };
}
function pickBlockInSourceRange(blocks, sourceInfo, normalizedOriginal) {
  const lineStart = sourceInfo?.lineStart;
  const lineEnd = sourceInfo?.lineEnd ?? lineStart;
  if (!Number.isFinite(lineStart) || !Number.isFinite(lineEnd)) {
    return null;
  }
  const start = Math.min(lineStart, lineEnd);
  const end = Math.max(lineStart, lineEnd);
  const candidates = blocks.filter((block) => block.line <= end && (block.endLine ?? block.line) >= start);
  const exact = candidates.find((block) => normalizeMarkdownBlock(block.text) === normalizedOriginal);
  if (exact) {
    return exact;
  }
  return candidates.find((block) => {
    const normalized = normalizeMarkdownBlock(block.text);
    return isReasonablePartialMatch(block, normalized, normalizedOriginal);
  }) || null;
}
function pickBlockBySourceInfo(blocks, sourceInfo, normalizedOriginal) {
  const lineStart = sourceInfo?.lineStart ?? (sourceInfo?.dataLineScope === "self" ? sourceInfo?.dataLine : null);
  if (!Number.isFinite(lineStart)) {
    return null;
  }
  const lineMatches = blocks.filter((block) => block.line <= lineStart && lineStart <= (block.endLine ?? block.line));
  const exact = lineMatches.find((block) => normalizeMarkdownBlock(block.text) === normalizedOriginal);
  if (exact) {
    return exact;
  }
  return lineMatches.find((block) => {
    const normalized = normalizeMarkdownBlock(block.text);
    return isReasonablePartialMatch(block, normalized, normalizedOriginal);
  }) || null;
}
function collectSourceLineBlock(source, sourceInfo, normalizedOriginal) {
  const primaryLine = sourceInfo?.dataLineScope === "self" ? sourceInfo?.dataLine : sourceInfo?.lineStart;
  if (!Number.isFinite(primaryLine)) {
    return null;
  }
  const candidateLines = [
    primaryLine,
    primaryLine - 1,
    primaryLine + 1
  ].filter((line, index, list) => Number.isFinite(line) && line >= 0 && list.indexOf(line) === index);
  const lines = source.split(/(\r?\n)/);
  let offset = 0;
  for (let index = 0, currentLine = 0; index < lines.length; index += 2, currentLine += 1) {
    const line = lines[index] || "";
    const newline = lines[index + 1] || "";
    const start = offset;
    const end = start + line.length;
    offset += line.length + newline.length;
    if (!candidateLines.includes(currentLine) || !line.trim()) {
      continue;
    }
    const normalizedLine = normalizeMarkdownBlock(line);
    if (normalizedLine === normalizedOriginal || normalizedLine && normalizedOriginal && normalizedLine.includes(normalizedOriginal) || isReasonableLineMatch(normalizedLine, normalizedOriginal)) {
      return {
        start,
        end,
        line: currentLine,
        endLine: currentLine,
        text: line
      };
    }
    return null;
  }
  return null;
}
function isReasonableLineMatch(normalizedLine, normalizedOriginal) {
  if (!normalizedLine || !normalizedOriginal) {
    return false;
  }
  if (normalizedLine.includes(normalizedOriginal) || normalizedOriginal.includes(normalizedLine)) {
    const longer = Math.max(normalizedLine.length, normalizedOriginal.length);
    const shorter = Math.min(normalizedLine.length, normalizedOriginal.length);
    return longer > 0 && shorter / longer > 0.75;
  }
  return false;
}
function isReasonablePartialMatch(block, normalized, normalizedOriginal) {
  if (!normalized || !normalizedOriginal) {
    return false;
  }
  const isPartial = normalized.includes(normalizedOriginal) || normalizedOriginal.includes(normalized);
  if (!isPartial) {
    return false;
  }
  const lineSpan = (block.endLine ?? block.line) - block.line;
  if (lineSpan <= 0) {
    return true;
  }
  const longer = Math.max(normalized.length, normalizedOriginal.length);
  const shorter = Math.min(normalized.length, normalizedOriginal.length);
  return longer > 0 && shorter / longer > 0.75;
}
function isValidSourceRange(source, start, end) {
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && end <= source.length;
}
function findNearestTextIndex(source, text, preferredStart) {
  const needle = String(text || "");
  if (!needle) {
    return -1;
  }
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let index = source.indexOf(needle);
  while (index >= 0) {
    const distance = Math.abs(index - (Number(preferredStart) || 0));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
    index = source.indexOf(needle, index + Math.max(1, needle.length));
  }
  return bestIndex;
}
function summarizeSourceInfo(sourceInfo) {
  if (!sourceInfo) {
    return null;
  }
  return {
    lineStart: sourceInfo.lineStart ?? null,
    lineEnd: sourceInfo.lineEnd ?? null,
    dataLine: sourceInfo.dataLine ?? null,
    dataLineScope: sourceInfo.dataLineScope ?? null,
    hasSourceText: typeof sourceInfo.sourceText === "string" && sourceInfo.sourceText.length > 0,
    sourceTextLength: typeof sourceInfo.sourceText === "string" ? sourceInfo.sourceText.length : 0,
    sourceTextSample: shortText(sourceInfo.sourceText)
  };
}
function summarizeTarget(target) {
  if (!target) {
    return null;
  }
  return {
    start: Number.isFinite(target.start) ? target.start : null,
    end: Number.isFinite(target.end) ? target.end : null,
    line: Number.isFinite(target.line) ? target.line : null,
    endLine: Number.isFinite(target.endLine) ? target.endLine : null,
    textLength: typeof target.text === "string" ? target.text.length : 0,
    textSample: shortText(target.text)
  };
}
function shortText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 120) {
    return text;
  }
  return `${text.slice(0, 120)}...`;
}
function parseDataLine(value) {
  if (!value) {
    return null;
  }
  const matches = String(value).match(/\d+/g);
  if (!matches?.length) {
    return null;
  }
  return Number.parseInt(matches[0], 10);
}
function parseInteger(value) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}
function pointerDistance(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}
function findResponsiveContentElement(previewEl, surfaceType) {
  if (!previewEl) {
    return null;
  }
  if (surfaceType === "source") {
    return previewEl.querySelector?.(".cm-content") || previewEl.querySelector?.(".cm-sizer") || previewEl;
  }
  return previewEl.querySelector?.(":scope > .markdown-preview-sizer") || previewEl.querySelector?.(".markdown-preview-sizer") || previewEl;
}
function measureResponsiveContentFrame(previewEl, surfaceType, surfaceWidth, canvas, visualScale = 1) {
  const content = findResponsiveContentElement(previewEl, surfaceType);
  const contentRect = content?.getBoundingClientRect?.();
  const surfaceRect = previewEl?.getBoundingClientRect?.() || canvas?.getBoundingClientRect?.();
  const scale = Math.max(0.01, Number(visualScale) || 1);
  if (!contentRect || !surfaceRect || contentRect.width <= 1) {
    return constrainWideContentFrame({
      surfaceWidth,
      contentLeft: 0,
      contentWidth: surfaceWidth
    }, { isMobile: isMobileRuntime() });
  }
  return constrainWideContentFrame({
    surfaceWidth,
    contentLeft: (contentRect.left - surfaceRect.left + (Number(previewEl?.scrollLeft) || 0)) / scale,
    contentWidth: contentRect.width / scale
  }, { isMobile: isMobileRuntime() });
}
function measureResponsiveViewportHeight(previewEl, scrollContainer, visualScale = 1) {
  const scrollRect = scrollContainer?.getBoundingClientRect?.();
  const scale = Math.max(0.01, Number(visualScale) || 1);
  const candidates = [
    scrollContainer === previewEl ? previewEl?.clientHeight : scrollContainer?.clientHeight,
    scrollRect?.height,
    window.visualViewport?.height,
    window.innerHeight,
    previewEl?.clientHeight
  ];
  return Math.max(1, (Number(candidates.find((value) => Number(value) > 1)) || 1) / scale);
}
function createElementLayoutId(index = -1) {
  return `el-${Date.now().toString(36)}-${Math.max(0, Number(index) || 0).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
function needsElementLayoutMigration(strokes) {
  const ids = new Set();
  return (Array.isArray(strokes) ? strokes : []).some((stroke) => {
    if (isConnectorStroke(stroke)) {
      return false;
    }
    const id = normalizeElementLayout(stroke?.layout)?.id;
    if (!id || ids.has(id)) {
      return true;
    }
    ids.add(id);
    return false;
  });
}
function isStableResponsiveCaptureFrame(surfaceWidth, frame) {
  const width = Number(surfaceWidth) || 0;
  const contentWidth = Number(frame?.width) || 0;
  const stableWideLane = width >= 900 && contentWidth >= 720;
  return width >= 180 && contentWidth >= 140 && (contentWidth / width >= 0.42 || stableWideLane);
}
function responsiveLayoutSignature(width, height, frame, surfaceType, viewportHeight) {
  return [
    surfaceType,
    Math.round(Number(width) || 0),
    Math.round(Number(height) || 0),
    Math.round(Number(frame?.left) || 0),
    Math.round(Number(frame?.width) || 0),
    Math.round(Number(viewportHeight) || 0)
  ].join(":");
}
function collectRenderedLineAnchors(root, canvas, canvasWindowTop, visualScale = 1) {
  if (!root || !canvas) {
    return [];
  }
  const canvasRect = canvas.getBoundingClientRect();
  const scale = Math.max(0.01, Number(visualScale) || 1);
  const anchors = [];
  for (const element of root.querySelectorAll?.("[data-note-draw-line-start]") || []) {
    const start = parseInteger(element.dataset.noteDrawLineStart);
    const end = parseInteger(element.dataset.noteDrawLineEnd) ?? start;
    const path = normalizeVaultPath(element.dataset.noteDrawSourcePath || "");
    const rect = element.getBoundingClientRect?.();
    if (!Number.isFinite(start) || !Number.isFinite(end) || !path || !rect || rect.width <= 1 || rect.height <= 1) {
      continue;
    }
    anchors.push({
      path,
      start: Math.min(start, end),
      end: Math.max(start, end),
      left: (rect.left - canvasRect.left) / scale,
      right: (rect.right - canvasRect.left) / scale,
      top: (rect.top - canvasRect.top) / scale + canvasWindowTop,
      bottom: (rect.bottom - canvasRect.top) / scale + canvasWindowTop,
      height: rect.height / scale,
      area: rect.width * rect.height / (scale * scale),
      confidence: clamp(Number(element.dataset.noteDrawLineConfidence ?? 1), 0, 1)
    });
  }
  return anchors;
}
function collectVirtualMarkdownLineAnchors(view, root, canvas, canvasWindowTop, fallbackPath, visualScale = 1) {
  const renderer = view?.previewMode?.renderer;
  const sections = Array.isArray(renderer?.sections) ? renderer.sections : [];
  if (!root || !canvas || !sections.length || renderer?.previewEl !== root) {
    return [];
  }
  const canvasRect = canvas.getBoundingClientRect();
  const scale = Math.max(0.01, Number(visualScale) || 1);
  const sizer = renderer.sizerEl || root.querySelector?.(":scope > .markdown-preview-sizer") || root.querySelector?.(".markdown-preview-sizer");
  const sizerRect = sizer?.getBoundingClientRect?.();
  const baseTop = sizerRect ? (sizerRect.top - canvasRect.top) / scale + canvasWindowTop : 0;
  const frame = measureResponsiveContentFrame(root, "preview", Math.max(1, Number(root.clientWidth) || Number(root.scrollWidth) / scale || 1), canvas, scale);
  return buildVirtualMarkdownSectionAnchors(sections.map((section) => {
    const element = section?.el;
    const measured = Number(element?.offsetHeight) > 0 && Number.isFinite(Number(element?.offsetTop));
    return {
      startLine: section?.start?.line,
      endLine: section?.end?.line,
      height: Math.max(Number(section?.height) || 0, Number(element?.offsetHeight) || 0, 1),
      measuredTop: measured ? Number(element.offsetTop) : null,
      excluded: Boolean(element?.matches?.(".mod-ui, .mod-header, .mod-footer"))
    };
  }), {
    baseTop,
    left: frame.left,
    right: frame.left + frame.width,
    path: normalizeVaultPath(fallbackPath),
    confidence: 0.96
  });
}
function captureRenderedLineLocation(anchors, canvasX, canvasY, { maxDistance = 64 } = {}) {
  const horizontal = anchors.filter((anchor) => canvasX >= anchor.left - 28 && canvasX <= anchor.right + 28);
  const containing = horizontal.filter((anchor) => canvasY >= anchor.top && canvasY <= anchor.bottom);
  const candidates = containing.length ? containing : horizontal.map((anchor) => ({
    ...anchor,
    distance: canvasY < anchor.top ? anchor.top - canvasY : canvasY > anchor.bottom ? canvasY - anchor.bottom : 0
  })).filter((anchor) => anchor.distance <= maxDistance);
  const anchor = candidates.sort((a, b) => (a.distance || 0) - (b.distance || 0) || a.area - b.area)[0];
  if (!anchor) {
    return null;
  }
  const ratio = clamp((canvasY - anchor.top) / Math.max(1, anchor.height), 0, 0.999999);
  const distance = Number(anchor.distance || 0);
  const inside = canvasY >= anchor.top && canvasY <= anchor.bottom;
  return {
    path: anchor.path,
    line: anchor.start + ratio * Math.max(1, anchor.end - anchor.start + 1),
    lineConfidence: inside ? anchor.confidence : Math.min(anchor.confidence, clamp(1 - distance / Math.max(1, maxDistance), 0, 0.55))
  };
}
function projectRenderedLineLocation(anchors, path, line) {
  const normalizedPath = normalizeVaultPath(path);
  const lineNumber = Number(line);
  if (!normalizedPath || !Number.isFinite(lineNumber)) {
    return NaN;
  }
  const integerLine = Math.floor(lineNumber);
  const candidates = anchors.filter((anchor) => anchor.path === normalizedPath && integerLine >= anchor.start && integerLine <= anchor.end);
  const anchor = candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0) || (a.end - a.start) - (b.end - b.start) || a.area - b.area)[0];
  if (!anchor) {
    return NaN;
  }
  const ratio = clamp((lineNumber - anchor.start) / Math.max(1, anchor.end - anchor.start + 1), 0, 1);
  return anchor.top + ratio * anchor.height;
}
function captureCodeMirrorLineLocation(codeMirror, clientX, clientY, sourcePath) {
  try {
    const position = codeMirror.posAtCoords?.({ x: clientX, y: clientY }, false) ?? codeMirror.posAtCoords?.({ x: clientX, y: clientY });
    const doc = codeMirror.state?.doc;
    if (!Number.isFinite(position) || !doc?.lineAt) {
      return null;
    }
    const line = doc.lineAt(position);
    const startRect = codeMirror.coordsAtPos?.(line.from);
    const endRect = codeMirror.coordsAtPos?.(line.to);
    const top = Math.min(startRect?.top ?? clientY, endRect?.top ?? startRect?.top ?? clientY);
    const bottom = Math.max(startRect?.bottom ?? clientY + 1, endRect?.bottom ?? startRect?.bottom ?? clientY + 1);
    const ratio = clamp((clientY - top) / Math.max(1, bottom - top), 0, 0.999999);
    return {
      path: normalizeVaultPath(sourcePath),
      line: Math.max(0, line.number - 1) + ratio,
      lineConfidence: clientY >= top && clientY <= bottom ? 1 : 0.45
    };
  } catch (error) {
    void error;
    return null;
  }
}
function projectCodeMirrorLineLocation(codeMirror, linePosition) {
  try {
    const doc = codeMirror.state?.doc;
    const lineNumber = Number(linePosition);
    if (!doc?.line || !Number.isFinite(lineNumber)) {
      return NaN;
    }
    const wantedLine = Math.floor(lineNumber) + 1;
    if (wantedLine < 1 || wantedLine > (doc.lines || 1)) {
      return NaN;
    }
    const line = doc.line(wantedLine);
    const startRect = codeMirror.coordsAtPos?.(line.from);
    const endRect = codeMirror.coordsAtPos?.(line.to);
    if (!startRect && !endRect) {
      return NaN;
    }
    const top = Math.min(startRect?.top ?? endRect.top, endRect?.top ?? startRect.top);
    const bottom = Math.max(startRect?.bottom ?? endRect.bottom, endRect?.bottom ?? startRect.bottom);
    return top + clamp(lineNumber - Math.floor(lineNumber), 0, 1) * Math.max(1, bottom - top);
  } catch (error) {
    void error;
    return NaN;
  }
}
function findLayoutMeasureElement(previewEl) {
  return previewEl?.querySelector?.(".markdown-preview-sizer") || previewEl?.querySelector?.(".cm-sizer") || previewEl?.querySelector?.(".cm-content") || previewEl;
}
function measureVisibleSurfaceWindow(previewEl, scrollContainer, documentHeight, visualScale = 1) {
  const height = Math.max(1, Number(documentHeight) || 1);
  const scale = Math.max(0.01, Number(visualScale) || 1);
  const previewRect = previewEl?.getBoundingClientRect?.();
  if (scrollContainer === previewEl) {
    const viewportHeight = Math.max(1, (previewEl.clientHeight || previewRect?.height || window.innerHeight || 1) / scale);
    return {
      top: clamp((Number(previewEl.scrollTop) || 0) / scale, 0, Math.max(0, height - viewportHeight)),
      height: Math.min(height, viewportHeight)
    };
  }
  const viewportRect = scrollContainer?.getBoundingClientRect?.() || {
    top: 0,
    bottom: window.innerHeight || height,
    height: window.innerHeight || height
  };
  const surfaceTop = previewRect?.top || 0;
  const viewportTop = Math.max(0, (viewportRect.top - surfaceTop) / scale);
  const viewportBottom = Math.min(height, ((viewportRect.bottom || viewportRect.top + viewportRect.height) - surfaceTop) / scale);
  const fallbackHeight = Math.max(1, (viewportRect.height || window.innerHeight || 1) / scale);
  const visibleHeight = Math.min(height, Math.max(1, viewportBottom - viewportTop || fallbackHeight));
  const scrollTop = Number(scrollContainer?.scrollTop) || 0;
  const scrollHeight = Number(scrollContainer?.scrollHeight) || 0;
  const clientHeight = Number(scrollContainer?.clientHeight) || Number(viewportRect.height) || 0;
  const atScrollEnd = scrollHeight > clientHeight && scrollTop + clientHeight >= scrollHeight - 3;
  return {
    top: atScrollEnd ? Math.max(0, height - visibleHeight) : clamp(viewportTop, 0, Math.max(0, height - visibleHeight)),
    height: visibleHeight
  };
}
function clearCanvasContext(context, canvas) {
  if (!context || !canvas) {
    return;
  }
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
}
function getScrollEventTarget(scroller) {
  if (!scroller) {
    return window;
  }
  return scroller === activeDocument.documentElement || scroller === activeDocument.body ? window : scroller;
}
function findScrollableAncestor(element) {
  let current = element;
  while (current && current !== activeDocument.body && current !== activeDocument.documentElement) {
    const style = window.getComputedStyle(current);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && current.scrollHeight > current.clientHeight;
    const canScrollX = /(auto|scroll|overlay)/.test(style.overflowX) && current.scrollWidth > current.clientWidth;
    if (canScrollY || canScrollX) {
      return current;
    }
    current = current.parentElement;
  }
  return activeDocument.scrollingElement || activeDocument.documentElement;
}
function loadExportImage(src, timeoutMs) {
  if (!src) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const image = new Image();
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      image.removeEventListener("load", done);
      image.removeEventListener("error", fail);
    };
    const done = () => {
      cleanup();
      resolve(image);
    };
    const fail = () => {
      cleanup();
      resolve(null);
    };
    image.decoding = "sync";
    image.loading = "eager";
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", fail, { once: true });
    timer = window.setTimeout(fail, timeoutMs);
    image.src = src;
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      done();
    }
  });
}
function arrayBufferToDataUrl(buffer, mime) {
  return `data:${mime || "image/png"};base64,${arrayBufferToBase64(buffer)}`;
}
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32768;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
function normalizeImageDataUrl(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(text) ? text : "";
}
function getImageStrokeCacheKey(stroke) {
  if (!isImageEmbedStroke(stroke)) {
    return "";
  }
  const dataLength = stroke.exportImageDataUrl ? String(stroke.exportImageDataUrl).length : 0;
  return [stroke.assetPath || "", stroke.assetName || "", stroke.assetSize || 0, dataLength].join("|");
}
function objectFitContain(sourceWidth, sourceHeight, boxWidth, boxHeight) {
  const scale = Math.min(boxWidth / Math.max(1, sourceWidth), boxHeight / Math.max(1, sourceHeight));
  const width = Math.max(1, sourceWidth * scale);
  const height = Math.max(1, sourceHeight * scale);
  return {
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
    width,
    height
  };
}
function waitForImage(image, timeoutMs) {
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      image.removeEventListener("load", done);
      image.removeEventListener("error", done);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
    timer = window.setTimeout(done, timeoutMs);
  });
}
function pointDistanceOnCanvas(a, b, width, height) {
  return Math.hypot(
    ((a?.x || 0) - (b?.x || 0)) * Math.max(1, width || 1),
    ((a?.y || 0) - (b?.y || 0)) * Math.max(1, height || 1)
  );
}
function buildBoundConnectorPoints(fromBounds, toBounds, canvasWidth, canvasHeight) {
  return buildSnappedConnectorPoints({ fromBounds, toBounds, canvasWidth, canvasHeight });
}
function buildFreeConnectorPoints(fromPoint, toPoint, canvasWidth, canvasHeight) {
  const width = Math.max(1, Number(canvasWidth) || 1);
  const height = Math.max(1, Number(canvasHeight) || 1);
  const from = {
    x: clamp(Number(fromPoint?.x) || 0, 0, 1) * width,
    y: clamp(Number(fromPoint?.y) || 0, 0, 1) * height
  };
  const to = {
    x: clamp(Number(toPoint?.x) || 0, 0, 1) * width,
    y: clamp(Number(toPoint?.y) || 0, 0, 1) * height
  };
  const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  const control = horizontal
    ? { x: (from.x + to.x) / 2, y: from.y }
    : { x: from.x, y: (from.y + to.y) / 2 };
  return [from, control, to].map((point) => ({
    x: clamp(point.x / width, 0, 1),
    y: clamp(point.y / height, 0, 1),
    t: Date.now(),
    anchor: null
  }));
}
function sameStrokePointPath(left, right, tolerance = 1e-6) {
  if (!Array.isArray(left) || left.length !== right.length) {
    return false;
  }
  return left.every((point, index) => Math.abs(Number(point.x) - Number(right[index].x)) <= tolerance && Math.abs(Number(point.y) - Number(right[index].y)) <= tolerance);
}
function getTextStrokeLayout(stroke, width, measureText = null) {
  const point = stroke?.points?.[0] || { x: 0, y: 0 };
  const fontSize = clamp(Number(stroke?.fontSize || 18), 10, 72);
  const uiArrow = stroke?.uiRole === "arrow";
  const padded = !uiArrow && (stroke?.boxed || stroke?.code || stroke?.file || isButtonLikeStroke(stroke));
  const canvasX = clamp(Number(point.x || 0), 0, 1) * Math.max(1, Number(width) || 1);
  const maxWidth = Math.max(fontSize, Math.max(1, Number(width) || 1) - canvasX - Math.max(8, fontSize * 0.45) - 8);
  const layout = computeTextLayout({
    text: String(stroke?.text || "").trim(),
    fontSize,
    textWidth: stroke?.textWidth,
    maxWidth,
    padded,
    measureText
  });
  if (normalizeButtonStyle(stroke?.buttonStyle) !== "circle") {
    return layout;
  }
  const size = Math.max(44, layout.width, layout.height);
  return {
    ...layout,
    paddingX: (size - layout.contentWidth) / 2,
    paddingY: (size - layout.contentHeight) / 2,
    width: size,
    height: size
  };
}
function getStrokeBounds(stroke, width, height) {
  if (!stroke?.points?.length) {
    return null;
  }
  if (isEmbedStroke(stroke) || isRichTextStroke(stroke)) {
    const point = stroke.points[0];
    const previewWidth = clamp(Number(stroke.previewWidth || 260), 80, 900);
    const previewHeight = clamp(Number(stroke.previewHeight || 160), 40, 700);
    const x = point.x * width;
    const y = point.y * height;
    return {
      minX: x,
      minY: y,
      maxX: x + previewWidth,
      maxY: y + previewHeight
    };
  }
  if (isTextStroke(stroke)) {
    const point = stroke.points[0];
    const layout = getTextStrokeLayout(stroke, width);
    const x = point.x * width;
    const y = point.y * height;
    return {
      minX: x - layout.paddingX,
      minY: y - layout.paddingY,
      maxX: x + layout.contentWidth + layout.paddingX,
      maxY: y + layout.contentHeight + layout.paddingY
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of stroke.points) {
    const x = point.x * width;
    const y = point.y * height;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    minX,
    minY,
    maxX,
    maxY
  };
}
function normalizeCanvasRect(a, b) {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y)
  };
}
function rectsIntersect(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
function translateNormalizedBounds(bounds, dx, dy) {
  return {
    minX: bounds.minX + dx,
    minY: bounds.minY + dy,
    maxX: bounds.maxX + dx,
    maxY: bounds.maxY + dy
  };
}
function nearestSnapDelta(values, candidates, gridSize, threshold) {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }
    if (gridSize > 0) {
      const gridTarget = Math.round(value / gridSize) * gridSize;
      const gridDelta = gridTarget - value;
      const distance = Math.abs(gridDelta);
      if (distance <= threshold && distance < bestDistance) {
        best = gridDelta;
        bestDistance = distance;
      }
    }
    for (const candidate of candidates) {
      if (!Number.isFinite(candidate)) {
        continue;
      }
      const delta = candidate - value;
      const distance = Math.abs(delta);
      if (distance <= threshold && distance < bestDistance) {
        best = delta;
        bestDistance = distance;
      }
    }
  }
  return best;
}
function getSelectionHandlePointsFromRect(rect) {
  return [
    { handle: "nw", x: rect.x, y: rect.y },
    { handle: "ne", x: rect.x + rect.width, y: rect.y },
    { handle: "sw", x: rect.x, y: rect.y + rect.height },
    { handle: "se", x: rect.x + rect.width, y: rect.y + rect.height }
  ];
}
function getSelectionResizeAnchor(bounds, handle) {
  if (handle === "nw") {
    return { x: bounds.maxX, y: bounds.maxY };
  }
  if (handle === "ne") {
    return { x: bounds.minX, y: bounds.maxY };
  }
  if (handle === "sw") {
    return { x: bounds.maxX, y: bounds.minY };
  }
  return { x: bounds.minX, y: bounds.minY };
}
function getSelectionResizeCorner(bounds, handle) {
  if (handle === "nw") {
    return { x: bounds.minX, y: bounds.minY };
  }
  if (handle === "ne") {
    return { x: bounds.maxX, y: bounds.minY };
  }
  if (handle === "sw") {
    return { x: bounds.minX, y: bounds.maxY };
  }
  return { x: bounds.maxX, y: bounds.maxY };
}
function scaleNormalizedBoundsFromAnchor(bounds, anchor, scaleX, scaleY) {
  const firstX = anchor.x + (bounds.minX - anchor.x) * scaleX;
  const secondX = anchor.x + (bounds.maxX - anchor.x) * scaleX;
  const firstY = anchor.y + (bounds.minY - anchor.y) * scaleY;
  const secondY = anchor.y + (bounds.maxY - anchor.y) * scaleY;
  return {
    minX: Math.min(firstX, secondX),
    minY: Math.min(firstY, secondY),
    maxX: Math.max(firstX, secondX),
    maxY: Math.max(firstY, secondY)
  };
}
function limitSelectionResizeScaleToCanvas(scale, bounds, anchor, axis) {
  const minimum = 0.04;
  const value = Math.max(minimum, Number(scale) || 1);
  const min = axis === "x" ? Number(bounds?.minX) : Number(bounds?.minY);
  const max = axis === "x" ? Number(bounds?.maxX) : Number(bounds?.maxY);
  const origin = axis === "x" ? Number(anchor?.x) : Number(anchor?.y);
  if (![min, max, origin].every(Number.isFinite)) {
    return value;
  }
  let maximum = Number.POSITIVE_INFINITY;
  const negativeDistance = min - origin;
  const positiveDistance = max - origin;
  if (negativeDistance < 0) {
    maximum = Math.min(maximum, origin / -negativeDistance);
  }
  if (positiveDistance > 0) {
    maximum = Math.min(maximum, (1 - origin) / positiveDistance);
  }
  return Math.min(value, Math.max(minimum, maximum));
}
function getPenOffsets(count, width) {
  if (count <= 1) {
    return [{ x: 0, y: 0 }];
  }
  const radius = Math.max(2, Number(width || 3) * 1.15);
  const offsets = [{ x: 0, y: 0 }];
  for (let index = 1; index < count; index += 1) {
    const angle = (index - 1) / Math.max(1, count - 1) * Math.PI * 2;
    offsets.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    });
  }
  return offsets;
}
function strokeHitTest(stroke, hitPoint, width, height, threshold) {
  const bounds = getStrokeBounds(stroke, width, height);
  const insideBounds = Boolean(bounds) && hitPoint.x >= bounds.minX - threshold && hitPoint.x <= bounds.maxX + threshold && hitPoint.y >= bounds.minY - threshold && hitPoint.y <= bounds.maxY + threshold;
  if (!insideBounds) {
    return false;
  }
  if (isEmbedStroke(stroke) || isRichTextStroke(stroke) || isTextStroke(stroke)) {
    return true;
  }
  if (stroke.points.length === 1) {
    return pointerDistance({
      x: stroke.points[0].x * width,
      y: stroke.points[0].y * height
    }, hitPoint) <= threshold;
  }
  let previous = {
    x: stroke.points[0].x * width,
    y: stroke.points[0].y * height
  };
  for (let index = 1; index < stroke.points.length; index += 1) {
    const current = {
      x: stroke.points[index].x * width,
      y: stroke.points[index].y * height
    };
    if (distanceToSegment(hitPoint, previous, current) <= threshold) {
      return true;
    }
    previous = current;
  }
  return false;
}
function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return pointerDistance(point, start);
  }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy
  };
  return pointerDistance(point, projection);
}
function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
function pickNearestBlock(candidates, sourceLine) {
  if (!candidates.length) {
    return null;
  }
  if (sourceLine === null || sourceLine === void 0) {
    return candidates[0];
  }
  return candidates.slice().sort((a, b) => Math.abs(a.line - sourceLine) - Math.abs(b.line - sourceLine))[0];
}
function formatReplacementBlock(originalBlock, editedText) {
  const original = String(originalBlock || "");
  const edited = normalizeEditableSourceText(editedText);
  const firstLine = original.split(/\r?\n/)[0] || "";
  const heading = firstLine.match(/^(#{1,6}\s+)/);
  if (heading) {
    return `${heading[1]}${edited}`;
  }
  const quote = firstLine.match(/^(\s{0,3}>\s?)/);
  if (quote) {
    return edited.split("\n").map((line) => `${quote[1]}${line}`).join("\n");
  }
  const task = firstLine.match(/^(\s*[-*+]\s+\[[ xX]\]\s+)/);
  if (task) {
    const lines = edited.split("\n");
    return lines.map((line, index) => index === 0 ? `${task[1]}${line}` : line).join("\n");
  }
  const unordered = firstLine.match(/^(\s*[-*+]\s+)/);
  if (unordered) {
    const lines = edited.split("\n");
    return lines.map((line, index) => index === 0 ? `${unordered[1]}${line}` : line).join("\n");
  }
  const ordered = firstLine.match(/^(\s*\d+[.)]\s+)/);
  if (ordered) {
    const lines = edited.split("\n");
    return lines.map((line, index) => index === 0 ? `${ordered[1]}${line}` : line).join("\n");
  }
  return edited;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- Re-enable dynamic interop lint rules after the plugin implementation. */
