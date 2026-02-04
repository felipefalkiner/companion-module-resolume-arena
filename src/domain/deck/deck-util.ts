import {CompanionAdvancedFeedbackResult, CompanionFeedbackInfo, combineRgb} from '@companion-module/base';
import {ResolumeArenaModuleInstance} from '../../index';
import {compositionState, parameterStates} from '../../state';
import {MessageSubscriber} from '../../websocket';
import {CompanionCommonCallbackContext} from '@companion-module/base/dist/module-api/common';

export class DeckUtils implements MessageSubscriber {
	private resolumeArenaInstance: ResolumeArenaModuleInstance;

	private initalLoadDone = false;
	private selectedDeck?: number;
	private selectedDeckName?: string;
	private lastDeck?: number;

	// Per-deck active feedback subscriptions
	private deckSelectedSubscriptions: Map<string, Set<string>> = new Map<string, Set<string>>();
	private deckNameSubscriptions: Map<string, Set<string>> = new Map<string, Set<string>>();

	constructor(resolumeArenaInstance: ResolumeArenaModuleInstance) {
		this.resolumeArenaInstance = resolumeArenaInstance;
		this.resolumeArenaInstance.log('debug', 'DeckUtils constructor called');
	}

	messageUpdates(data: {path: any}, isComposition: boolean) {
		if (isComposition || !this.initalLoadDone) {
			if (compositionState.get() !== undefined) {
				this.initConnectedFromComposition();
				this.initalLoadDone = true;
			}
		}
		if (data.path) {
			let matchName = data.path.match(/\/composition\/decks\/(\d+)\/name/);
			if (matchName) {
				const deck = matchName[1];
				if (this.deckNameSubscriptions.has(deck)) {
					this.resolumeArenaInstance.markFeedbackDirty('deckName');
				}
			}
			let matchSelect = data.path.match(/\/composition\/decks\/(\d+)\/select/);
			if (matchSelect) {
				const deck = matchSelect[1];
				// Use parameter state to determine selection
				if (parameterStates.get()['/composition/decks/' + deck + '/select']?.value) {
					this.selectedDeck = deck;
					this.selectedDeckName = parameterStates.get()['/composition/decks/' + deck + '/name']?.value;
					this.resolumeArenaInstance.setVariableValues({selectedDeck: this.selectedDeck});
				}
				if (this.deckSelectedSubscriptions.has(deck)) {
					this.resolumeArenaInstance.markFeedbackDirty('deckSelected');
				}
				// Global selected/deck name summary feedbacks
				this.resolumeArenaInstance.markFeedbackDirty('selectedDeckName', 'nextDeckName', 'previousDeckName');
			}
		}
	}

	initConnectedFromComposition() {
		const decks = compositionState.get()?.decks;
		if (decks) {
			this.selectedDeck = undefined;
			for (const [deckIndex, deckObject] of decks.entries()) {
				const deck = deckIndex + 1;
				// Always unsubscribe to avoid stale subscriptions
				this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/decks/' + deck + '/selected');
				this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/decks/' + deck + '/name');

				// Subscribe only if we have active subscriptions for this deck
				if (this.deckSelectedSubscriptions.has(deck.toString())) {
					this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/decks/' + deck + '/selected');
				}
				if (this.deckNameSubscriptions.has(deck.toString())) {
					this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/decks/' + deck + '/name');
				}
				if (deckObject.selected?.value) {
					this.selectedDeck = deck;
					this.selectedDeckName = deckObject.name?.value;
				}
				this.lastDeck = deck;
			}
		}
		if (this.deckSelectedSubscriptions.size > 0) {
			this.resolumeArenaInstance.markFeedbackDirty('deckSelected');
		}
		if (this.deckNameSubscriptions.size > 0) {
			this.resolumeArenaInstance.markFeedbackDirty('deckName');
		}
		this.resolumeArenaInstance.markFeedbackDirty('selectedDeckName', 'nextDeckName', 'previousDeckName');
	}

	/////////////////////////////////////////////////
	// SELECTED
	/////////////////////////////////////////////////

	async deckSelectedFeedbackCallback(feedback: CompanionFeedbackInfo): Promise<boolean> {
		const deck = +await this.resolumeArenaInstance.parseVariablesInString(feedback.options.deck as string);
		if (deck !== undefined) {
			return parameterStates.get()['/composition/decks/' + deck + '/select']?.value;
		}
		return false;
	}

	async deckSelectedFeedbackSubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const deck = +await context.parseVariablesInString(feedback.options.deck as string);
		if (deck !== undefined) {
			const id = deck.toString();
			if (!this.deckSelectedSubscriptions.get(id)) {
				this.deckSelectedSubscriptions.set(id, new Set());
				this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/decks/' + deck + '/selected');
			}
			this.deckSelectedSubscriptions.get(id)?.add(feedback.id);
		}
	}

	async deckSelectedFeedbackUnsubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const deck = +await context.parseVariablesInString(feedback.options.deck as string);
		if (deck !== undefined) {
			const id = deck.toString();
			const subs = this.deckSelectedSubscriptions.get(id);
			if (subs) {
				subs.delete(feedback.id);
				if (subs.size === 0) {
					this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/decks/' + deck + '/selected');
					this.deckSelectedSubscriptions.delete(id);
				}
			}
		}
	}

	/////////////////////////////////////////////////
	// NAME
	/////////////////////////////////////////////////

	async deckNameFeedbackCallback(feedback: CompanionFeedbackInfo): Promise<CompanionAdvancedFeedbackResult> {
		const deck = +await this.resolumeArenaInstance.parseVariablesInString(feedback.options.deck as string);
		if (deck !== undefined) {
			return {text: parameterStates.get()['/composition/decks/' + deck + '/name']?.value};
		}
		return {};
	}

	async deckNameFeedbackSubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const deck = +await context.parseVariablesInString(feedback.options.deck as string);
		if (deck !== undefined) {
			const id = deck.toString();
			if (!this.deckNameSubscriptions.get(id)) {
				this.deckNameSubscriptions.set(id, new Set());
				this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/decks/' + deck + '/name');
			}
			this.deckNameSubscriptions.get(id)?.add(feedback.id);
		}
	}

	async deckNameFeedbackUnsubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const deck = +await context.parseVariablesInString(feedback.options.deck as string);
		if (deck !== undefined) {
			const id = deck.toString();
			const subs = this.deckNameSubscriptions.get(id);
			if (subs) {
				subs.delete(feedback.id);
				if (subs.size === 0) {
					this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/decks/' + deck + '/name');
					this.deckNameSubscriptions.delete(id);
				}
			}
		}
	}

	/////////////////////////////////////////////////
	// SELECTED NAME
	/////////////////////////////////////////////////

	deckSelectedNameFeedbackCallback(_feedback: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult {
		if (this.selectedDeck !== undefined) {
			return {
				text: parameterStates.get()['/composition/decks/' + this.selectedDeck + '/name']?.value || this.selectedDeckName,
				bgcolor: combineRgb(0, 255, 0),
				color: combineRgb(0, 0, 0),
			};
		}
		return {};
	}

	/////////////////////////////////////////////////
	// NEXT NAME
	/////////////////////////////////////////////////

	deckNextNameFeedbackCallback(feedback: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult {
		var add = feedback.options.next as number;
		if (this.selectedDeck !== undefined && this.lastDeck != undefined) {
			let deck = this.calculateNextDeck(add);
			return {text: parameterStates.get()['/composition/decks/' + deck + '/name']?.value};
		}
		return {};
	}

	calculateNextDeck(add: number): number {
		let deck = this.selectedDeck!;
		if (deck + add > this.lastDeck!) {
			deck = deck + add - this.lastDeck!;
		} else {
			deck += add;
		}
		return deck;
	}

	/////////////////////////////////////////////////
	// PREVIOUS NAME
	/////////////////////////////////////////////////

	deckPreviousNameFeedbackCallback(feedback: CompanionFeedbackInfo): CompanionAdvancedFeedbackResult {
		var subtract = feedback.options.previous as number;
		if (this.selectedDeck !== undefined && this.lastDeck !== undefined) {
			let deck = this.calculatePreviousDeck(subtract);
			return {text: parameterStates.get()['/composition/decks/' + deck + '/name']?.value};
		}
		return {};
	}

	calculatePreviousDeck(subtract: number): number {
		let deck = this.selectedDeck!;
		if (deck - subtract < 1) {
			deck = this.lastDeck! + deck - subtract;
		} else {
			deck = deck - subtract;
		}
		return deck;
	}
}
