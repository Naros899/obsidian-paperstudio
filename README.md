# Paper Studio Obsidian Plugin

Publish your Obsidian notes to Paper Studio and get beautiful, shareable HTML documents.

## Installation

### Manual Installation

1. Build the plugin:
   ```bash
   cd obsidian-plugin
   npm install
   npm run build
   ```

2. Copy the following files to your Obsidian vault's `.obsidian/plugins/paperstudio/` folder:
   - `main.js`
   - `manifest.json`

3. Enable the plugin in Obsidian Settings > Community Plugins

## Setup

1. Go to [paperstudio.ink](https://paperstudio.ink) and sign up/log in
2. Go to Settings and click "Generate API Key"
3. Copy the API key (it's only shown once!)
4. In Obsidian, go to Settings > Paper Studio and paste your API key

## Usage

1. Open a note you want to publish
2. Open the command palette (Ctrl/Cmd + P)
3. Search for "Publish to Paper Studio"
4. Press Enter

The plugin will:
- **Upload local images** to Paper Studio (PNG, JPEG, GIF, WebP, SVG)
- Convert your markdown to beautiful HTML using your saved brand settings
- Publish it to Paper Studio
- Copy the shareable link to your clipboard

## Images

Local images in your notes are automatically uploaded when publishing:

- Wiki-style links: `![[screenshot.png]]` or `![[folder/image.png]]`
- Standard markdown: `![alt](image.png)` or `![alt](./images/diagram.png)`
- URL images are preserved as-is

Supported formats: PNG, JPEG, GIF, WebP, SVG

You'll see progress notifications like "Uploading images... (2/5)" during upload.

## Settings

- **API Key**: Your Paper Studio API key
- **API URL**: The Paper Studio server URL (only change for self-hosted instances)

## Brand Settings

Your documents will use the brand settings you configured on paperstudio.ink:
- Primary color
- Secondary color
- Background color
- Font
- Style (Professional, Creative, or Minimal)

To change these, go to Settings on paperstudio.ink.
