import { App, Editor, Menu, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { PixelPerfectImageSettings, DEFAULT_SETTINGS, PixelPerfectImageSettingTab } from './settings';

// Constants for common values
const RESIZE_PERCENTAGES = [100, 50, 25] as const;
const IMAGE_WIKILINK_REGEX = /(!\[\[)([^\]]+)(\]\])/g;

export default class PixelPerfectImagePlugin extends Plugin {
	settings: PixelPerfectImageSettings;

	async onload() {
		this.debugLog('PixelPerfectImage: Plugin loading...');
		await this.loadSettings();

		this.addSettingTab(new PixelPerfectImageSettingTab(this.app, this));

		this.registerImageContextMenu();

		this.debugLog('PixelPerfectImage: Plugin loaded successfully');
	}

	/**
	 * Registers the context menu handler for images
	 */
	private registerImageContextMenu(): void {
		this.registerDomEvent(document, 'contextmenu', async (ev: MouseEvent) => {
			const target = ev.target;
			if (!(target instanceof HTMLImageElement)) {
				return;
			}

			this.debugLog('PixelPerfectImage: Right-click on image detected', target);

			// Prevent Obsidian's or the OS default context menu
			ev.preventDefault();

			const menu = new Menu();
			await this.addDimensionsMenuItem(menu, target);
			this.addResizeMenuItems(menu, ev);

			menu.showAtPosition({ x: ev.pageX, y: ev.pageY });
		});
	}

	/**
	 * Adds the dimensions info item to the context menu if available
	 */
	private async addDimensionsMenuItem(menu: Menu, img: HTMLImageElement): Promise<void> {
		try {
			const alt = img.getAttribute('alt') ?? this.parseFileNameFromSrc(img.getAttribute('src') ?? "");
			if (!alt) {
				return;
			}

			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				return;
			}

			const imgFile = this.app.metadataCache.getFirstLinkpathDest(alt, activeFile.path);
			if (!imgFile) {
				this.debugLog('warn', `PixelPerfectImage: Could not find a TFile for '${alt}'`);
				return;
			}

			const { width, height } = await this.readImageDimensions(imgFile);
			menu.addItem((item) => {
				item
					.setTitle(`Dimensions: ${width} × ${height} px`)
					.setIcon("info")
					.setDisabled(true);
			});
		} catch (error) {
			this.debugLog('error', "PixelPerfectImage: Could not read dimensions for the image:", error);
			new Notice("Could not read image dimensions");
		}
	}

	/**
	 * Adds the resize options to the context menu
	 */
	private addResizeMenuItems(menu: Menu, ev: MouseEvent): void {
		RESIZE_PERCENTAGES.forEach(percentage => {
			menu.addItem((item) => {
				item.setTitle(`Resize to ${percentage}%`)
					.setIcon("image")
					.onClick(async () => {
						try {
							await this.resizeImage(ev, percentage);
						} catch (error) {
							this.debugLog('error', `Error resizing to ${percentage}%:`, error);
							new Notice(`Failed to resize image to ${percentage}%`);
						}
					});
			});
		});
	}

	/**
	 * Logs debug messages if debug mode is enabled.
	 * @param levelOrMessage The log level ('log', 'warn', 'error') or the message if level is 'log'
	 * @param args Additional arguments to log
	 */
	private debugLog(levelOrMessage: 'log' | 'warn' | 'error' | any, ...args: any[]) {
		if (!this.settings?.debugMode) {
			return;
		}

		let level: 'log' | 'warn' | 'error' = 'log';
		let logArgs = [];

		if (levelOrMessage === 'log' || levelOrMessage === 'warn' || levelOrMessage === 'error') {
			level = levelOrMessage;
			logArgs = args;
		} else {
			logArgs = [levelOrMessage, ...args];
		}

		switch (level) {
			case 'warn':
				console.warn(...logArgs);
				break;
			case 'error':
				console.error(...logArgs);
				break;
			default:
				console.log(...logArgs);
		}
	}

	/**
	 * Re-usable method to resize the image by a given percentage.
	 * @param ev The mouse event that triggered the resize
	 * @param percentage The percentage to resize the image to
	 * @throws Error if the image cannot be resized
	 */
	private async resizeImage(ev: MouseEvent, percentage: number) {
		const img = ev.target as HTMLImageElement;
		let alt = img.getAttribute('alt');
		const src = img.getAttribute('src') ?? "";

		this.debugLog('PixelPerfectImage: alt/src attributes:', { alt, src });

		// If the <img> tag doesn't have an explicit alt, attempt to parse the filename out of the src
		if (!alt) {
			alt = this.parseFileNameFromSrc(src);
			if (!alt) {
				const error = "Unable to determine the image name from alt or src.";
				this.debugLog('warn', "PixelPerfectImage: " + error);
				throw new Error(error);
			}
			this.debugLog(`PixelPerfectImage: Derived alt from src -> ${alt}`);
		}

		// Identify the file that's currently being edited
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			const error = "No active file in workspace to update a link.";
			this.debugLog('warn', "PixelPerfectImage: " + error);
			throw new Error(error);
		}

		this.debugLog("PixelPerfectImage: Active file path:", activeFile.path);

		// Attempt to resolve the image TFile via the alt text
		const imgFile = this.app.metadataCache.getFirstLinkpathDest(alt, activeFile.path);
		this.debugLog("PixelPerfectImage: Found image file:", imgFile);

		if (!imgFile) {
			const error = `Could not find a TFile for '${alt}'`;
			this.debugLog('warn', `PixelPerfectImage: ${error}`);
			throw new Error(error);
		}

		// Read the actual pixel dimensions of the image from the vault
		const { width } = await this.readImageDimensions(imgFile);
		this.debugLog('PixelPerfectImage: Actual image width:', width);

		// Compute the new width to insert into the link
		const newWidth = Math.round((width * percentage) / 100);

		// Update the wiki link in the current markdown file
		await this.updateImageLinkWidth(imgFile, newWidth);
	}

	/**
	 * Extract a filename from the "src" if the alt is missing.
	 * @param src The src attribute of the image
	 * @returns The extracted filename or null if not found
	 */
	private parseFileNameFromSrc(src: string): string | null {
		const [pathWithoutQuery] = src.split("?");
		const slashIdx = pathWithoutQuery.lastIndexOf("/");
		if (slashIdx < 0 || slashIdx === pathWithoutQuery.length - 1) {
			return null;
		}
		const fileName = pathWithoutQuery.substring(slashIdx + 1);
		return fileName || null;
	}

	/**
	 * Load the binary data of the image from vault and measure its real width/height.
	 * @param file The TFile representing the image
	 * @returns Promise resolving to the image dimensions
	 * @throws Error if the image cannot be loaded or measured
	 */
	private async readImageDimensions(file: TFile): Promise<{ width: number; height: number }> {
		this.debugLog('PixelPerfectImage: Reading image dimensions for file:', file.path);
		const data = await this.app.vault.readBinary(file);
		this.debugLog('PixelPerfectImage: Binary read, size:', data.byteLength);

		return new Promise((resolve, reject) => {
			const blob = new Blob([new Uint8Array(data)], { type: "image/*" });
			const url = URL.createObjectURL(blob);

			this.debugLog('PixelPerfectImage: Created blob URL:', url);

			const tempImg = new Image();
			tempImg.onload = () => {
				URL.revokeObjectURL(url); // Clean up the blob URL
				this.debugLog('PixelPerfectImage: Finished loading image:', { width: tempImg.width, height: tempImg.height });
				resolve({ width: tempImg.width, height: tempImg.height });
			};
			tempImg.onerror = (err) => {
				URL.revokeObjectURL(url); // Clean up the blob URL
				this.debugLog('error', 'PixelPerfectImage: Error loading image blob:', err);
				reject(new Error('Failed to load image'));
			};
			tempImg.src = url;
		});
	}

	/**
	 * Updates the width parameter in wiki image links that reference the given image.
	 * @param imageFile The TFile representing the image to update links for
	 * @param newWidth The new width to set in the links
	 * @throws Error if the active file cannot be found or updated
	 */
	private async updateImageLinkWidth(imageFile: TFile, newWidth: number) {
		this.debugLog('PixelPerfectImage: Updating links for', { path: imageFile.path, newWidth });

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			throw new Error('No active file, cannot update link.');
		}

		// If the current file is the same as the image file, there's no wiki link to update
		if (activeFile.path === imageFile.path) {
			this.debugLog('PixelPerfectImage: The active file is the image itself, skipping.');
			return;
		}

		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) {
			throw new Error('No active MarkdownView to update.');
		}

		const editor = markdownView.editor;
		const docText = editor.getValue();
		this.debugLog('PixelPerfectImage: Document text length:', docText.length);

		let didChange = false;

		const replacedText = docText.replace(IMAGE_WIKILINK_REGEX, (_, opening, linkInner, closing) => {
			// Split any subpath like "#something"
			let [ linkWithoutHash, hashPart ] = linkInner.split("#", 2);
			if (hashPart) hashPart = "#" + hashPart;

			// Split the portion before any '|' into (path) and after '|' is width or other params
			let [ linkPath, ...pipeParams ] = linkWithoutHash.split("|");

			// Use Obsidian's link resolution to see if this references our imageFile
			const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, activeFile.path);
			if (!resolvedFile || resolvedFile.path !== imageFile.path) {
				return _;
			}

			// Update the width parameter
			pipeParams[0] = String(newWidth);

			// Rebuild the link
			const newLink = [linkPath, ...pipeParams].join("|");
			const updatedInner = hashPart ? `${newLink}${hashPart}` : newLink;

			didChange = true;
			return `${opening}${updatedInner}${closing}`;
		});

		if (didChange && replacedText !== docText) {
			this.debugLog('PixelPerfectImage: Link text changed. Updating editor...');
			editor.setValue(replacedText);
		} else {
			this.debugLog('PixelPerfectImage: No applicable links changed.');
		}
	}

	/**
	 * Loads plugin settings from disk
	 */
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * Saves plugin settings to disk
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}
}
