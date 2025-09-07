import { getLink } from '@repo/data-ops/queries/links';
import { linkSchema, LinkSchemaType } from '@repo/data-ops/zod-schema/links';
import { LinkClickMessageType } from '@repo/data-ops/zod-schema/queue';

const TTL_TIME = 60 * 60 * 24;

export const getDestinationForCountry = (linkInfo: LinkSchemaType, country: string) => {
	const destinations = linkInfo.destinations;
	const destination = destinations[country];
	if (!destination) {
		return destinations.default;
	}
	return destination;
};

export const getLinkInfoFromKV = async (linkId: string, env: Env) => {
	const linkInfo = await env.CACHE.get(linkId);
	if (!linkInfo) {
		return null;
	}
	try {
		return linkSchema.parse(JSON.parse(linkInfo));
	} catch (error) {
		return null;
	}
};

export async function saveLinkInfoToKV(env: Env, id: string, linkInfo: LinkSchemaType) {
	await env.CACHE.put(id, JSON.stringify(linkInfo), {
		// 24 Hour Cache
		expirationTtl: TTL_TIME,
	});
}

export const getGeoroutingDestination = async (env: Env, id: string) => {
	const linkInfo = await getLinkInfoFromKV(id, env);
	if (linkInfo) {
		return linkInfo;
	}

	const linkInfoFromDb = await getLink(id);
	if (!linkInfoFromDb) {
		return null;
	}
	await saveLinkInfoToKV(env, id, linkInfoFromDb);
	return linkInfoFromDb;
};

// make sure to import LinkClickMessageType
// import { LinkClickMessageType } from "@repo/data-ops/zod-schema/queue";
export async function scheduleEvalWorkflow(env: Env, event: LinkClickMessageType) {
	const doId = env.EVALUATION_SCHEDULER.idFromName(`${event.data.id}:${event.data.destination}`);
	const stub = env.EVALUATION_SCHEDULER.get(doId);
	await stub.collectLinkClick(event.data.accountId, event.data.id, event.data.destination, event.data.country || 'UNKNOWN');
}
