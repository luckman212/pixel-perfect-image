# Pixel Perfect Image for Obsidian

A plugin for [Obsidian](https://obsidian.md) that helps you resize images to their exact pixel dimensions. Right-click any image in your notes to view its actual dimensions and quickly resize it to common percentages.

## Features

- 🔍 View actual image dimensions with a right-click
- 📐 Resize images to common percentages (100%, 50%, 25%)
- 🎯 Maintains pixel-perfect accuracy by calculating from original dimensions
- 💨 Fast performance with dimension caching
- 🖼️ Works with all image formats supported by Obsidian

## Screenshot

[Place your screenshot here showing the right-click context menu on an image]

## How to Use

1. Install the plugin from Obsidian's Community Plugins
2. Right-click any image in your notes
3. You'll see:
   - The actual dimensions of the image in pixels
   - Options to resize the image to common percentages

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

- Debug Mode: Enable to see detailed logs in the developer console (useful for troubleshooting)

## Technical Details

- Resizing is non-destructive - it only modifies the width parameter in your Markdown links
- The plugin caches image dimensions to avoid repeated file reads
- Works with both simple image links and complex ones with subpaths or additional parameters

## Support

If you encounter any issues or have feature requests, please file them on the [GitHub repository](https://github.com/yourusername/obsidian-pixel-perfect-image/issues).

## License

MIT
