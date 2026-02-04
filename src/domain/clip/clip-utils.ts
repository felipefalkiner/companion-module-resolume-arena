import {combineRgb, CompanionAdvancedFeedbackResult, CompanionFeedbackInfo} from '@companion-module/base';
import {drawPercentage, drawThumb, drawVolume} from '../../image-utils';
import {ResolumeArenaModuleInstance} from '../../index';
import {compositionState, parameterStates} from '../../state';
import {MessageSubscriber} from '../../websocket';
import {Clip, RangeParameter} from '../api';
import {ClipId} from './clip-id';
import {getOtherClipFeedbacks} from '../../feedbacks/clip/clipFeedbacks';
import {CompanionCommonCallbackContext} from '@companion-module/base/dist/module-api/common';
import {getLayerApiFeedbacks} from '../../feedbacks/layer/layerFeedbacks';

export class ClipUtils implements MessageSubscriber {
	private resolumeArenaInstance: ResolumeArenaModuleInstance;

	private clipThumbs: Map<string, Uint8Array> = new Map<string, Uint8Array>();
	private clipBase64Thumbs: Map<string, string> = new Map<string, string>();
	private initalLoadDone = false;

	private clipDetailsSubscriptions: Map<string, Set<string>> = new Map<string, Set<string>>();
	private clipSelectedSubscriptions: Map<string, Set<string>> = new Map<string, Set<string>>();
	private clipOpacitySubscriptions: Map<string, Set<string>> = new Map<string, Set<string>>();
	private clipVolumeSubscriptions: Map<string, Set<string>> = new Map<string, Set<string>>();
	private clipSpeedSubscriptions: Map<string, Set<string>> = new Map<string, Set<string>>();
	private clipSpeedIds: Set<number> = new Set<number>();
	private clipVolumeIds: Set<number> = new Set<number>();
	private clipOpacityIds: Set<number> = new Set<number>();

	// Track subscriptions for connected state per clip. Only subscribe websocket paths when there is at least one active feedback subscription for the clip.
	private clipConnectedSubscriptions: Map<string, Set<string>> = new Map<string, Set<string>>();


	constructor(resolumeArenaInstance: ResolumeArenaModuleInstance) {
		this.resolumeArenaInstance = resolumeArenaInstance;
		this.resolumeArenaInstance.log('debug', 'ClipUtils constructor called');
	}

	messageUpdates(data: {path: string; value: string | number | boolean}, isComposition: boolean) {
		if (isComposition || !this.initalLoadDone) {
			if (compositionState.get() !== undefined) {
				this.initalLoadDone = true;
				this.initComposition();
			}
		}
		if (isComposition) {
			this.updateLayerVolumes();
			this.updateLayerOpacities();
		}
		if (data.path) {
			let matchConnect = data.path.match(/\/composition\/layers\/(\d+)\/clips\/(\d+)\/connect/);
			if (matchConnect) {
				let layer = +matchConnect[1];
				let column = +matchConnect[2];
				let idString = new ClipId(layer, column).getIdString();
				// Only mark connectedClip as dirty if we actually have subscriptions for this clip
				if (this.clipConnectedSubscriptions.has(idString)) {
					this.resolumeArenaInstance.markFeedbackDirty('connectedClip');
				}
			}
			let matchSelect = data.path.match(/\/composition\/layers\/(\d+)\/clips\/(\d+)\/select/);
			if (matchSelect) {
				let layer = +matchSelect[1];
				let column = +matchSelect[2];
				let idString = new ClipId(layer, column).getIdString();
				if (this.clipSelectedSubscriptions.has(idString)) {
					this.resolumeArenaInstance.markFeedbackDirty('selectedClip');
				}
				if (this.clipConnectedSubscriptions.has(idString)) {
					this.resolumeArenaInstance.markFeedbackDirty('connectedClip');
				}
				if (data.value === true) {
					this.resolumeArenaInstance.setVariableValues({selectedClip: JSON.stringify({layer, column})});
					this.resolumeArenaInstance.setVariableValues({selectedClipLayer: layer});
					this.resolumeArenaInstance.setVariableValues({selectedClipColumn: column});
				}
			}
			if (!!data.path.match(/\/composition\/layers\/\d+\/clips\/\d+\/name/)) {
				this.resolumeArenaInstance.checkFeedbacks('clipInfo');
			}
			if (!!data.path.match(/\/composition\/layers\/\d+\/clips\/\d+\/transport\/position\/behaviour\/speed/)) {
				this.resolumeArenaInstance.checkFeedbacks('clipSpeed');
			}
			if (!!data.path.match(/\/composition\/layers\/\d+\/clips\/\d+\/video\/opacity/)) {
				this.resolumeArenaInstance.checkFeedbacks('clipOpacity');
			}
			if (!!data.path.match(/\/composition\/layers\/\d+\/clips\/\d+\/audio\/volume/)) {
				this.resolumeArenaInstance.checkFeedbacks('clipVolume');
			}
			if (!!data.path.match(/\/composition\/layers\/\d+\/clips\/\d+\/transport\/position/)) {
				this.resolumeArenaInstance.checkFeedbacks('clipTransportPosition');
			}
		}
	}

	initComposition() {
		this.initDetailsFromComposition();
		this.initConnectedFromComposition();
		this.initSelectedFromComposition();
		this.initSpeedFromComposition();
	}

	initConnectedFromComposition() {
		const layers = compositionState.get()?.layers;
		if (layers) {
			for (const [layer, layerObject] of layers.entries()) {
				const clips = layerObject.clips;
				if (clips) {
					for (const [clip, clipObject] of clips.entries()) {
						const clipId = new ClipId(layer + 1, clip + 1);
						// Ensure we aren't left subscribed from a previous composition state
						this.clipConnectedWebsocketUnsubscribe(clipId.getLayer(), clipId.getColumn());
						this.clipTransportPositionWebsocketUnsubscribe(clipObject.transport?.position?.id);

						// Only subscribe to /connect when there are active feedback subscriptions for that clip
						if (this.clipConnectedSubscriptions.has(clipId.getIdString())) {
							this.clipConnectedWebsocketSubscribe(clipId.getLayer(), clipId.getColumn());
						}
						this.clipTransportPositionWebsocketSubscribe(clipObject.transport?.position?.id);
					}
				}
			}
		}
		this.resolumeArenaInstance.markFeedbackDirty('connectedClip');
	}

	initSelectedFromComposition() {
		const layers = compositionState.get()?.layers;
		if (layers) {
			for (const [layer, layerObject] of layers.entries()) {
				const clips = layerObject.clips;
				if (clips) {
					for (const [clip, _clipObject] of clips.entries()) {
						const clipId = new ClipId(layer + 1, clip + 1);
						const idString = clipId.getIdString();
						// Only (un)subscribe for clips that have active feedback subscriptions
						if (this.clipSelectedSubscriptions.has(idString)) {
							this.clipSelectedWebsocketSubscribe(clipId.getLayer(), clipId.getColumn());
						} else {
							this.clipSelectedWebsocketUnsubscribe(clipId.getLayer(), clipId.getColumn());
						}
					}
				}
			}
		}
		this.resolumeArenaInstance.markFeedbackDirty('selectedClip');
	}

	async clipSelectedFeedbackSubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (ClipId.isValid(layer, column)) {
			const idString = new ClipId(layer, column).getIdString();
			if (!this.clipSelectedSubscriptions.get(idString)) {
				this.clipSelectedSubscriptions.set(idString, new Set());
				this.clipSelectedWebsocketSubscribe(layer, column);
			}
			this.clipSelectedSubscriptions.get(idString)?.add(feedback.id);
		}
	}

	async clipSelectedFeedbackUnsubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (ClipId.isValid(layer, column)) {
			const idString = new ClipId(layer, column).getIdString();
			const clipSelectedSubscription = this.clipSelectedSubscriptions.get(idString);
			if (clipSelectedSubscription) {
				clipSelectedSubscription.delete(feedback.id);
				if (clipSelectedSubscription.size === 0) {
					this.clipSelectedWebsocketUnsubscribe(layer, column);
					this.clipSelectedSubscriptions.delete(idString);
				}
			}
		}
	}

	async initDetailsFromComposition() {
		const thumbPromiseMap: Promise<void>[] = [];
		for (const clipDetailsSubscription of this.clipDetailsSubscriptions) {
			const clipId = ClipId.fromId(clipDetailsSubscription[0]);
			this.clipDetailsWebsocketUnsubscribe(clipId.getLayer(), clipId.getColumn());
			this.clipDetailsWebsocketSubscribe(clipId.getLayer(), clipId.getColumn());
			let thumb = await this.resolumeArenaInstance.restApi?.Clips.getThumb(clipId);
			if (thumb) {
				if (this.resolumeArenaInstance.getConfig().useCroppedThumbs) {
					thumbPromiseMap.push(this.getThumbs(clipId, clipDetailsSubscription[0]));
					this.resolumeArenaInstance.checkFeedbacks('clipInfo');
				} else {
					this.clipBase64Thumbs.set(clipId.getIdString(), thumb);
				}
			} else {
				this.resolumeArenaInstance.log('warn', 'thumb is not');
				return;
			}
		}
		if (thumbPromiseMap.length < 0) {
			Promise.allSettled(thumbPromiseMap).then(_ => {
				this.resolumeArenaInstance.checkFeedbacks('clipInfo');
			});
		}

	}

	async getThumbs(clipId: ClipId, feedbackId: string) {
		let thumb = await this.resolumeArenaInstance.restApi?.Clips.getThumb(clipId);
		if (thumb) {
			try {
				this.clipThumbs.set(clipId.getIdString(), drawThumb(thumb));
				this.resolumeArenaInstance.checkFeedbacksById(feedbackId);
			} catch (e) {
				this.resolumeArenaInstance.log('warn', 'could not draw thumb: ' + e);
			}
		} else {
			this.resolumeArenaInstance.log('warn', 'thumb is not');
			return;
		}
	}

	initSpeedFromComposition() {
		for (const clipSpeedId of this.clipSpeedIds) {
			this.clipSpeedWebsocketUnsubscribe(clipSpeedId);
		}
		for (const clipSpeedSubscription of this.clipSpeedSubscriptions) {
			const clipId = ClipId.fromId(clipSpeedSubscription[0]);
			this.clipSpeedWebsocketSubscribe(clipId.getLayer(), clipId.getColumn());
		}
		this.resolumeArenaInstance.checkFeedbacks('clipSpeed');
	}

	updateLayerVolumes() {
		for (const clipVolumeId of this.clipVolumeIds) {
			this.clipVolumeWebsocketUnsubscribe(clipVolumeId);
		}
		for (const [clipIdString, _subscriptionId] of this.clipVolumeSubscriptions.entries()) {
			let clipId = ClipId.fromId(clipIdString);
			this.clipVolumeWebsocketFeedbackSubscribe(clipId.getLayer(), clipId.getColumn());
		}
		this.resolumeArenaInstance.markFeedbackDirty('clipVolume');
	}

	updateLayerOpacities() {
		for (const clipOpacityId of this.clipOpacityIds) {
			this.clipOpacityWebsocketUnsubscribe(clipOpacityId);
		}
		for (const [clipIdString, _subscriptionId] of this.clipOpacitySubscriptions.entries()) {
			let clipId = ClipId.fromId(clipIdString);
			this.clipOpacityWebsocketSubscribe(clipId.getLayer(), clipId.getColumn());
		}
		this.resolumeArenaInstance.markFeedbackDirty('clipOpacity');
	}

	public getClipFromCompositionState(layer: number, column: number): Clip | undefined {
		const layersObject = compositionState.get()?.layers;
		if (layersObject) {
			const layerObject = layersObject[layer - 1];
			const clipsObject = layerObject.clips;
			if (clipsObject) {
				const clipObject = clipsObject[column - 1];
				return clipObject;
			}
		}
		return undefined;
	}


/////////////////////////////////////////////////
// Volume
/////////////////////////////////////////////////


	async clipVolumeFeedbackCallback(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext): Promise<CompanionAdvancedFeedbackResult> {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (layer === 0 || column === 0) {
			return {text: '?'};
		}
		const volume = parameterStates.get()['/composition/layers/' + layer + '/clips/' + column + '/audio/volume']?.value;
		if (volume !== undefined) {
			return this.setVolumeFeedback(volume);
		} else {
			const fallbackVolume = (await this.resolumeArenaInstance.restApi!.Clips.getStatus(new ClipId(layer, column))).audio?.volume?.value;
			return this.setVolumeFeedback(fallbackVolume);
		}
	}

	private setVolumeFeedback(volume: number | undefined) {
		if (volume !== undefined) {
			return {
				text: Math.round(volume * 100) / 100 + 'db',
				show_topbar: false,
				imageBuffer: drawVolume(volume, 12)
			};
		} else {
			return {text: '?'};
		}
	}

	async clipVolumeFeedbackSubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (ClipId.isValid(layer, column)) {
			const idString = new ClipId(layer, column).getIdString();
			if (!this.clipVolumeSubscriptions.get(idString)) {
				this.clipVolumeSubscriptions.set(idString, new Set());
			}
			this.clipVolumeSubscriptions.get(idString)?.add(feedback.id);
		}
	}

	async clipVolumeFeedbackUnsubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (ClipId.isValid(layer, column)) {
			const idString = new ClipId(layer, column).getIdString();
			const clipVolumeSubscription = this.clipVolumeSubscriptions.get(idString);
			if (clipVolumeSubscription) {
				clipVolumeSubscription.delete(feedback.id);
				if (clipVolumeSubscription.size === 0) {
					this.clipVolumeSubscriptions.delete(idString);
				}
			}
		}
	}

	clipVolumeWebsocketFeedbackSubscribe(layer: number, column: number) {
		const clip = this.getClipFromCompositionState(layer, column);
		const clipVolumeId = clip?.audio?.volume?.id;
		if (clipVolumeId) {
			this.clipVolumeIds.add(clipVolumeId);
			this.resolumeArenaInstance.getWebsocketApi()?.subscribeParam(clipVolumeId!);
		}
	}

	clipVolumeWebsocketUnsubscribe(clipVolumeId: number) {
		this.resolumeArenaInstance.getWebsocketApi()?.unsubscribeParam(clipVolumeId!);
	}


	/////////////////////////////////////////////////
	// Opacity
	/////////////////////////////////////////////////

	async clipOpacityFeedbackCallback(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext): Promise<CompanionAdvancedFeedbackResult> {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (layer === 0 || column === 0) {
			return {text: '?'};
		}
		const opacity: number | undefined = parameterStates.get()['/composition/layers/' + layer + '/clips/' + column + '/video/opacity']?.value;

		if (opacity !== undefined) {
			return this.setOpacityFeedback(opacity);
		} else {
			const fallbackOpacity = (await this.resolumeArenaInstance.restApi!.Clips.getStatus(new ClipId(layer, column))).video?.opacity.value;
			return this.setOpacityFeedback(fallbackOpacity);
		}
	}


	private setOpacityFeedback(opacity: number | undefined) {
		if (opacity !== undefined) {
			return {
				text: Math.round(opacity * 100) + '%',
				show_topbar: false,
				imageBuffer: drawPercentage(opacity)
			};
		} else {
			return {text: '?'};
		}
	}

	async clipOpacityFeedbackSubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (ClipId.isValid(layer, column)) {
			const idString = new ClipId(layer, column).getIdString();
			if (!this.clipOpacitySubscriptions.get(idString)) {
				this.clipOpacitySubscriptions.set(idString, new Set());
			}
			this.clipOpacitySubscriptions.get(idString)?.add(feedback.id);
		}
	}

	async clipOpacityFeedbackUnsubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (ClipId.isValid(layer, column)) {
			const idString = new ClipId(layer, column).getIdString();
			const clipOpacitySubscription = this.clipOpacitySubscriptions.get(idString);
			if (clipOpacitySubscription) {
				clipOpacitySubscription.delete(feedback.id);
				if (clipOpacitySubscription.size === 0) {
					this.clipOpacitySubscriptions.delete(idString);
				}
			}
		}
	}


	clipOpacityWebsocketSubscribe(layer: number, column: number) {
		const clip = this.getClipFromCompositionState(layer, column);
		const clipOpacityId = clip?.video?.opacity?.id;
		if (clipOpacityId) {
			this.clipOpacityIds.add(clipOpacityId);
			this.resolumeArenaInstance.getWebsocketApi()?.subscribeParam(clipOpacityId!);
		}
	}

	clipOpacityWebsocketUnsubscribe(clipOpacityId: number) {
		this.resolumeArenaInstance.getWebsocketApi()?.unsubscribeParam(clipOpacityId!);
	}

	/////////////////////////////////////////////////
	// ClipDetails
	/////////////////////////////////////////////////

	async clipDetailsFeedbackCallback(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext): Promise<CompanionAdvancedFeedbackResult> {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);

		if (ClipId.isValid(layer, column)) {
			var key = new ClipId(layer, column);
			var result: CompanionAdvancedFeedbackResult = {
				text: '',
				png64: undefined
			};
			if (feedback.options.showName) {
				result.text = parameterStates.get()['/composition/layers/' + layer + '/clips/' + column + '/name']?.value;
			}
			if (feedback.options.showText) {
				let clipStatus = await this.resolumeArenaInstance.restApi?.Clips.getStatus(key);
				result.text = clipStatus?.video?.sourceparams?.Text?.value;
			}
			if (feedback.options.showThumb) {
				if (this.resolumeArenaInstance.getConfig().useCroppedThumbs) {
					result.imageBuffer = this.clipThumbs.get(key.getIdString());
					result.imageBufferPosition = {
						x: 4,
						y: 4,
						width: 64,
						height: 64
					};
				} else {
					result.png64 = this.clipBase64Thumbs.get(key.getIdString());
				}
				result.show_topbar = false;
			}
			return result;
		}
		return {text: undefined, png64: undefined};
	}

	async clipDetailsFeedbackSubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);

		if (ClipId.isValid(layer, column)) {
			const idString = new ClipId(layer, column).getIdString();
			if (!this.clipDetailsSubscriptions.get(idString)) {
				this.clipDetailsSubscriptions.set(idString, new Set());
				this.clipDetailsWebsocketSubscribe(layer, column);
			}
			this.clipDetailsSubscriptions.get(idString)?.add(feedback.id);
		}
	}

	async clipConnectedFeedbackSubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (ClipId.isValid(layer, column)) {
			const idString = new ClipId(layer, column).getIdString();
			if (!this.clipConnectedSubscriptions.get(idString)) {
				this.clipConnectedSubscriptions.set(idString, new Set());
				this.clipConnectedWebsocketSubscribe(layer, column);
			}
			this.clipConnectedSubscriptions.get(idString)?.add(feedback.id);
		}
	}

	async clipDetailsFeedbackUnsubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);

		const clipDetailsSubscriptions = this.clipDetailsSubscriptions.get(new ClipId(layer, column).getIdString());
		if (ClipId.isValid(layer, column) && clipDetailsSubscriptions) {
			clipDetailsSubscriptions.delete(feedback.id);
			if (clipDetailsSubscriptions.size === 0) {
				this.clipDetailsWebsocketUnsubscribe(layer, column);
				this.clipDetailsSubscriptions.delete(new ClipId(layer, column).getIdString());
			}
		}
	}

	clipDetailsWebsocketSubscribe(layer: number, column: number) {
		this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/layers/' + layer + '/clips/' + column + '/name');
	}

	clipDetailsWebsocketUnsubscribe(layer: number, column: number) {
		this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/layers/' + layer + '/clips/' + column + '/name');
	}

	async clipConnectedFeedbackUnsubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);

		if (ClipId.isValid(layer, column)) {
			const idString = new ClipId(layer, column).getIdString();
			const clipConnectedSubscription = this.clipConnectedSubscriptions.get(idString);
			if (clipConnectedSubscription) {
				clipConnectedSubscription.delete(feedback.id);
				if (clipConnectedSubscription.size === 0) {
					this.clipConnectedWebsocketUnsubscribe(layer, column);
					this.clipConnectedSubscriptions.delete(idString);
				}
			}
		}
	}

	/////////////////////////////////////////////////
	// Connected
	/////////////////////////////////////////////////

	async clipConnectedFeedbackCallback(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext): Promise<CompanionAdvancedFeedbackResult> {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);

		const connectedState = parameterStates.get()['/composition/layers/' + layer + '/clips/' + column + '/connect']?.value;
		const selectedState = parameterStates.get()['/composition/layers/' + layer + '/clips/' + column + '/select']?.value;
		// this.resolumeArenaInstance.log('debug', 'connectedState layer:' + layer + 'col: ' + column + ' connectedState:' + connectedState);

		const clipName = parameterStates.get()['/composition/layers/' + layer + '/clips/' + column + '/name']?.value;

		if ((connectedState as string)?.toLowerCase().includes('preview')) {
			this.resolumeArenaInstance.setVariableValues({previewedClip: JSON.stringify({layer, column, clipName})});
			this.resolumeArenaInstance.setVariableValues({previewedClipLayer: layer});
			this.resolumeArenaInstance.setVariableValues({previewedClipColumn: column});
			this.resolumeArenaInstance.setVariableValues({previewedClipName: clipName});
			this.resolumeArenaInstance.checkFeedbacks(...getOtherClipFeedbacks(this.resolumeArenaInstance, 'connectedClip'));
		}

		switch (connectedState) {
			case 'Connected':
				if (selectedState) {
					return {bgcolor: feedback.options.color_connected_selected as number};
				}
				return {bgcolor: feedback.options.color_connected as number};
			case 'Connected & previewing':
				return {bgcolor: feedback.options.color_connected_preview as number};
			case 'Previewing':

				return {bgcolor: feedback.options.color_preview as number};
			default:
				return {bgcolor: combineRgb(0, 0, 0)};
		}
	}

	clipConnectedWebsocketSubscribe(layer: number, column: number) {
		this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/layers/' + layer + '/clips/' + column + '/connect');
	}

	clipConnectedWebsocketUnsubscribe(layer: number, column: number) {
		this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/layers/' + layer + '/clips/' + column + '/connect');
	}

	/////////////////////////////////////////////////
	// Selected
	/////////////////////////////////////////////////

	async clipSelectedFeedbackCallback(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext): Promise<boolean> {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);

		let value = parameterStates.get()['/composition/layers/' + layer + '/clips/' + column + '/select']?.value;
		if (value) {
			const clipName = parameterStates.get()['/composition/layers/' + layer + '/clips/' + column + '/name']?.value;
			this.resolumeArenaInstance.setVariableValues({selectedClip: JSON.stringify({layer, column, clipName})});
			this.resolumeArenaInstance.setVariableValues({selectedClipLayer: layer});
			this.resolumeArenaInstance.setVariableValues({selectedClipColumn: column});
			this.resolumeArenaInstance.setVariableValues({selectedClipName: clipName});
			this.resolumeArenaInstance.checkFeedbacks(...getOtherClipFeedbacks(this.resolumeArenaInstance, 'selectedClip'), ...Object.keys(getLayerApiFeedbacks(this.resolumeArenaInstance)));
		}
		return value;
	}

	clipSelectedWebsocketSubscribe(layer: number, column: number) {
		this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/layers/' + layer + '/clips/' + column + '/select');
	}

	clipSelectedWebsocketUnsubscribe(layer: number, column: number) {
		this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/layers/' + layer + '/clips/' + column + '/select');
	}

	/////////////////////////////////////////////////
	// Speed
	/////////////////////////////////////////////////

	async clipSpeedFeedbackCallback(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext): Promise<CompanionAdvancedFeedbackResult> {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);
		if (layer === 0 || column === 0) {
			return {text: '?'};
		}
		const speed = parameterStates.get()['/composition/layers/' + layer + '/clips/' + column + '/transport/position/behaviour/speed']?.value;

		if (speed !== undefined) {
			return this.setSpeedFeedback(speed, layer, column);
		} else {
			const fallbackSpeed: number | undefined = (await this.resolumeArenaInstance.restApi!.Clips.getStatus(new ClipId(layer, column))).transport?.controls?.speed?.value;
			return this.setSpeedFeedback(fallbackSpeed, layer, column);
		}
	}

	private setSpeedFeedback(speed: number | undefined, layer: number, column: number) {
		if (speed !== undefined) {
			if (ClipId.isValid(layer, column)) {
				return {
					text: Math.round(speed * 100) + '%',
					show_topbar: false,
					imageBuffer: drawPercentage(speed)
				};
			}
		}
		return {text: '?'};
	}

	async clipSpeedFeedbackSubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);

		if (ClipId.isValid(layer, column)) {
			const idString = new ClipId(layer, column).getIdString();
			if (!this.clipSpeedSubscriptions.get(idString)) {
				this.clipSpeedSubscriptions.set(idString, new Set());
				this.clipSpeedWebsocketSubscribe(layer, column);
			}
			this.clipSpeedSubscriptions.get(idString)?.add(feedback.id);
		}
	}

	clipSpeedWebsocketSubscribe(layer: number, column: number) {
		const clip = this.getClipFromCompositionState(layer, column);
		const clipSpeedId = clip?.transport?.controls?.speed?.id;
		if (clipSpeedId) {
			this.resolumeArenaInstance.getWebsocketApi()?.subscribeParam(clipSpeedId);
			this.clipSpeedIds.add(clipSpeedId);
		}
		// this.resolumeArenaInstance.getWebsocketApi()?.subscribePath('/composition/layers/' + layer + '/clips/' + column + '/speed');
	}

	async clipSpeedFeedbackUnsubscribe(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext) {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);

		const clipSpeedSubscriptions = this.clipSpeedSubscriptions.get(new ClipId(layer, column).getIdString());
		if (ClipId.isValid(layer, column) && clipSpeedSubscriptions) {
			clipSpeedSubscriptions.delete(feedback.id);
			if (clipSpeedSubscriptions.size === 0) {
				const clip = this.getClipFromCompositionState(layer, column);
				const clipSpeedId = clip?.transport?.controls?.speed?.id;
				this.clipSpeedWebsocketUnsubscribe(clipSpeedId);
				this.clipSpeedSubscriptions.delete(new ClipId(layer, column).getIdString());
			}
		}
	}

	clipSpeedWebsocketUnsubscribe(clipSpeedId?: number) {
		if (clipSpeedId) {
			this.resolumeArenaInstance.getWebsocketApi()?.unsubscribeParam(clipSpeedId);
			this.clipSpeedIds.delete(clipSpeedId);
		}
		// this.resolumeArenaInstance.getWebsocketApi()?.unsubscribePath('/composition/layers/' + layer + '/clips/' + column + '/speed');
	}

	/////////////////////////////////////////////////
	// Transport Position
	/////////////////////////////////////////////////

	async clipTransportPositionFeedbackCallback(feedback: CompanionFeedbackInfo, context: CompanionCommonCallbackContext): Promise<CompanionAdvancedFeedbackResult> {
		const layer = +await context.parseVariablesInString(feedback.options.layer as string);
		const column = +await context.parseVariablesInString(feedback.options.column as string);

		var view = feedback.options.view;
		var timeRemaining = feedback.options.timeRemaining;
		const param = parameterStates.get()['/composition/layers/' + layer + '/clips/' + column + '/transport/position'] as RangeParameter;

		if (ClipId.isValid(layer, column) && view && param && param.max !== undefined && param.value !== undefined) {
			const max = param.max;
			const value = param.value;

			const subSecondsInSecond = 60;
			const secondsInMinute = 60;
			const minutesInHour = 60;
			const framesInMinute = subSecondsInSecond * secondsInMinute;
			const framesInHour = framesInMinute * minutesInHour;

			let time: number;

			if (timeRemaining) {
				time = ((max - value) / 100) * 6 + 0.6;
			} else {
				time = (value / 100) * 6;
			}

			var hours = Math.floor(Math.abs(time / framesInHour));
			var minutesOnly = Math.floor(Math.abs((time - hours * framesInHour) / framesInMinute));
			var secondsOnly = Math.floor(Math.abs((time - hours * framesInHour - minutesOnly * framesInMinute) / subSecondsInSecond));
			var subSecondsOnly = Math.floor(Math.abs(time - hours * framesInHour - minutesOnly * framesInMinute - secondsOnly * subSecondsInSecond));
			var framesOnly = Math.floor(subSecondsOnly / 2);

			switch (view) {
				case 'fullSeconds':
					return {text: (Math.round(value / 100) / 10).toFixed(1) + 's', size: 14};
				case 'frames':
					return {text: framesOnly.toString().padStart(2, '0')};
				case 'seconds':
					return {text: secondsOnly.toString().padStart(2, '0')};
				case 'minutes':
					return {text: minutesOnly.toString().padStart(2, '0')};
				case 'hours':
					return {text: hours.toString().padStart(2, '0')};
				case 'direction':
					return {text: timeRemaining ? '-' : '+'};
				case 'timestampFrame':
					return {
						text:
							(timeRemaining ? '-' : '') +
							hours.toString().padStart(2, '0') +
							':' +
							minutesOnly.toString().padStart(2, '0') +
							':' +
							secondsOnly.toString().padStart(2, '0') +
							': ' +
							framesOnly.toString().padStart(2, '0'),
						size: 14
					};
				case 'timestamp':
					return {
						text:
							(timeRemaining ? '-' : '') +
							hours.toString().padStart(2, '0') +
							':' +
							minutesOnly.toString().padStart(2, '0') +
							':' +
							secondsOnly.toString().padStart(2, '0'),
						size: 14
					};
				case 'timestampFrame_noHours':
					return {
						text:
							(timeRemaining ? '-' : '') +
							((hours * 60) + minutesOnly).toString().padStart(2, '0') +
							':' +
							secondsOnly.toString().padStart(2, '0') +
							': ' +
							framesOnly.toString().padStart(2, '0'),
						size: 14
					};
				case 'timestamp_noHours':
					return {
						text:
							(timeRemaining ? '-' : '') +
							((hours * 60) + minutesOnly).toString().padStart(2, '0') +
							':' +
							secondsOnly.toString().padStart(2, '0'),
						size: 18
					};
				default:
					break;
			}
		}
		return {text: '?'};
	}

	clipTransportPositionWebsocketSubscribe(clipTransportPositionId?: number) {
		if (clipTransportPositionId) {
			this.resolumeArenaInstance.getWebsocketApi()?.subscribeParam(clipTransportPositionId);
		}
	}

	clipTransportPositionWebsocketUnsubscribe(clipTransportPositionId?: number) {
		if (clipTransportPositionId) {
			this.resolumeArenaInstance.getWebsocketApi()?.unsubscribeParam(clipTransportPositionId);
		}
	}
}
