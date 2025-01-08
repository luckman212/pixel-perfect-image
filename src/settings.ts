import { App, PluginSettingTab, Setting } from 'obsidian';
import PixelPerfectImage from './main';
import { isMacPlatform } from './utils/platform';

export interface PixelPerfectImageSettings {
	debugMode: boolean;
	showFileInfo: boolean;
	showExternalEditor: boolean;
	externalEditorName: string;
	externalEditorPath: string;
}

export const DEFAULT_SETTINGS: PixelPerfectImageSettings = {
	debugMode: false,
	showFileInfo: true,
	showExternalEditor: true,
	externalEditorName: "",
	externalEditorPath: ""
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
				const placeholder = isMacPlatform()
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