import {combineRgb, CompanionAdvancedFeedbackResult, CompanionFeedbackInfo} from '@companion-module/base';
import {ResolumeArenaModuleInstance} from '../../index';
import {compositionState, parameterStates} from '../../state';
import {MessageSubscriber} from '../../websocket';
import {CompanionCommonCallbackContext} from '@companion-module/base/dist/module-api/common';

export class ColumnUtils implements MessageSubscriber {
	private resolumeArenaInstance: ResolumeArenaModuleInstance;

	private initalLoadDone = false;
	private selectedColumn?: number;
	private connectedColumn?: number;
	private lastColumn?: number;

	// Per-column active feedback subscriptions
	private columnSelectedSubscriptions: Map<string, Set<string>> = new Map<string, Set<string>>();
	private columnConnectedSubscriptions: Map<string, Set<string>> = new Map<string, Set<string>>();
	private columnNameSubscriptions: Map<string, Set<string>> = new Map<string, Set<string>>();

	constructor(resolumeArenaInstance: ResolumeArenaModuleInstance) {
		this.resolumeArenaInstance = resolumeArenaInstance;
		this.resolumeArenaInstance.log('debug', 'ColumnUtils constructor called');
	}

	messageUpdates(data: {path: any, value: boolean}, isComposition: boolean) {
		if (isComposition || !this.initalLoadDone) {
			if (compositionState.get() !== undefined) {
				this.initConnectedFromComposition();
				this.initalLoadDone = true;
			}
		}
		if (data.path) {
			let matchName = data.path.match(/\/composition\/columns\/(\d+)\/name/);
			if (matchName) {
				const column = matchName[1];
				if (this.columnNameSubscriptions.has(column)) {
					this.resolumeArenaInstance.markFeedbackDirty('columnName');
				}
			}

			let matchConnect = data.path.match(/\/composition\/columns\/(\d+)\/connect/);
			if (matchConnect) {
				const column = matchConnect[1];
				if (data.value) {
					let match = data.path.match(/\/composition\/columns\/(\d+)\/connect/)[1];
					if (!match) {
						this.connectedColumn = match;
					} else {
						this.connectedColumn = this.selectedColumn;
					}
					this.resolumeArenaInstance.setVariableValues({connectedColumn: this.connectedColumn});
				}

				if (this.columnConnectedSubscriptions.has(column)) {
					this.resolumeArenaInstance.markFeedbackDirty('columnConnected');
				}
				// These summary name feedbacks are global; keep updating them when any connect changes
				this.resolumeArenaInstance.markFeedbackDirty('connectedColumnName', 'nextConnectedColumnName', 'previousConnectedColumnName');
			}

			let matchSelect = data.path.match(/\/composition\/columns\/(\d+)\/select/);
			if (matchSelect) {
				const column = matchSelect[1];
				if (data.value) {
					this.selectedColumn = column;
					this.resolumeArenaInstance.setVariableValues({selectedColumn: this.selectedColumn});
				}

				if (this.columnSelectedSubscriptions.has(column)) {
					this.resolumeArenaInstance.markFeedbackDirty('columnSelected');
				}
				// Global selected name feedbacks
				this.resolumeArenaInstance.markFeedbackDirty('selectedColumnName', 'nextSelectedColumnName', 'previousSelectedColumnName');
			}
		}
	}

	initConnectedFromComposition() {
		const columns = compositionState.get()?.columns;
		if (columns) {
			this.selectedColumn = undefined;
			for (const [columnIndex, columnObject] of columns.entries()) {
				const column = columnIndex + 1;
				// Always unsubscribe to avoid stale subscriptions
				this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/columns/' + column + '/select');
				this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/columns/' + column + '/connect');
				this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/columns/' + column + '/name');

				// Subscribe to individual paths only if there's an active feedback subscription for that column
				if (this.columnSelectedSubscriptions.has(column.toString())) {
					this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/columns/' + column + '/select');
				}
				if (this.columnConnectedSubscriptions.has(column.toString())) {
					this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/columns/' + column + '/connect');
				}
				if (this.columnNameSubscriptions.has(column.toString())) {
					this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/columns/' + column + '/name');
				}
				if (columnObject.selected?.value) {
					this.selectedColumn = column;
				}
				if (columnObject.connected?.value === 'Connected') {
					this.connectedColumn = column;
				}
				this.lastColumn = column;
			}
		}
		// Only mark feedbacks dirty if there are active subscribers
		if (this.columnConnectedSubscriptions.size > 0) {
			this.resolumeArenaInstance.markFeedbackDirty('columnConnected');
		}
		if (this.columnSelectedSubscriptions.size > 0) {
			this.resolumeArenaInstance.markFeedbackDirty('columnSelected');
		}
		if (this.columnNameSubscriptions.size > 0) {
			this.resolumeArenaInstance.markFeedbackDirty('columnName');
		}
		this.resolumeArenaInstance.markFeedbackDirty('selectedColumnName', 'nextSelectedColumnName', 'previousSelectedColumnName', 'connectedColumnName', 'nextConnectedColumnName', 'previousConnectedColumnName');
	}

	/////////////////////////////////////////////////
	// NAME
	/////////////////////////////////////////////////

	async columnNameFeedbackCallback(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext): Promise<CompanionAdvancedFeedbackResult> {
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (column !== undefined) {
			let text = parameterStates.get()['/composition/columns/' + column + '/name']?.value as string | undefined;
			return {text: text?.replace('#', column.toString())};
		}
		return {};
	}

	async columnNameFeedbackSubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (column !== undefined) {
			const id = column.toString();
			if (!this.columnNameSubscriptions.get(id)) {
				this.columnNameSubscriptions.set(id, new Set());
				this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/columns/' + column + '/name');
			}
			this.columnNameSubscriptions.get(id)?.add(feedback.id);
		}
	}

	async columnNameFeedbackUnsubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (column !== undefined) {
			const id = column.toString();
			const subs = this.columnNameSubscriptions.get(id);
			if (subs) {
				subs.delete(feedback.id);
				if (subs.size === 0) {
					this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/columns/' + column + '/name');
					this.columnNameSubscriptions.delete(id);
				}
			}
		}
	}

	/////////////////////////////////////////////////
	// SELECTED
	/////////////////////////////////////////////////

	async columnSelectedFeedbackCallback(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext): Promise<boolean> {
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (column !== undefined) {
			return parameterStates.get()['/composition/columns/' + column + '/select']?.value;
		}
		return false;
	}

	async columnSelectedFeedbackSubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (column !== undefined) {
			const id = column.toString();
			if (!this.columnSelectedSubscriptions.get(id)) {
				this.columnSelectedSubscriptions.set(id, new Set());
				this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/columns/' + column + '/select');
			}
			this.columnSelectedSubscriptions.get(id)?.add(feedback.id);
		}
	}

	async columnSelectedFeedbackUnsubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (column !== undefined) {
			const id = column.toString();
			const subs = this.columnSelectedSubscriptions.get(id);
			if (subs) {
				subs.delete(feedback.id);
				if (subs.size === 0) {
					this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/columns/' + column + '/select');
					this.columnSelectedSubscriptions.delete(id);
				}
			}
		}
	}

	/////////////////////////////////////////////////
	// SELECTED NAME
	/////////////////////////////////////////////////

	columnSelectedNameFeedbackCallback(_feedback: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult {
		if (this.selectedColumn !== undefined) {
			return {
				text: parameterStates.get()['/composition/columns/' + this.selectedColumn + '/name']?.value.replace('#', this.selectedColumn.toString()),
				bgcolor: combineRgb(0, 255, 255),
				color: combineRgb(0, 0, 0)
			};
		}
		return {};
	}

	/////////////////////////////////////////////////
	// NEXT SELECTED NAME
	/////////////////////////////////////////////////

	columnSelectedNextNameFeedbackCallback(feedback: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult {
		var add = feedback.options.next as number;
		if (this.selectedColumn !== undefined && this.lastColumn != undefined) {
			let column = this.calculateSelectedNextColumn(add);
			let text = parameterStates.get()['/composition/columns/' + column + '/name']?.value as string;
			if (text) {
				return {text: text.replace('#', column.toString())};
			} else {
				return {};
			}
		}
		return {};
	}

	calculateSelectedNextColumn(add: number): number {
		let column = +this.selectedColumn!;
		if (column + add > +this.lastColumn!) {
			column = column + add - +this.lastColumn!;
		} else {
			column += add;
		}
		return column;
	}

	/////////////////////////////////////////////////
	// PREVIOUS SELECTED NAME
	/////////////////////////////////////////////////

	columnSelectedPreviousNameFeedbackCallback(feedback: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult {
		var subtract = feedback.options.previous as number;
		if (this.selectedColumn !== undefined && this.lastColumn !== undefined) {
			let column = this.calculateSelectedPreviousColumn(subtract);
			let text = parameterStates.get()['/composition/columns/' + column + '/name']?.value as string;
			if (text) {
				return {text: text.replace('#', column.toString())};
			} else {
				return {};
			}
		}
		return {};
	}

	calculateSelectedPreviousColumn(subtract: number): number {
		let column = +this.selectedColumn!;
		if (column - subtract < 1) {
			column = +this.lastColumn! + column - subtract;
		} else {
			column = column - subtract;
		}
		return column;
	}

	/////////////////////////////////////////////////
	// CONNECTED
	/////////////////////////////////////////////////

	async columnConnectedFeedbackCallback(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext): Promise<boolean> {
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (column !== undefined) {
			return parameterStates.get()['/composition/columns/' + column + '/connect']?.value === 'Connected';
		}
		return false;
	}

	async columnConnectedFeedbackSubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (column !== undefined) {
			const id = column.toString();
			if (!this.columnConnectedSubscriptions.get(id)) {
				this.columnConnectedSubscriptions.set(id, new Set());
				this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/columns/' + column + '/connect');
			}
			this.columnConnectedSubscriptions.get(id)?.add(feedback.id);
		}
	}

	async columnConnectedFeedbackUnsubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (column !== undefined) {
			const id = column.toString();
			const subs = this.columnConnectedSubscriptions.get(id);
			if (subs) {
				subs.delete(feedback.id);
				if (subs.size === 0) {
					this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/columns/' + column + '/connect');
					this.columnConnectedSubscriptions.delete(id);
				}
			}
		}
	}


	/////////////////////////////////////////////////
	// CONNECTED NAME
	/////////////////////////////////////////////////

	columnConnectedNameFeedbackCallback(_feedback: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult {
		if (this.connectedColumn !== undefined) {
			return {
				text: parameterStates.get()['/composition/columns/' + this.connectedColumn + '/name']?.value.replace('#', this.connectedColumn.toString()),
				bgcolor: combineRgb(0, 255, 0),
				color: combineRgb(0, 0, 0)
			};
		}
		return {};
	}

	/////////////////////////////////////////////////
	// NEXT CONNECTED NAME
	/////////////////////////////////////////////////

	columnConnectedNextNameFeedbackCallback(feedback: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult {
		var add = feedback.options.next as number;
		if (this.connectedColumn !== undefined && this.lastColumn != undefined) {
			let column = this.calculateConnectedNextColumn(add);
			let text = parameterStates.get()['/composition/columns/' + column + '/name']?.value as string;
			if (text) {
				return {text: text.replace('#', column.toString())};
			} else {
				return {};
			}
		}
		return {};
	}

	calculateConnectedNextColumn(add: number): number {
		let column = +this.connectedColumn!;
		if (column + add > +this.lastColumn!) {
			column = column + add - +this.lastColumn!;
		} else {
			column += add;
		}
		return column;
	}

	/////////////////////////////////////////////////
	// PREVIOUS CONNECTED NAME
	/////////////////////////////////////////////////

	columnConnectedPreviousNameFeedbackCallback(feedback: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult {
		var subtract = feedback.options.previous as number;
		if (this.connectedColumn !== undefined && this.lastColumn !== undefined) {
			let column = this.calculateConnectedPreviousColumn(subtract);
			let text = parameterStates.get()['/composition/columns/' + column + '/name']?.value as string;
			if (text) {
				return {text: text.replace('#', column.toString())};
			} else {
				return {};
			}
		}
		return {};
	}

	calculateConnectedPreviousColumn(subtract: number): number {
		let column = +this.connectedColumn!;
		if (column - subtract < 1) {
			column = +this.lastColumn! + column - subtract;
		} else {
			column = column - subtract;
		}
		return column;
	}
}
