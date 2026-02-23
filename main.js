/*
Paper Studio Obsidian Plugin
Publish your notes to Paper Studio
*/

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PaperStudioPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  apiKey: "",
  apiUrl: "https://paperstudio.ink"
};
var FRONTMATTER_URL_KEY = "paperstudio_url";
var ConfirmNewPublishModal = class extends import_obsidian.Modal {
  constructor(app, onConfirm, onCancel) {
    super(app);
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Document not found" });
    contentEl.createEl("p", {
      text: "The previously published document was not found or you don't have access to it. Would you like to publish as a new document?"
    });
    const buttonContainer = contentEl.createEl("div", { cls: "paperstudio-button-container" });
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => {
      this.close();
      this.onCancel();
    });
    const confirmBtn = buttonContainer.createEl("button", { text: "Publish as new", cls: "mod-cta" });
    confirmBtn.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
var PublishModal = class extends import_obsidian.Modal {
  constructor(app, plugin, markdown, sourceFile) {
    super(app);
    this.passwordEnabled = false;
    this.plugin = plugin;
    this.markdown = markdown;
    this.sourceFile = sourceFile;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Publish to Paper Studio" });
    const form = contentEl.createEl("div", { cls: "paperstudio-publish-form" });
    new import_obsidian.Setting(form).setName("Password protect").setDesc("Require a password to view this document").addToggle((toggle) => {
      toggle.setValue(false);
      toggle.onChange((value) => {
        this.passwordEnabled = value;
        this.passwordContainer.removeClass("paperstudio-password-container-hidden", "paperstudio-password-container-visible");
        this.passwordContainer.addClass(value ? "paperstudio-password-container-visible" : "paperstudio-password-container-hidden");
        if (value) {
          this.passwordInput.focus();
        } else {
          this.passwordInput.value = "";
        }
      });
    });
    this.passwordContainer = form.createEl("div", { cls: "paperstudio-password-container-hidden" });
    new import_obsidian.Setting(this.passwordContainer).setName("Password").addText((text) => {
      this.passwordInput = text.inputEl;
      text.inputEl.type = "password";
      text.setPlaceholder("Enter password...");
    });
    const buttonContainer = form.createEl("div", { cls: "paperstudio-button-container" });
    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());
    const publishBtn = buttonContainer.createEl("button", { text: "Publish", cls: "mod-cta" });
    publishBtn.addEventListener("click", () => {
      const password = this.passwordEnabled ? this.passwordInput.value.trim() || void 0 : void 0;
      this.close();
      void this.plugin.doPublish(this.markdown, this.sourceFile, password);
    });
    this.passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const password = this.passwordEnabled ? this.passwordInput.value.trim() || void 0 : void 0;
        this.close();
        void this.plugin.doPublish(this.markdown, this.sourceFile, password);
      }
    });
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
var PaperStudioPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: "publish-note",
      name: "Publish current note",
      checkCallback: (checking) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === "md") {
          if (!checking) {
            void this.app.vault.read(activeFile).then((content) => {
              if (!this.settings.apiKey) {
                new import_obsidian.Notice("Please set your Paper Studio API key in settings.");
                return;
              }
              if (!content.trim()) {
                new import_obsidian.Notice("Note is empty.");
                return;
              }
              new PublishModal(this.app, this, content, activeFile).open();
            });
          }
          return true;
        }
        return false;
      }
    });
    this.addSettingTab(new PaperStudioSettingTab(this.app, this));
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  /**
   * Extract slug from paperstudio_url in frontmatter
   */
  extractSlugFromFrontmatter(content) {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);
    if (!match)
      return null;
    const frontmatter = match[1];
    const urlMatch = frontmatter.match(new RegExp(`^${FRONTMATTER_URL_KEY}:\\s*(.+)$`, "m"));
    if (!urlMatch)
      return null;
    const url = urlMatch[1].trim();
    const slugMatch = url.match(/\/([^/]+)$/);
    return slugMatch ? slugMatch[1] : null;
  }
  /**
   * Update or add paperstudio_url in frontmatter
   */
  async updateFrontmatterWithUrl(file, url) {
    const content = await this.app.vault.read(file);
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);
    let newContent;
    if (match) {
      const frontmatter = match[1];
      const urlRegex = new RegExp(`^${FRONTMATTER_URL_KEY}:.*$`, "m");
      if (urlRegex.test(frontmatter)) {
        const newFrontmatter = frontmatter.replace(urlRegex, `${FRONTMATTER_URL_KEY}: ${url}`);
        newContent = content.replace(frontmatterRegex, `---
${newFrontmatter}
---`);
      } else {
        const newFrontmatter = `${frontmatter}
${FRONTMATTER_URL_KEY}: ${url}`;
        newContent = content.replace(frontmatterRegex, `---
${newFrontmatter}
---`);
      }
    } else {
      newContent = `---
${FRONTMATTER_URL_KEY}: ${url}
---

${content}`;
    }
    await this.app.vault.modify(file, newContent);
  }
  /**
   * Find all local image references in markdown
   */
  findImageReferences(markdown) {
    const references = [];
    const wikiRegex = /!\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = wikiRegex.exec(markdown)) !== null) {
      const path = match[1].split("|")[0].trim();
      references.push({
        fullMatch: match[0],
        path,
        isWikiStyle: true
      });
    }
    const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    while ((match = mdRegex.exec(markdown)) !== null) {
      const path = match[2].trim();
      if (path.startsWith("http://") || path.startsWith("https://")) {
        continue;
      }
      references.push({
        fullMatch: match[0],
        path,
        isWikiStyle: false
      });
    }
    return references;
  }
  /**
   * Check if a path is an Excalidraw file
   */
  isExcalidrawFile(path) {
    return path.endsWith(".excalidraw") || path.endsWith(".excalidraw.md");
  }
  /**
   * Try to find an exported SVG/PNG for an Excalidraw file
   */
  findExcalidrawExport(excalidrawPath, sourceFile) {
    const basePath = excalidrawPath.replace(/\.excalidraw(\.md)?$/, "");
    const patterns = [
      `${excalidrawPath}.svg`,
      `${excalidrawPath}.png`,
      `${basePath}.svg`,
      `${basePath}.png`
    ];
    for (const pattern of patterns) {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(pattern, (sourceFile == null ? void 0 : sourceFile.path) || "");
      if (resolved instanceof import_obsidian.TFile) {
        return resolved;
      }
    }
    return null;
  }
  /**
   * Resolve an image path to a TFile
   */
  resolveImageFile(path, sourceFile, isWikiStyle) {
    var _a, _b;
    if (this.isExcalidrawFile(path)) {
      const exported = this.findExcalidrawExport(path, sourceFile);
      if (exported) {
        return exported;
      }
      console.warn(`Excalidraw file ${path} has no exported SVG/PNG. Enable auto-export in Excalidraw settings.`);
      return null;
    }
    if (isWikiStyle) {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(path, (sourceFile == null ? void 0 : sourceFile.path) || "");
      if (resolved instanceof import_obsidian.TFile) {
        return resolved;
      }
    } else {
      let fullPath = path;
      if (path.startsWith("./") || path.startsWith("../")) {
        if (sourceFile) {
          const folder = ((_a = sourceFile.parent) == null ? void 0 : _a.path) || "";
          fullPath = this.normalizePath(folder, path);
        }
      }
      const file = this.app.vault.getAbstractFileByPath(fullPath);
      if (file instanceof import_obsidian.TFile) {
        return file;
      }
      if (path.startsWith("./")) {
        const cleanPath = path.substring(2);
        if (sourceFile) {
          const folder = ((_b = sourceFile.parent) == null ? void 0 : _b.path) || "";
          fullPath = folder ? `${folder}/${cleanPath}` : cleanPath;
        }
        const file2 = this.app.vault.getAbstractFileByPath(fullPath);
        if (file2 instanceof import_obsidian.TFile) {
          return file2;
        }
      }
    }
    return null;
  }
  /**
   * Normalize a path with relative components
   */
  normalizePath(basePath, relativePath) {
    const parts = basePath.split("/").filter((p) => p);
    const relParts = relativePath.split("/");
    for (const part of relParts) {
      if (part === "..") {
        parts.pop();
      } else if (part !== "." && part !== "") {
        parts.push(part);
      }
    }
    return parts.join("/");
  }
  /**
   * Upload an image file to Paper Studio
   */
  async uploadImage(file) {
    const arrayBuffer = await this.app.vault.readBinary(file);
    const ext = file.extension.toLowerCase();
    const contentTypes = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml"
    };
    const contentType = contentTypes[ext] || "image/png";
    const boundary = "----ObsidianPaperStudio" + Date.now();
    const header = `--${boundary}\r
Content-Disposition: form-data; name="file"; filename="${file.name}"\r
Content-Type: ${contentType}\r
\r
`;
    const footer = `\r
--${boundary}--\r
`;
    const headerBytes = new TextEncoder().encode(header);
    const footerBytes = new TextEncoder().encode(footer);
    const fileBytes = new Uint8Array(arrayBuffer);
    const body = new Uint8Array(headerBytes.length + fileBytes.length + footerBytes.length);
    body.set(headerBytes, 0);
    body.set(fileBytes, headerBytes.length);
    body.set(footerBytes, headerBytes.length + fileBytes.length);
    const response = await (0, import_obsidian.requestUrl)({
      url: `${this.settings.apiUrl}/api/v1/upload-image`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`
      },
      body: body.buffer
    });
    if (response.status >= 400) {
      const error = response.json;
      throw new Error(error.error || "Failed to upload image");
    }
    const data = response.json;
    return data.url;
  }
  /**
   * Process markdown: upload images and replace paths with URLs
   */
  async processMarkdownImages(markdown, sourceFile) {
    const references = this.findImageReferences(markdown);
    if (references.length === 0) {
      return markdown;
    }
    let processed = markdown;
    let uploaded = 0;
    const total = references.length;
    const uploadedUrls = /* @__PURE__ */ new Map();
    for (const ref of references) {
      if (uploadedUrls.has(ref.path)) {
        const url = uploadedUrls.get(ref.path);
        processed = processed.replace(ref.fullMatch, `![](${url})`);
        uploaded++;
        continue;
      }
      const file = this.resolveImageFile(ref.path, sourceFile, ref.isWikiStyle);
      if (!file) {
        if (this.isExcalidrawFile(ref.path)) {
          console.warn(`Excalidraw ${ref.path} has no exported image. Enable auto-export in Excalidraw plugin settings.`);
          processed = processed.replace(ref.fullMatch, `[Excalidraw: Enable auto-export for ${ref.path}]`);
        } else {
          console.warn(`Could not resolve image: ${ref.path}`);
          processed = processed.replace(ref.fullMatch, `[Image not found: ${ref.path}]`);
        }
        uploaded++;
        continue;
      }
      try {
        new import_obsidian.Notice(`Uploading images... (${uploaded + 1}/${total})`);
        const url = await this.uploadImage(file);
        uploadedUrls.set(ref.path, url);
        processed = processed.replace(ref.fullMatch, `![](${url})`);
      } catch (error) {
        console.error(`Failed to upload ${ref.path}:`, error);
        processed = processed.replace(ref.fullMatch, `[Failed to upload: ${ref.path}]`);
      }
      uploaded++;
    }
    return processed;
  }
  async doPublish(markdown, sourceFile, password, forceNew = false) {
    const loadingNotice = new import_obsidian.Notice(
      forceNew ? "Publishing as new document..." : "Publishing to Paper Studio...",
      0
    );
    try {
      const processedMarkdown = await this.processMarkdownImages(markdown, sourceFile);
      let existingSlug = null;
      if (!forceNew) {
        existingSlug = this.extractSlugFromFrontmatter(markdown);
        if (existingSlug) {
          loadingNotice.setMessage("Updating document...");
        }
      }
      const title = (sourceFile == null ? void 0 : sourceFile.basename) || "Untitled";
      const response = await (0, import_obsidian.requestUrl)({
        url: `${this.settings.apiUrl}/api/v1/publish`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.settings.apiKey}`
        },
        body: JSON.stringify({
          markdown: processedMarkdown,
          title,
          password,
          slug: existingSlug
        })
      });
      if (response.status >= 400) {
        const errorData = response.json;
        if (errorData.error === "not_found" || errorData.error === "not_owner") {
          loadingNotice.hide();
          new ConfirmNewPublishModal(
            this.app,
            () => {
              void this.doPublish(markdown, sourceFile, password, true);
            },
            () => {
              new import_obsidian.Notice("Publish cancelled");
            }
          ).open();
          return;
        }
        throw new Error(errorData.error || "Failed to publish");
      }
      const data = response.json;
      const fullUrl = `${this.settings.apiUrl}${data.url}`;
      if (sourceFile && data.slug) {
        const fullUrl2 = `${this.settings.apiUrl}/${data.slug}`;
        await this.updateFrontmatterWithUrl(sourceFile, fullUrl2);
      }
      await navigator.clipboard.writeText(fullUrl);
      loadingNotice.hide();
      const protectedMsg = data.protected ? " (password protected)" : "";
      const actionMsg = data.updated ? "Updated" : "Published";
      new import_obsidian.Notice(`${actionMsg}${protectedMsg}! Link copied to clipboard`);
    } catch (error) {
      loadingNotice.hide();
      console.error("Paper Studio publish error:", error);
      new import_obsidian.Notice(
        `Failed to publish: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
};
var PaperStudioSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Paper Studio settings").setHeading();
    new import_obsidian.Setting(containerEl).setName("API key").setDesc(
      "Your Paper Studio API key. Get it from settings in the Paper Studio web app."
    ).addText(
      (text) => text.setPlaceholder("ps_...").setValue(this.plugin.settings.apiKey).onChange(async (value) => {
        this.plugin.settings.apiKey = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("API url").setDesc("Paper Studio server URL (change only for self-hosted instances)").addText(
      (text) => text.setPlaceholder("https://paperstudio.ink").setValue(this.plugin.settings.apiUrl).onChange(async (value) => {
        this.plugin.settings.apiUrl = value || DEFAULT_SETTINGS.apiUrl;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Usage").setHeading();
    containerEl.createEl("p", {
      text: 'Open a note and use the command palette (Ctrl/Cmd + P) to run "Publish to Paper Studio". The shareable link will be copied to your clipboard.'
    });
    new import_obsidian.Setting(containerEl).setName("Images").setHeading();
    containerEl.createEl("p", {
      text: "Local images in your notes are automatically uploaded when publishing. Supported formats: PNG, JPEG, GIF, WebP, SVG."
    });
  }
};
