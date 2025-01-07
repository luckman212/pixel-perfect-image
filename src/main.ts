import { App, Editor, Menu, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { PixelPerfectImageSettings, DEFAULT_SETTINGS, PixelPerfectImageSettingTab } from './settings';

// Constants for common values
const RESIZE_PERCENTAGES = [100, 50, 25] as const;
const IMAGE_WIKILINK_REGEX = /(!\[\[)([^\]]+)(\]\])/g;

export default class PixelPerfectImage extends Plugin {
	settings: PixelPerfectImageSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new PixelPerfectImageSettingTab(this.app, this));
		this.registerImageContextMenu();
		this.debugLog('Plugin loaded');
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
				this.debugLog('Could not find file for', alt);
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
			this.errorLog('Could not read dimensions:', error);
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
							this.errorLog('Failed to resize:', error);
							new Notice(`Failed to resize image to ${percentage}%`);
						}
					});
			});
		});
	}

	/**
	 * Logs debug messages if debug mode is enabled.
	 */
	private debugLog(...args: any[]) {
		if (this.settings.debugMode) {
			const timestamp = new Date().toTimeString().split(' ')[0];
			console.log(`${timestamp}`, ...args);
		}
	}

	/**
	 * Logs error messages.
	 */
	private errorLog(...args: any[]) {
		const timestamp = new Date().toTimeString().split(' ')[0];
		console.error(`${timestamp}`, ...args);
	}

	/**
	 * Re-usable method to resize the image by a given percentage.
	 */
	private async resizeImage(ev: MouseEvent, percentage: number) {
		const img = ev.target as HTMLImageElement;
		let alt = img.getAttribute('alt');
		const src = img.getAttribute('src') ?? "";

		// If the <img> tag doesn't have an explicit alt, attempt to parse the filename out of the src
		if (!alt) {
			alt = this.parseFileNameFromSrc(src);
			if (!alt) {
				throw new Error("Unable to determine the image name from alt or src.");
			}
		}

		// Identify the file that's currently being edited
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			throw new Error("No active file in workspace to update a link.");
		}

		// Attempt to resolve the image TFile via the alt text
		const imgFile = this.app.metadataCache.getFirstLinkpathDest(alt, activeFile.path);
		if (!imgFile) {
			throw new Error(`Could not find a TFile for '${alt}'`);
		}

		// Read the actual pixel dimensions of the image from the vault
		const { width } = await this.readImageDimensions(imgFile);

		// Compute the new width to insert into the link
		const newWidth = Math.round((width * percentage) / 100);

		// Update the wiki link in the current markdown file
		await this.updateImageLinkWidth(imgFile, newWidth);
	}

	/**
	 * Extract a filename from the "src" if the alt is missing.
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
	 */
	private async readImageDimensions(file: TFile): Promise<{ width: number; height: number }> {
		const data = await this.app.vault.readBinary(file);

		return new Promise((resolve, reject) => {
			const blob = new Blob([new Uint8Array(data)], { type: "image/*" });
			const url = URL.createObjectURL(blob);

			const tempImg = new Image();
			tempImg.onload = () => {
				URL.revokeObjectURL(url);
				resolve({ width: tempImg.width, height: tempImg.height });
			};
			tempImg.onerror = (err) => {
				URL.revokeObjectURL(url);
				reject(new Error('Failed to load image'));
			};
			tempImg.src = url;
		});
	}

	/**
	 * Updates the width parameter in wiki image links that reference the given image.
	 */
	private async updateImageLinkWidth(imageFile: TFile, newWidth: number) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			throw new Error('No active file, cannot update link.');
		}

		// If the current file is the same as the image file, there's no wiki link to update
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
			editor.setValue(replacedText);
			this.debugLog(`Updated image size to ${newWidth}px in ${activeFile.path}`);
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
