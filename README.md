# Pixel Perfect Image for Obsidian

A plugin for [Obsidian](https://obsidian.md) that helps you manage images in your notes. Right-click any image to view its details, resize it to exact pixel dimensions, or perform file operations like copying to clipboard or opening in external editors like Photoshop or Affinity Photo.

## Features

- 📐 **Pixel perfect resize:** Quickly resize images to pixel perfect percentages (100%, 50%, 25%) or a custom width in pixels
- 📋️ **Mousewheel support:** Quick resize with mousewheel (hold Alt/Option and scroll)
- 📋 **Copy image to clipboard:** For quick paste into other programs
- 🔗 **Copy local file path to clipboard:** If you want to access the image from terminal
- 📂 **Show in Finder/Explorer:** Open file browser with your image selected
- 🖼️ **Open in default system viewer:** Open the image in your default application
- 🎨 **Open in External Editor:** Open the image directly in an external editor like Photoshop or Affinity Photo
- ✏️ **Rename images:** Quickly rename image files right from the context menu
- 🔄 **Works with both Wikilinks and standard Markdown image links**
- 🔍 **Quick open in new tab:** CMD/CTRL + click to open image in new tab

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
   - Rename image files
4. Quick resize with mousewheel:
   - Hold Alt key (Option on macOS) and scroll over an image
   - Scroll up to increase size, down to decrease
   - Modifier key can be changed in settings (Alt/Ctrl/Shift)
   - Zoom percentage can be adjusted in settings (default 20%)
   - Each scroll step changes size by the configured percentage of current width
5. Quick actions:
   - CMD/CTRL + click: Open image in new tab

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

Using custom resize width:
```md
![[image.png|600]]
```
(setting exact width to 600 pixels)

## Installation

1. Open Obsidian Settings
2. Navigate to Community Plugins
3. Search for "Pixel Perfect Image"
4. Click Install
5. Enable the plugin

## Settings

![Settings](https://github.com/johansan/pixel-perfect-image/blob/main/images/screenshot2.png?raw=true)

The plugin offers several settings to customize its behavior:

- **Menu options:**
  - Show file information in context menu
  - Show "Show in Explorer/Finder" option
  - Show rename option
  - Show "Open in new tab" option
  - Show "Open in default app" option
  - Show resize options
  - Custom resize width in pixels
- **Mousewheel zoom:**
  - Enable/disable mousewheel zoom
  - Choose modifier key (Alt/Ctrl/Shift)
  - Adjust zoom step size
  - Invert scroll direction
- **External editor:** 
  - Set editor name
  - Configure path to external image editor (platform-specific)
- **Developer options:**
  - Debug mode for troubleshooting

## Known Issues

### Windows and Minimal Theme

When using Pixel Perfect Image on Windows PCs with the Minimal theme, the built-in image zoom can interfere with the right-click menu. To resolve this:

1. Install the Style Settings plugin
2. Go to Style Settings > Minimal > Images
3. Enable the "Disable image zoom" option

This will ensure the best experience with Pixel Perfect Image's right click menu.

## Support

If you have any questions, suggestions, or issues, please open an issue on the [GitHub repository](https://github.com/johansan/pixel-perfect-image).

Enjoy using Pixel Perfect Image!
