import { Menu, MarkdownView, Notice, Plugin, TFile, App, normalizePath } from 'obsidian';
import { PixelPerfectImageSettings, DEFAULT_SETTINGS, PixelPerfectImageSettingTab } from './settings';
import { join } from 'path';
import { exec } from "child_process";
import { isMacPlatform } from './utils/platform';

// Used for "Show in Finder"
declare module 'obsidian' {
	interface App {
		showInFolder(path: string): void;
		openWithDefaultApp(path: string): void;
	}
}

/** Fixed percentages available for image resizing */
const RESIZE_PERCENTAGES = [100, 50, 25] as const;
/** Regular expression to match Obsidian image wikilinks: ![[image.png]] */
const WIKILINK_IMAGE_REGEX = /(!\[\[)([^\]]+)(\]\])/g;
/** Regular expressions to match both image link styles */
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

export default class PixelPerfectImage extends Plugin {
	settings: PixelPerfectImageSettings;
	/** Cache to store image dimensions to avoid repeated file reads */
	private dimensionCache = new Map<string, { width: number; height: number }>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new PixelPerfectImageSettingTab(this.app, this));
		this.registerImageContextMenu();
		this.debugLog('Plugin loaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Context Menu Handlers
	// ----------------------

	/**
	 * Registers a context menu handler for images in the editor.
	 * The menu provides options to view image dimensions and resize the image.
	 */
	private registerImageContextMenu(): void {
		this.registerDomEvent(document, 'contextmenu', async (ev: MouseEvent) => {
			const target = ev.target;
			if (!(target instanceof HTMLImageElement)) {
				return;
			}

			// Prevent default context menu to show our custom one
			ev.preventDefault();

			const menu = new Menu();
			await this.addDimensionsMenuItem(menu, target);
			this.addResizeMenuItems(menu, ev);
			
			// Add separator before file operations
			menu.addSeparator();
			
			// Add file operation items
			this.addFileOperationMenuItems(menu, target);

			menu.showAtPosition({ x: ev.pageX, y: ev.pageY });
		});
	}

	/**
	 * Adds an informational menu item showing the actual dimensions of the image.
	 * Reads dimensions from the image file in the vault.
	 * @param menu - The context menu to add the item to
	 * @param img - The HTML image element that was right-clicked
	 */
	private async addDimensionsMenuItem(menu: Menu, img: HTMLImageElement): Promise<void> {
		// Only add file info if the setting is enabled
		if (!this.settings.showFileInfo) return;

		try {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) return;

			const imgFile = this.getFileForImage(img, activeFile);
			if (!imgFile) {
				this.debugLog('Could not resolve image file');
				return;
			}

			const { width, height } = await this.readImageDimensions(imgFile);

			// Add filename menu item
			menu.addItem((item) => {
				item
					.setTitle(imgFile.name)
					.setIcon("image-file")
					.setDisabled(true);
			});

			// Add dimensions menu item
			menu.addItem((item) => {
				item
					.setTitle(`${width} × ${height} px`)
					.setIcon("info")
					.setDisabled(true);
			});
		} catch (error) {
			this.errorLog('Could not read dimensions:', error);
			new Notice("Could not read image dimensions");
		}
	}

	/**
	 * Adds resize percentage options to the context menu.
	 * Each option will resize the image to the specified percentage of its original size.
	 * @param menu - The context menu to add items to
	 * @param ev - The original mouse event
	 */
	private addResizeMenuItems(menu: Menu, ev: MouseEvent): void {
		// Add copy to clipboard option first
		menu.addItem((item) => {
			item.setTitle('Copy Image')
				.setIcon('copy')
				.onClick(async () => {
					try {
						await this.copyImageToClipboard(ev.target as HTMLImageElement);
						new Notice('Image copied to clipboard');
					} catch (error) {
						this.errorLog('Failed to copy image:', error);
						new Notice('Failed to copy image to clipboard');
					}
				});
		});

		// Add copy local path option
		menu.addItem((item) => {
			item.setTitle('Copy Local Path')
				.setIcon('link')
				.onClick(async () => {
					try {
						const activeFile = this.app.workspace.getActiveFile();
						if (!activeFile) return;
						
						const imgFile = this.getFileForImage(ev.target as HTMLImageElement, activeFile);
						if (!imgFile) {
							new Notice('Could not locate image file');
							return;
						}
						
						// @ts-ignore - Using Electron's __dirname global
						const vaultPath = (this.app.vault.adapter as any).basePath;
						const fullPath = join(vaultPath, normalizePath(imgFile.path));
						await navigator.clipboard.writeText(fullPath);
						new Notice('File path copied to clipboard');
					} catch (error) {
						this.errorLog('Failed to copy file path:', error);
						new Notice('Failed to copy file path');
					}
				});
		});

		// Add separator before resize options
		menu.addSeparator();

		// Add resize options
		RESIZE_PERCENTAGES.forEach(percentage => {
			menu.addItem((item) => {
				item.setTitle(`Resize to ${percentage}%`)
					.setIcon("image")
					.onClick(async () => {
						try {
							await this.resizeImage(ev, percentage);
						} catch (error) {
							this.errorLog('Failed to resize:', error);
							new Notice(`Failed to resize image to ${percentage}%`);
						}
					});
			});
		});
	}

	/**
	 * Adds file operation menu items like Show in Finder/Explorer and Open in Default App
	 */
	private addFileOperationMenuItems(menu: Menu, target: HTMLImageElement): void {
		// Add show in system explorer option
		menu.addItem((item) => {
			const isMac = this.isMacPlatform();
			item.setTitle(isMac ? 'Show in Finder' : 'Show in Explorer')
				.setIcon('folder-open')
				.onClick(async () => {
					try {
						const activeFile = this.app.workspace.getActiveFile();
						if (!activeFile) return;
						
						const imgFile = this.getFileForImage(target, activeFile);
						if (!imgFile) {
							new Notice('Could not locate image file');
							return;
						}
						
						this.app.showInFolder(imgFile.path);
					} catch (error) {
						this.errorLog('Failed to show in system explorer:', error);
						new Notice('Failed to open system explorer');
					}
				});
		});

		// Add open in default app option
		menu.addItem((item) => {
			item.setTitle('Open in Default App')
				.setIcon('open-elsewhere')
				.onClick(async () => {
					try {
						const activeFile = this.app.workspace.getActiveFile();
						if (!activeFile) return;
						
						const imgFile = this.getFileForImage(target, activeFile);
						if (!imgFile) {
							new Notice('Could not locate image file');
							return;
						}
						
						this.app.openWithDefaultApp(imgFile.path);
					} catch (error) {
						this.errorLog('Failed to open in default app:', error);
						new Notice('Failed to open in default app');
					}
				});
		});

		// Add external editor option if enabled
		if (this.settings.showExternalEditor) {
			menu.addItem((item) => {
				const editorName = this.settings.externalEditorName.trim() || "External Editor";
				item.setTitle(`Open in ${editorName}`)
					.setIcon("open-elsewhere")
					.onClick(async () => {
						try {
							const activeFile = this.app.workspace.getActiveFile();
							if (!activeFile) return;

							const imgFile = this.getFileForImage(target, activeFile);
							if (!imgFile) {
								new Notice("Could not locate image file");
								return;
							}
							this.openInExternalEditor(imgFile.path);
						} catch (error) {
							this.errorLog("Failed to open in external editor:", error);
							new Notice(`Failed to open image in ${editorName}`);
						}
					});
			});
		}
	}

	// Image Operations
	// ----------------

	/**
	 * Resizes an image in the editor by updating its wikilink width parameter.
	 * @param ev - Mouse event containing the target image
	 * @param percentage - Percentage to resize the image to
	 */
	private async resizeImage(ev: MouseEvent, percentage: number) {
		const img = ev.target as HTMLImageElement;
		const src = img.getAttribute('src') ?? "";

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			throw new Error("No active file in workspace to update a link.");
		}

		// Use getFileForImage instead of trying to resolve from alt text
		const imgFile = this.getFileForImage(img, activeFile);
		if (!imgFile) {
			throw new Error("Could not find the image file");
		}

		const { width } = await this.readImageDimensions(imgFile);
		const newWidth = Math.round((width * percentage) / 100);
		await this.updateImageLinkWidth(imgFile, newWidth);
	}

	/**
	 * Copies an image to the system clipboard
	 * @param targetImg - The HTML image element to copy
	 */
	private async copyImageToClipboard(targetImg: HTMLImageElement): Promise<void> {
		const img = new Image();
		img.crossOrigin = 'anonymous';

		return new Promise((resolve, reject) => {
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					const error = new Error('Failed to get canvas context');
					this.errorLog('Copy to clipboard failed:', error);
					reject(error);
					return;
				}

				ctx.drawImage(img, 0, 0);
				canvas.toBlob(async (blob) => {
					if (!blob) {
						const error = new Error('Failed to create blob');
						this.errorLog('Copy to clipboard failed:', error);
						reject(error);
						return;
					}
					try {
						const item = new ClipboardItem({ [blob.type]: blob });
						await navigator.clipboard.write([item]);
						resolve();
					} catch (error) {
						this.errorLog('Copy to clipboard failed:', error);
						reject(error);
					}
				});
			};

			img.onerror = () => {
				const error = new Error('Failed to load image');
				this.errorLog('Copy to clipboard failed:', error);
				reject(error);
			};

			img.src = targetImg.src;
		});
	}

	/**
	 * Updates the width parameter in wikilinks that reference a specific image.
	 * Handles complex wikilinks including subpaths and multiple parameters.
	 * @param imageFile - The image file being referenced
	 * @param newWidth - The new width to set in pixels
	 */
	private async updateImageLinkWidth(imageFile: TFile, newWidth: number) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			throw new Error('No active file, cannot update link.');
		}

		if (activeFile.path === imageFile.path) {
			return;
		}

		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) {
			throw new Error('No active MarkdownView to update.');
		}

		const editor = markdownView.editor;
		const docText = editor.getValue();

		let didChange = false;
		
		// First handle wiki-style links
		let replacedText = docText.replace(WIKILINK_IMAGE_REGEX, (_, opening, linkInner, closing) => {
			// Handle subpath components (e.g., #heading)
			let [linkWithoutHash, hashPart] = linkInner.split("#", 2);
			if (hashPart) hashPart = "#" + hashPart;

			// Split link path and parameters
			let [linkPath, ...pipeParams] = linkWithoutHash.split("|");

			const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, activeFile.path);
			if (!resolvedFile || resolvedFile.path !== imageFile.path) {
				return _;
			}

			pipeParams[0] = String(newWidth);

			const newLink = [linkPath, ...pipeParams].join("|");
			const updatedInner = hashPart ? `${newLink}${hashPart}` : newLink;

			didChange = true;
			return `${opening}${updatedInner}${closing}`;
		});

		// Then handle Markdown-style links
		replacedText = replacedText.replace(MARKDOWN_IMAGE_REGEX, (match, description, linkPath) => {
			// Split description and width parameter
			let [desc, ...pipeParams] = description.split("|");
			
			const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, activeFile.path);
			if (!resolvedFile || resolvedFile.path !== imageFile.path) {
				return match;
			}

			// If there's no description, use the filename without extension
			if (!desc) {
				desc = resolvedFile.basename;
			}

			// Update or add width parameter
			pipeParams[0] = String(newWidth);

			const newDescription = [desc, ...pipeParams].join("|");
			didChange = true;
			return `![${newDescription}](${linkPath})`;
		});

		if (didChange && replacedText !== docText) {
			try {
				editor.setValue(replacedText);
				this.debugLog(`Updated image size to ${newWidth}px in ${activeFile.path}`);
			} catch (error) {
				this.errorLog('Failed to update editor content:', error);
				throw new Error('Failed to update image width in editor');
			}
		}
	}

	/**
	 * Reads an image file from the vault and determines its dimensions.
	 * Uses a cache to avoid repeated file reads.
	 * @param file - The image file to read
	 * @returns Object containing width and height in pixels
	 */
	private async readImageDimensions(file: TFile): Promise<{ width: number; height: number }> {
		if (this.dimensionCache.has(file.path)) {
			return this.dimensionCache.get(file.path)!;
		}

		try {
			const data = await this.app.vault.readBinary(file);
			return new Promise((resolve, reject) => {
				const blob = new Blob([new Uint8Array(data)], { type: "image/*" });
				const url = URL.createObjectURL(blob);

				const tempImg = new Image();
				tempImg.onload = () => {
					URL.revokeObjectURL(url);
					const dimensions = { width: tempImg.width, height: tempImg.height };
					this.dimensionCache.set(file.path, dimensions);
					resolve(dimensions);
				};
				tempImg.onerror = (err) => {
					URL.revokeObjectURL(url);
					this.errorLog('Failed to load image for dimensions:', err);
					reject(new Error('Failed to load image'));
				};
				tempImg.src = url;
			});
		} catch (error) {
			this.errorLog('Failed to read image file:', error);
			throw error;
		}
	}

	// File & Path Utilities
	// ---------------------

	/**
	 * Resolves an HTML image element to its corresponding vault file.
	 * @param img - The HTML image element
	 * @param activeFile - The currently active file for path resolution
	 * @returns The corresponding TFile or null if not found
	 */
	private getFileForImage(img: HTMLImageElement, activeFile: TFile): TFile | null {
		const src = img.getAttribute('src') ?? "";
		let wikiLink = img.getAttribute('alt'); // e.g., "MyImage.png|200"

		// For Markdown-style images, try to parse the src attribute:
		const srcFileName = this.parseFileNameFromSrc(src);
		if (srcFileName) {
			const fileFromSrc = this.app.metadataCache.getFirstLinkpathDest(srcFileName, activeFile.path);
			if (fileFromSrc) {
				return fileFromSrc;
			}
		}

		// For wiki-style images (Obsidian puts "MyImage.png|width" in alt)
		if (wikiLink) {
			wikiLink = wikiLink.split("|")[0].trim();
			const fileFromLink = this.app.metadataCache.getFirstLinkpathDest(wikiLink, activeFile.path);
			if (fileFromLink) {
				return fileFromLink;
			}
		}
		return null;
	}

	/**
	 * Extracts a filename from an image's src attribute.
	 * Used as fallback when alt text is not available.
	 * @param src - The src attribute value
	 * @returns The extracted filename or null if not found
	 */
	private parseFileNameFromSrc(src: string): string | null {
		// Split off any query params (?xyz=...)
		const [pathWithoutQuery] = src.split("?");
		const slashIdx = pathWithoutQuery.lastIndexOf("/");
		if (slashIdx < 0 || slashIdx >= pathWithoutQuery.length - 1) {
			return null;
		}

		// Extract just the trailing filename portion
		let fileName = pathWithoutQuery.substring(slashIdx + 1);

		// Decode "%20" and other URL entities back into normal characters
		fileName = decodeURIComponent(fileName);

		return fileName;
	}

	// Platform & Debug Utilities
	// --------------------------

	private isMacPlatform(): boolean {
		return isMacPlatform();
	}

	/**
	 * Logs debug messages when debug mode is enabled in settings.
	 * Includes timestamp for better debugging.
	 * @param args - Arguments to log
	 */
	private debugLog(...args: any[]) {
		if (this.settings.debugMode) {
			const timestamp = new Date().toTimeString().split(' ')[0];
			console.log(`${timestamp}`, ...args);
		}
	}

	/**
	 * Logs error messages with timestamp.
	 * Always logs regardless of debug mode.
	 * @param args - Arguments to log
	 */
	private errorLog(...args: any[]) {
		const timestamp = new Date().toTimeString().split(' ')[0];
		console.error(`${timestamp}`, ...args);
	}

	// --- Add a helper function to launch external editor
	private openInExternalEditor(filePath: string) {
		const editorPath = this.settings.externalEditorPath;
		const editorName = this.settings.externalEditorName.trim() || "External Editor";
		if (!editorPath) {
			new Notice(`Please set your ${editorName} path in Pixel Perfect Image settings.`);
			return;
		}

		// 1. Get absolute path to the vault root
		const vaultPath = (this.app.vault.adapter as any).basePath;
		// 2. Combine vault root with the relative Obsidian path
		const absoluteFilePath = join(vaultPath, normalizePath(filePath));

		// 3. Choose command depending on macOS vs Windows
		let cmd: string;
		if (this.isMacPlatform()) {
			// On macOS, use `open -a "/Applications/Editor.app" "/path/to/file.png"`
			cmd = `open -a "${editorPath}" "${absoluteFilePath}"`;
		} else {
			// On Windows, quote-wrap the exe and file path
			cmd = `"${editorPath}" "${absoluteFilePath}"`;
		}

		exec(cmd, (error) => {
			if (error) {
				this.errorLog(`Error launching ${editorName}:`, error);
				new Notice(`Could not open file in ${editorName}.`);
			} else {
				this.debugLog(`Launched ${editorName}:`, cmd);
			}
		});
	}
}
