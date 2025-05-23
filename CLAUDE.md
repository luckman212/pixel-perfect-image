# Pixel Perfect Image Development Guidelines

## Project Overview

**Pixel Perfect Image** is an Obsidian plugin that provides advanced image management capabilities within notes. It allows users to resize images to exact pixel dimensions, perform file operations, and manage images through context menus and keyboard shortcuts.

### Key Features
- 📐 Pixel-perfect image resizing (percentages and custom widths)
- 📋 Mousewheel zoom support (Alt/Option + scroll)
- 📋 Copy image to clipboard
- 🔗 Copy local file path
- 📂 Show in Finder/Explorer
- 🖼️ Open in default system viewer
- 🎨 Open in external editors (Photoshop, Affinity Photo, etc.)
- ✏️ Rename images directly from context menu
- 🔄 Supports both Wikilinks (`![[image.png]]`) and Markdown (`![](image.png)`) formats
- 🔍 CMD/CTRL + click to open image in new tab

## Project Structure

```
pixel-perfect-image/
├── src/
│   ├── main.ts          # Core plugin logic (1301 lines)
│   └── settings.ts      # Settings management (314 lines)
├── images/              # Documentation screenshots
├── esbuild.config.mjs   # Build configuration
├── manifest.json        # Obsidian plugin manifest
├── versions.json        # Version compatibility tracking
├── version-bump.mjs     # Version sync utility
├── package.json         # Node.js dependencies
├── tsconfig.json        # TypeScript configuration
├── README.md           # User documentation
├── CLAUDE.md           # This file - development guidelines
└── LICENSE             # MIT License
```

## Core Components

### main.ts
- **PixelPerfectImagePlugin**: Main plugin class extending Obsidian Plugin
- **Context Menu Handler**: Manages right-click menu for images
- **Mousewheel Zoom**: Handles Alt+scroll resizing with debouncing
- **Image Operations**: Copy, show in system, rename, resize
- **Link Parsing**: Regex-based parsing for both wiki and markdown links
- **External Editor Integration**: Platform-specific paths and launching
- **Cache Management**: Image dimensions caching for performance

### settings.ts
- **PluginSettings Interface**: Configuration structure
- **SettingsTab**: UI for plugin preferences
- **Default Settings**: Initial configuration values
- **Platform Detection**: OS-specific external editor paths

## Technical Architecture

### Dependencies
- **Runtime**: Obsidian API (latest)
- **Development**: TypeScript 4.7.4, ESBuild, ESLint
- **Build Target**: ES2018, CommonJS format

### Key Patterns
1. **Event Registration**: All DOM events use `plugin.registerDomEvent` for proper cleanup
2. **Error Handling**: Comprehensive try-catch with user-friendly Notice messages
3. **Caching**: Image dimensions cached to avoid repeated file reads
4. **Platform Awareness**: Different behaviors for macOS/Windows/mobile
5. **Link Format Support**: Dual parsing for wiki and markdown syntax
6. **Debug Logging**: Conditional logging with `debugLog()` helper

### Image Link Formats
```markdown
# Wikilinks
![[image.png]]              # Basic
![[image.png|500]]          # With width
![[image.png|alt text]]     # With alt text
![[folder/image.png|500]]   # With path and width

# Markdown
![](image.png)              # Basic
![alt](image.png)           # With alt
![alt|500](image.png)       # With alt and width
```

## Build Commands
- `npm run dev` - Run development build with file watching
- `npm run build` - Build production version 
- `npm version patch` - Increment version (runs version-bump.mjs automatically)

## Code Style
- **TypeScript**: Use strict types with `strictNullChecks` enabled
- **Format**: 2-space indentation, single quotes for strings
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces
- **Error Handling**: Use try/catch with specific error messages in Notice
- **Debug**: Use `debugLog()` helper for debuggable logging (only shown when debugMode enabled)
- **Documentation**: JSDoc comments for public functions and complex logic
- **Types**: Avoid `any`, prefer specific type declarations
- **Imports**: Group imports by source (Obsidian first, then internal, then node)
- **Null Checks**: Use optional chaining (`?.`) and nullish coalescing (`??`) operators
- **DOM API**: Follow Obsidian API patterns, use plugin.registerDomEvent for event handling

## Obsidian-specific Patterns
- Register all event listeners with plugin.registerDomEvent or plugin.registerEvent
- Use Obsidian's Notice API for user notifications
- Follow Obsidian UI patterns for consistent user experience
- Access files through `app.vault` API
- Use `app.fileManager` for file operations
- Respect user's link preferences (wiki vs markdown)

## Testing & Quality
- No automated tests currently - rely on manual testing in Obsidian
- Use debug mode for troubleshooting issues
- Test on multiple platforms (Windows, macOS, mobile)
- Verify both wiki and markdown link formats
- Check external editor launching on each platform

## Known Compatibility Issues
- **Minimal Theme on Windows**: Image zoom can interfere with context menu
- **Image Converter Plugin**: Disable its right-click menu to avoid conflicts

## Performance Considerations
- Image dimensions are cached after first read
- Debounced mousewheel events to prevent excessive resizing
- Efficient regex patterns for link parsing
- Minimal DOM manipulation during resize operations

## Security Notes
- Never expose local file system paths in logs
- Validate all file paths before operations
- Use Obsidian's safe file APIs
- Sanitize user inputs for custom resize widths