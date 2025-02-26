# Pixel Perfect Image Development Guidelines

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