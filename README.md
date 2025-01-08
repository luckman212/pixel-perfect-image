# Pixel Perfect Image for Obsidian

A plugin for [Obsidian](https://obsidian.md) that helps you manage images in your notes. Right-click any image to view its details, resize it accurately, or perform file operations like copying to clipboard or opening in external editors.

## Features

- 📐 Resize images to pixel perfect percentages (100%, 50%, 25%)
- 📋 Copy image to clipboard
- 🔗 Copy file path to clipboard
- 📂 Show in Finder/Explorer
- 🖼️ Open in default system viewer
- 🎨 Open in external editor like Photoshop, Affinity Photo, etc.
- 🔄 Work with both wikilinks and standard Markdown images

## Screenshot

![screenshot](https://github.com/johansan/pixel-perfect-image/blob/main/images/screenshot1.png?raw=true)

## How to Use

1. Install the plugin from Obsidian's Community Plugins
2. Right-click an image in your notes
3. Available options:
   - View filename and dimensions
   - Resize to preset percentages
   - Copy, open, or show in system
   - Open in external editor

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

- **Show File Information**: Show/hide filename and dimensions in context menu
- **External Editor**:
  - Enable/disable external editor option
  - Set editor name and path
- **Debug Mode**: Log details to console for troubleshooting

## Support

If you have any questions, suggestions, or issues, please open an issue on the [GitHub repository](https://github.com/johansan/pixel-perfect-image).

Enjoy using Pixel Perfect Image!
