import { App, Modal, Notice, Plugin, PluginSettingTab, requestUrl, Setting, TFile } from "obsidian";

interface PaperStudioSettings {
  apiKey: string;
  apiUrl: string;
}

const DEFAULT_SETTINGS: PaperStudioSettings = {
  apiKey: "",
  apiUrl: "https://paperstudio.ink",
};

interface ImageReference {
  fullMatch: string;
  path: string;
  isWikiStyle: boolean;
}

const FRONTMATTER_URL_KEY = "paperstudio_url";

class ConfirmNewPublishModal extends Modal {
  onConfirm: () => void;
  onCancel: () => void;

  constructor(app: App, onConfirm: () => void, onCancel: () => void) {
    super(app);
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;

    new Setting(contentEl).setName("Document not found").setHeading();
    contentEl.createEl("p", {
      text: "The previously published document was not found or you don't have access to it. Would you like to publish as a new document?",
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
}

class PublishModal extends Modal {
  plugin: PaperStudioPlugin;
  markdown: string;
  sourceFile: TFile | null;
  passwordInput: HTMLInputElement;
  passwordEnabled: boolean = false;
  passwordContainer: HTMLElement;

  constructor(app: App, plugin: PaperStudioPlugin, markdown: string, sourceFile: TFile | null) {
    super(app);
    this.plugin = plugin;
    this.markdown = markdown;
    this.sourceFile = sourceFile;
  }

  onOpen() {
    const { contentEl } = this;

    new Setting(contentEl).setName("Publish document").setHeading();

    const form = contentEl.createEl("div", { cls: "paperstudio-publish-form" });

    // Password toggle
    new Setting(form)
      .setName("Password protect")
      .setDesc("Require a password to view this document")
      .addToggle((toggle) => {
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

    // Password field (hidden by default)
    this.passwordContainer = form.createEl("div", { cls: "paperstudio-password-container-hidden" });

    new Setting(this.passwordContainer)
      .setName("Password")
      .addText((text) => {
        this.passwordInput = text.inputEl;
        text.inputEl.type = "password";
        text.setPlaceholder("Enter password...");
      });

    // Buttons
    const buttonContainer = form.createEl("div", { cls: "paperstudio-button-container" });

    const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const publishBtn = buttonContainer.createEl("button", { text: "Publish", cls: "mod-cta" });
    publishBtn.addEventListener("click", () => {
      const password = this.passwordEnabled ? this.passwordInput.value.trim() || undefined : undefined;
      this.close();
      void this.plugin.doPublish(this.markdown, this.sourceFile, password);
    });

    // Allow Enter key to submit
    this.passwordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const password = this.passwordEnabled ? this.passwordInput.value.trim() || undefined : undefined;
        this.close();
        void this.plugin.doPublish(this.markdown, this.sourceFile, password);
      }
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export default class PaperStudioPlugin extends Plugin {
  settings: PaperStudioSettings;

  async onload() {
    await this.loadSettings();

    // Add command to publish current note
    this.addCommand({
      id: "publish-note",
      name: "Publish current note",
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();

        // Only show command when a markdown file is open
        if (activeFile && activeFile.extension === "md") {
          if (!checking) {
            // Execute the command
            void this.app.vault.read(activeFile).then(content => {
              if (!this.settings.apiKey) {
                new Notice("Please set your API key in settings.");
                return;
              }

              if (!content.trim()) {
                new Notice("Note is empty.");
                return;
              }

              new PublishModal(this.app, this, content, activeFile).open();
            });
          }
          return true;
        }
        return false;
      },
    });

    // Add settings tab
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
  extractSlugFromFrontmatter(content: string): string | null {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (!match) return null;

    const frontmatter = match[1];
    const urlMatch = frontmatter.match(new RegExp(`^${FRONTMATTER_URL_KEY}:\\s*(.+)$`, 'm'));

    if (!urlMatch) return null;

    // Extract slug from URL (last path segment)
    const url = urlMatch[1].trim();
    const slugMatch = url.match(/\/([^/]+)$/);
    return slugMatch ? slugMatch[1] : null;
  }

  /**
   * Update or add paperstudio_url in frontmatter
   */
  async updateFrontmatterWithUrl(file: TFile, url: string): Promise<void> {
    const content = await this.app.vault.read(file);
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    let newContent: string;

    if (match) {
      // Frontmatter exists, update or add the URL
      const frontmatter = match[1];
      const urlRegex = new RegExp(`^${FRONTMATTER_URL_KEY}:.*$`, 'm');

      if (urlRegex.test(frontmatter)) {
        // Update existing URL
        const newFrontmatter = frontmatter.replace(urlRegex, `${FRONTMATTER_URL_KEY}: ${url}`);
        newContent = content.replace(frontmatterRegex, `---\n${newFrontmatter}\n---`);
      } else {
        // Add URL to existing frontmatter
        const newFrontmatter = `${frontmatter}\n${FRONTMATTER_URL_KEY}: ${url}`;
        newContent = content.replace(frontmatterRegex, `---\n${newFrontmatter}\n---`);
      }
    } else {
      // No frontmatter, create new
      newContent = `---\n${FRONTMATTER_URL_KEY}: ${url}\n---\n\n${content}`;
    }

    await this.app.vault.modify(file, newContent);
  }

  /**
   * Find all local image references in markdown
   */
  findImageReferences(markdown: string): ImageReference[] {
    const references: ImageReference[] = [];

    // Wiki-style: ![[image.png]] or ![[folder/image.png]]
    const wikiRegex = /!\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = wikiRegex.exec(markdown)) !== null) {
      const path = match[1].split("|")[0].trim(); // Handle ![[image.png|alt text]]
      references.push({
        fullMatch: match[0],
        path,
        isWikiStyle: true,
      });
    }

    // Standard markdown: ![alt](path) - but skip URLs
    const mdRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    while ((match = mdRegex.exec(markdown)) !== null) {
      const path = match[2].trim();
      // Skip if it's a URL
      if (path.startsWith("http://") || path.startsWith("https://")) {
        continue;
      }
      references.push({
        fullMatch: match[0],
        path,
        isWikiStyle: false,
      });
    }

    return references;
  }

  /**
   * Check if a path is an Excalidraw file
   */
  isExcalidrawFile(path: string): boolean {
    return path.endsWith(".excalidraw") || path.endsWith(".excalidraw.md");
  }

  /**
   * Try to find an exported SVG/PNG for an Excalidraw file
   */
  findExcalidrawExport(excalidrawPath: string, sourceFile: TFile | null): TFile | null {
    // Try common export patterns:
    // 1. drawing.excalidraw.svg or drawing.excalidraw.png (same folder)
    // 2. drawing.svg or drawing.png (same folder, without .excalidraw)

    const basePath = excalidrawPath.replace(/\.excalidraw(\.md)?$/, "");

    // Patterns to try
    const patterns = [
      `${excalidrawPath}.svg`,
      `${excalidrawPath}.png`,
      `${basePath}.svg`,
      `${basePath}.png`,
    ];

    for (const pattern of patterns) {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(pattern, sourceFile?.path || "");
      if (resolved instanceof TFile) {
        return resolved;
      }
    }

    return null;
  }

  /**
   * Resolve an image path to a TFile
   */
  resolveImageFile(path: string, sourceFile: TFile | null, isWikiStyle: boolean): TFile | null {
    // Check if it's an Excalidraw file and try to find exported image
    if (this.isExcalidrawFile(path)) {
      const exported = this.findExcalidrawExport(path, sourceFile);
      if (exported) {
        return exported;
      }
      // If no export found, return null - we can't upload .excalidraw files directly
      console.warn(`Excalidraw file ${path} has no exported SVG/PNG. Enable auto-export in Excalidraw settings.`);
      return null;
    }

    if (isWikiStyle) {
      // Use metadataCache for wiki-style links
      const resolved = this.app.metadataCache.getFirstLinkpathDest(path, sourceFile?.path || "");
      if (resolved instanceof TFile) {
        return resolved;
      }
    } else {
      // For standard markdown paths, try to resolve relative to the source file
      let fullPath = path;

      // Handle relative paths
      if (path.startsWith("./") || path.startsWith("../")) {
        if (sourceFile) {
          const folder = sourceFile.parent?.path || "";
          fullPath = this.normalizePath(folder, path);
        }
      }

      const file = this.app.vault.getAbstractFileByPath(fullPath);
      if (file instanceof TFile) {
        return file;
      }

      // Try without leading ./
      if (path.startsWith("./")) {
        const cleanPath = path.substring(2);
        if (sourceFile) {
          const folder = sourceFile.parent?.path || "";
          fullPath = folder ? `${folder}/${cleanPath}` : cleanPath;
        }
        const file2 = this.app.vault.getAbstractFileByPath(fullPath);
        if (file2 instanceof TFile) {
          return file2;
        }
      }
    }

    return null;
  }

  /**
   * Normalize a path with relative components
   */
  normalizePath(basePath: string, relativePath: string): string {
    const parts = basePath.split("/").filter(p => p);
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
  async uploadImage(file: TFile): Promise<string> {
    const arrayBuffer = await this.app.vault.readBinary(file);

    // Determine content type
    const ext = file.extension.toLowerCase();
    const contentTypes: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
    };
    const contentType = contentTypes[ext] || "image/png";

    // Build multipart/form-data body manually for requestUrl
    const boundary = "----ObsidianPaperStudio" + Date.now();
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${contentType}\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const headerBytes = new TextEncoder().encode(header);
    const footerBytes = new TextEncoder().encode(footer);
    const fileBytes = new Uint8Array(arrayBuffer);

    const body = new Uint8Array(headerBytes.length + fileBytes.length + footerBytes.length);
    body.set(headerBytes, 0);
    body.set(fileBytes, headerBytes.length);
    body.set(footerBytes, headerBytes.length + fileBytes.length);

    const response = await requestUrl({
      url: `${this.settings.apiUrl}/api/v1/upload-image`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: body.buffer,
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
  async processMarkdownImages(markdown: string, sourceFile: TFile | null): Promise<string> {
    const references = this.findImageReferences(markdown);

    if (references.length === 0) {
      return markdown;
    }

    let processed = markdown;
    let uploaded = 0;
    const total = references.length;
    const uploadedUrls = new Map<string, string>();

    for (const ref of references) {
      // Skip if we already uploaded this path
      if (uploadedUrls.has(ref.path)) {
        const url = uploadedUrls.get(ref.path)!;
        processed = processed.replace(ref.fullMatch, `![](${url})`);
        uploaded++;
        continue;
      }

      const file = this.resolveImageFile(ref.path, sourceFile, ref.isWikiStyle);

      if (!file) {
        // Can't resolve the file, leave a placeholder
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
        new Notice(`Uploading images... (${uploaded + 1}/${total})`);
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

  async doPublish(markdown: string, sourceFile: TFile | null, password?: string, forceNew: boolean = false) {
    // Show persistent loading notice (0 = persist until manually hidden)
    const loadingNotice = new Notice(
      forceNew ? "Publishing as new document..." : "Publishing to Paper Studio...",
      0
    );

    try {
      // Process images first
      const processedMarkdown = await this.processMarkdownImages(markdown, sourceFile);

      // Check for existing slug in frontmatter (unless forcing new)
      let existingSlug: string | null = null;
      if (!forceNew) {
        existingSlug = this.extractSlugFromFrontmatter(markdown);
        if (existingSlug) {
          loadingNotice.setMessage("Updating document...");
        }
      }

      const title = sourceFile?.basename || "Untitled";

      const response = await requestUrl({
        url: `${this.settings.apiUrl}/api/v1/publish`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.settings.apiKey}`,
        },
        body: JSON.stringify({
          markdown: processedMarkdown,
          title,
          password,
          slug: existingSlug,
        }),
      });

      if (response.status >= 400) {
        const errorData = response.json;

        // Handle not_found or not_owner errors
        if (errorData.error === "not_found" || errorData.error === "not_owner") {
          loadingNotice.hide();
          // Show confirmation modal to publish as new
          new ConfirmNewPublishModal(
            this.app,
            () => {
              // User confirmed: publish as new (without slug)
              void this.doPublish(markdown, sourceFile, password, true);
            },
            () => {
              // User cancelled
              new Notice("Publish cancelled");
            }
          ).open();
          return;
        }

        throw new Error(errorData.error || "Failed to publish");
      }

      const data = response.json;
      const fullUrl = `${this.settings.apiUrl}${data.url}`;

      // Update frontmatter with full URL if we have a source file
      if (sourceFile && data.slug) {
        const fullUrl = `${this.settings.apiUrl}/${data.slug}`;
        await this.updateFrontmatterWithUrl(sourceFile, fullUrl);
      }

      // Copy URL to clipboard
      await navigator.clipboard.writeText(fullUrl);

      // Hide loading notice and show success
      loadingNotice.hide();
      const protectedMsg = data.protected ? " (password protected)" : "";
      const actionMsg = data.updated ? "Updated" : "Published";
      new Notice(`${actionMsg}${protectedMsg}! Link copied to clipboard`);
    } catch (error) {
      // Hide loading notice and show error
      loadingNotice.hide();
      console.error("Paper Studio publish error:", error);
      new Notice(
        `Failed to publish: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

class PaperStudioSettingTab extends PluginSettingTab {
  plugin: PaperStudioPlugin;

  constructor(app: App, plugin: PaperStudioPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl).setName("Connection").setHeading();

    new Setting(containerEl)
      .setName("API key")
      .setDesc(
        "Your API key from paperstudio.ink. Find it in your account settings."
      )
      .addText((text) =>
        text
          .setPlaceholder("Paste key here")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("API URL")
      .setDesc("Server URL (change only for self-hosted instances)")
      .addText((text) =>
        text
          .setPlaceholder("https://paperstudio.ink")
          .setValue(this.plugin.settings.apiUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiUrl = value || DEFAULT_SETTINGS.apiUrl;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Usage").setHeading();
    containerEl.createEl("p", {
      text: 'Open a note and use the command palette (Ctrl/Cmd + P) to run "Publish to Paper Studio". The shareable link will be copied to your clipboard.',
    });

    new Setting(containerEl).setName("Images").setHeading();
    containerEl.createEl("p", {
      text: "Local images in your notes are automatically uploaded when publishing.",
    });
  }
}
