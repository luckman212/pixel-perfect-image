# Pixel Perfect Image for Obsidian

A plugin for [Obsidian](https://obsidian.md) that enhances your image management experience. Right-click any image in your notes to access a powerful context menu that lets you view image details, resize with pixel-perfect accuracy, and perform various file operations. Whether you're writing documentation, creating study notes, or managing a digital garden, this plugin helps you maintain precise control over your images while streamlining your workflow with quick access to external editors and file operations.

## Features

- 🔍 View actual image dimensions and filename with a right-click
- 📐 Resize images to common percentages (100%, 50%, 25%)
- 🎯 Maintains pixel-perfect accuracy by calculating from original dimensions
- 📋 Copy image directly to clipboard
- 🔗 Copy local file path
- 📂 Show in Finder/Explorer
- 🖼️ Open in default system image viewer
- 🎨 Open in external editor (configurable)
- 💨 Fast performance with dimension caching
- 🖼️ Works with all image formats supported by Obsidian
- 🔄 Support for both wikilinks and standard Markdown image syntax

## Screenshot

[Place your screenshot here showing the right-click context menu on an image]

## How to Use

1. Install the plugin from Obsidian's Community Plugins
2. Right-click any image in your notes
3. You'll see:
   - The actual filename and dimensions of the image in pixels
   - Options to resize the image to common percentages
   - File operations (copy, open, show in system)
   - External editor integration

The plugin will automatically calculate the new width based on the original image dimensions, ensuring pixel-perfect scaling.

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

- **Show File Information**: Toggle display of filename and dimensions in context menu
- **External Editor Integration**:
  - Enable/disable external editor option in context menu
  - Configure external editor name and path
- **Debug Mode**: Enable to see detailed logs in the developer console

## Technical Details

- Resizing is non-destructive - it only modifies the width parameter in your Markdown links
- The plugin caches image dimensions to avoid repeated file reads
- Works with both wikilinks (![[image.png]]) and standard Markdown images (![](image.png))
- Supports complex image paths including subpaths and multiple parameters
- Platform-aware functionality for both macOS and Windows

## Support

If you encounter any issues or have feature requests, please file them on the [GitHub repository](https://github.com/yourusername/obsidian-pixel-perfect-image/issues).

## License

MIT
