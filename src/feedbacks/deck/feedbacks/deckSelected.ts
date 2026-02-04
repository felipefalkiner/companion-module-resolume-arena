import {ResolumeArenaModuleInstance} from '../../../index';
import {CompanionFeedbackDefinition} from '@companion-module/base';
import {getDeckOption, getDefaultStyleGreen} from '../../../defaults';

export function deckSelected(resolumeArenaInstance: ResolumeArenaModuleInstance): CompanionFeedbackDefinition {
	return {
		type: 'boolean',
		name: 'Deck Selected',
		defaultStyle: getDefaultStyleGreen(),
		options: [...getDeckOption()],
		callback: resolumeArenaInstance.getDeckUtils()!.deckSelectedFeedbackCallback.bind(resolumeArenaInstance.getDeckUtils()!),
		subscribe: resolumeArenaInstance.getDeckUtils()!.deckSelectedFeedbackSubscribe.bind(resolumeArenaInstance.getDeckUtils()!),
		unsubscribe: resolumeArenaInstance.getDeckUtils()!.deckSelectedFeedbackUnsubscribe.bind(resolumeArenaInstance.getDeckUtils()!)
	};
}