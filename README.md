# Pixel Perfect Image for Obsidian

A plugin for [Obsidian](https://obsidian.md) that helps you manage images in your notes. Right-click any image to view its details, resize it to exact pixel dimensions, or perform file operations like copying to clipboard or opening in external editors like Photoshop or Affinity Photo.

## Features

- 📐 **Pixel perfect resize:** Quickly resize images to pixel perfect percentages (100%, 50%, 25%)
- 📋️ **Mousewheel support:** Quick resize with mousewheel (hold Alt/Option and scroll)
- 📋 **Copy image to clipboard:** For quick paste into other programs
- 🔗 **Copy local file path to clipboard:** If you want to access the image from terminal
- 📂 **Show in Finder/Explorer:** Open file browser with your image selected
- 🖼️ **Open in default system viewer:** Open the image in your default application
- 🎨 **Open in External Editor:** Open the image directly in an external editor like Photoshop or Affinity Photo.
- 🔄 **Works with both Wikilinks and standard Markdown image links**

## Screenshot

![Screenshot](https://github.com/johansan/pixel-perfect-image/blob/main/images/screenshot1.png?raw=true)

## How to Use

1. Install the plugin from Obsidian's Community Plugins
2. Right-click an image in your notes
3. Available options:
   - View filename and dimensions
   - Resize to preset percentages
   - Copy, open, or show in system
   - Open in external editor
4. Quick resize with mousewheel:
   - Hold Alt key (Option on macOS) and scroll over an image
   - Scroll up to increase size, down to decrease
   - Modifier key can be changed in settings (Alt/Ctrl/Shift)
   - Zoom percentage can be adjusted in settings (default 20%)
   - Each scroll step changes size by the configured percentage of current width

The plugin calculates the new width based on the original image dimensions.

## Examples

Original wikilink:
```md
![[image.png]]
```

After resizing to 50%:
```md
![[image.png|500]]
```
(assuming the original image was 1000px wide)

## Installation

1. Open Obsidian Settings
2. Navigate to Community Plugins
3. Search for "Pixel Perfect Image"
4. Click Install
5. Enable the plugin

## Settings

![Settings](https://github.com/johansan/pixel-perfect-image/blob/main/images/screenshot2.png?raw=true)

## Known Issues

### Windows and Minimal Theme

When using Pixel Perfect Image on Windows PCs with the Minimal theme, the built-in image zoom can interfere with the right-click menu. To resolve this:

1. Install the Style Settings plugin
2. Go to Style Settings > Minimal > Images
3. Enable the "Disable image zoom" option

This will ensure the best experience with Pixel Perfect Image's right click menu.

### Image Converter Plugin Compatibility

If you're using the [Image Converter plugin](https://github.com/xryul/obsidian-image-converter), you should disable its "Right-click menu" option in settings to prevent conflicts with Pixel Perfect Image's context menu.

## Support

If you have any questions, suggestions, or issues, please open an issue on the [GitHub repository](https://github.com/johansan/pixel-perfect-image).

Enjoy using Pixel Perfect Image!
