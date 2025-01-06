import { App, Editor, Plugin, PluginSettingTab, Setting, Menu, MarkdownView, TFile } from 'obsidian';

interface PixelPerfectImageSettings {
	modifierKey: 'Cmd' | 'Ctrl' | 'Alt' | 'Shift';
}

const DEFAULT_SETTINGS: PixelPerfectImageSettings = {
	modifierKey: 'Cmd'
}

export default class PixelPerfectImagePlugin extends Plugin {
	settings: PixelPerfectImageSettings;

	async onload() {
		await this.loadSettings();

		// Register click handler
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			const modifierPressed = 
				(this.settings.modifierKey === 'Cmd' && evt.metaKey) ||
				(this.settings.modifierKey === 'Ctrl' && evt.ctrlKey) ||
				(this.settings.modifierKey === 'Alt' && evt.altKey) ||
				(this.settings.modifierKey === 'Shift' && evt.shiftKey);

			if (modifierPressed) {
				this.handleImageClick(evt);
			}
		});

		// Add settings tab
		this.addSettingTab(new PixelPerfectImageSettingTab(this.app, this));
	}

	async resizeImage(editor: Editor, line: number) {
		const lineContent = editor.getLine(line);
		const wikiImageRegex = /!\[\[(.*?)\]\]/;
		const markdownImageRegex = /!\[(.*?)\]\((.*?)\)/;
		
		let imagePath: string | null = null;
		let isWikiLink = false;

		// Extract image path
		if (wikiImageRegex.test(lineContent)) {
			imagePath = lineContent.match(wikiImageRegex)![1].split('|')[0];
			isWikiLink = true;
		} else if (markdownImageRegex.test(lineContent)) {
			imagePath = lineContent.match(markdownImageRegex)![2].split('|')[0];
		}

		if (!imagePath) return;

		// Get image size
		const abstractFile = this.app.vault.getAbstractFileByPath(imagePath);
		if (!(abstractFile instanceof TFile)) return;
		
		const imageUrl = this.app.vault.getResourcePath(abstractFile);
		
		try {
			const size = await this.getImageSize(imageUrl);
			const width = Math.round(size.width);

			// Update the line with the width
			let newLine: string;
			if (isWikiLink) {
				newLine = lineContent.replace(wikiImageRegex, `![[${imagePath}|${width}]]`);
			} else {
				newLine = lineContent.replace(markdownImageRegex, `![](${imagePath}|${width})`);
			}
			
			editor.setLine(line, newLine);
		} catch (error) {
			console.error('Failed to get image size:', error);
		}
	}

	private getImageSize(url: string): Promise<{ width: number; height: number }> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
			img.onerror = reject;
			img.src = url;
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async handleImageClick(evt: MouseEvent) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		const editor = view.editor;
		const pos = editor.getCursor();
		if (!pos) return;

		const lineContent = editor.getLine(pos.line);

		// Check if cursor is on an image link
		const wikiImageRegex = /!\[\[(.*?)\]\]/;
		const markdownImageRegex = /!\[(.*?)\]\((.*?)\)/;
		
		if (!wikiImageRegex.test(lineContent) && !markdownImageRegex.test(lineContent)) return;

		await this.resizeImage(editor, pos.line);
		evt.preventDefault();
	}
}

class PixelPerfectImageSettingTab extends PluginSettingTab {
	plugin: PixelPerfectImagePlugin;

	constructor(app: App, plugin: PixelPerfectImagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Modifier Key')
			.setDesc('Which modifier key to hold while clicking to resize images')
			.addDropdown(dropdown => 
				dropdown
					.addOptions({
						'Cmd': 'Command (Mac) / Windows Key',
						'Ctrl': 'Control',
						'Alt': 'Alt/Option',
						'Shift': 'Shift'
					})
					.setValue(this.plugin.settings.modifierKey)
					.onChange(async (value: 'Cmd' | 'Ctrl' | 'Alt' | 'Shift') => {
						this.plugin.settings.modifierKey = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
