import { Modal, App } from 'obsidian';

export class FileNameInputModal extends Modal {
	private result: string | null = null;
	private readonly onSubmit: (result: string | null) => void;
	private readonly originalName: string;

	constructor(app: App, originalName: string, onSubmit: (result: string | null) => void) {
		super(app);
		this.originalName = originalName;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('pixel-perfect-rename-modal');

		contentEl.createEl("h2", { 
			text: "Rename image",
			cls: 'modal-title'
		});

		const form = contentEl.createEl("form");
		form.addClass('pixel-perfect-rename-form');

		const input = form.createEl("input", {
			type: "text",
			value: this.originalName,
			cls: 'pixel-perfect-rename-input'
		});
		
		// Select filename without extension
		const lastDotIndex = this.originalName.lastIndexOf('.');
		if (lastDotIndex > 0) {
			const nameWithoutExt = this.originalName.substring(0, lastDotIndex);
			input.setSelectionRange(0, nameWithoutExt.length);
		}

		const buttonContainer = form.createDiv();
		buttonContainer.addClass('pixel-perfect-button-container');

		const submitButton = buttonContainer.createEl("button", { 
			text: "Rename",
			type: "submit",
			cls: 'mod-cta' // Add Obsidian's accent class
		});
		
		const cancelButton = buttonContainer.createEl("button", { 
			text: "Cancel",
			type: "button"
		});
		
		cancelButton.addEventListener("click", () => {
			this.onSubmit(null);
			this.close();
		});

		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const newName = input.value.trim();
			if (newName && newName !== this.originalName) {
				this.onSubmit(newName);
			} else {
				this.onSubmit(null);
			}
			this.close();
		});

		input.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		if (this.result === undefined) {
			this.onSubmit(null);
		}
	}
}