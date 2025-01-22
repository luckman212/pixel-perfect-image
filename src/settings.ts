import { App, PluginSettingTab, Setting, Platform } from 'obsidian';
import PixelPerfectImage from './main';


export interface PixelPerfectImageSettings {
	debugMode: boolean;
	showFileInfo: boolean;
	showExternalEditor: boolean;
	externalEditorName: string;
	externalEditorPath: string;
	// Mousewheel zoom settings
	enableWheelZoom: boolean;
	wheelModifierKey: 'Alt' | 'Ctrl' | 'Shift';
	wheelZoomPercentage: number;
	invertScrollDirection: boolean;
}

export const DEFAULT_SETTINGS: PixelPerfectImageSettings = {
	debugMode: false,
	showFileInfo: true,
	showExternalEditor: true,
	externalEditorName: "",
	externalEditorPath: "",
	// Mousewheel zoom defaults
	enableWheelZoom: true,
	wheelModifierKey: 'Alt',
	wheelZoomPercentage: 20,
	invertScrollDirection: false
};

export class PixelPerfectImageSettingTab extends PluginSettingTab {
	plugin: PixelPerfectImage;

	constructor(app: App, plugin: PixelPerfectImage) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Show File Information")
			.setDesc("Show file name and dimensions in the context menu.")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.showFileInfo)
					.onChange(async (value: boolean) => {
						this.plugin.settings.showFileInfo = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Mousewheel Zoom')
			.setHeading();

		new Setting(containerEl)
			.setName("Enable Mousewheel Zoom")
			.setDesc("Hold modifier key and use mousewheel to resize images.")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.enableWheelZoom)
					.onChange(async (value: boolean) => {
						this.plugin.settings.enableWheelZoom = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Modifier Key")
			.setDesc("Key to hold while using mousewheel to zoom.")
			.addDropdown(dropdown => {
				const isMac = Platform.isMacOS;
				dropdown
					.addOption('Alt', isMac ? 'Option' : 'Alt')
					.addOption('Ctrl', 'Ctrl')
					.addOption('Shift', 'Shift')
					.setValue(this.plugin.settings.wheelModifierKey)
					.onChange(async (value: 'Alt' | 'Ctrl' | 'Shift') => {
						this.plugin.settings.wheelModifierKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Zoom Step Size")
			.setDesc("Percentage of current width to zoom per scroll step.")
			.addText(text => {
				text
					.setPlaceholder("20")
					.setValue(this.plugin.settings.wheelZoomPercentage.toString())
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (!isNaN(numValue) && numValue > 0) {
							this.plugin.settings.wheelZoomPercentage = numValue;
							await this.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName("Invert Scroll Direction")
			.setDesc("Invert the direction of mousewheel zooming.")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.invertScrollDirection)
					.onChange(async (value: boolean) => {
						this.plugin.settings.invertScrollDirection = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
		.setName('External Editor')
		.setHeading()

		new Setting(containerEl)
			.setName("Show Menu Option \"Edit in External Editor\"")
			.setDesc("Show the option to edit images in external editor in the context menu.")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.showExternalEditor)
					.onChange(async (value: boolean) => {
						this.plugin.settings.showExternalEditor = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("External Editor Name")
			.setDesc("Name of the external editor (e.g., Photoshop, Affinity Photo, etc.)")
			.addText(text => {
				text
					.setPlaceholder("Photoshop")
					.setValue(this.plugin.settings.externalEditorName)
					.onChange(async (value) => {
						this.plugin.settings.externalEditorName = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("External Editor Path")
			.setDesc("Full path to the external editor application/executable.")
			.addText(text => {
				const placeholder = Platform.isMacOS
					? "/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app"
					: "C:\\Program Files\\Adobe\\Adobe Photoshop 2025\\Photoshop.exe";
				text
					.setPlaceholder(placeholder)
					.setValue(this.plugin.settings.externalEditorPath)
					.onChange(async (value) => {
						const cleanedPath = value.replace(/\\ /g, ' ');
						this.plugin.settings.externalEditorPath = cleanedPath;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
		.setName('Developer')
		.setHeading()

		new Setting(containerEl)
			.setName("Debug Mode")
			.setDesc("Enable debug mode to log information to the console.")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.debugMode)
					.onChange(async (value: boolean) => {
						this.plugin.settings.debugMode = value;
						await this.plugin.saveSettings();
					});
			});

	}
	
} 