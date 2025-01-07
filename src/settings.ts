import { App, PluginSettingTab, Setting } from 'obsidian';
import PixelPerfectImagePlugin from './main';

export interface PixelPerfectImageSettings {
	debugMode: boolean;
}

export const DEFAULT_SETTINGS: PixelPerfectImageSettings = {
	debugMode: false
};

/**
 * Settings tab for the plugin that allows configuring various options
 */
export class PixelPerfectImageSettingTab extends PluginSettingTab {
	plugin: PixelPerfectImagePlugin;

	constructor(app: App, plugin: PixelPerfectImagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Pixel Perfect Image Settings' });

		new Setting(containerEl)
			.setName("Debug Mode")
			.setDesc("Enable detailed debug logging in the developer console. This is helpful for troubleshooting issues.")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.debugMode)
					.onChange(async (value: boolean) => {
						this.plugin.settings.debugMode = value;
						await this.plugin.saveSettings();
					});
			});

		containerEl.createEl('h3', { text: 'About' });
		const aboutDiv = containerEl.createDiv({ cls: 'setting-item-description' });
		aboutDiv.createSpan({ text: 'This plugin helps you resize images to their exact pixel dimensions, ensuring crisp rendering in your notes.' });
	}
} 