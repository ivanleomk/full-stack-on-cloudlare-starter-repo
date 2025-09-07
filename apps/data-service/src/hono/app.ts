import { getDestinationForCountry, getGeoroutingDestination } from '@/helpers/route-ops';
import { getLink } from '@repo/data-ops/queries/links';
import { cloudflareInfoSchema } from '@repo/data-ops/zod-schema/links';
import { LinkClickMessageType } from '@repo/data-ops/zod-schema/queue';
import { Hono } from 'hono';

export const App = new Hono<{ Bindings: Env }>();

App.get('/do/:name', async (c) => {
	const name = c.req.param('name');
	const doId = c.env.EVALUATION_SCHEDULER.idFromName(name);
	const stub = c.env.EVALUATION_SCHEDULER.get(doId);

	await stub.increment();
	const count = await stub.getCount();
	return c.json({ count: count });
});

App.get('/:id', async (c) => {
	const linkInfoFromDb = await getGeoroutingDestination(c.env, c.req.param('id'));

	const cfInfo = cloudflareInfoSchema.safeParse(c.req.raw.cf);

	if (!cfInfo.success) {
		return c.json(
			{
				message: 'Invalid Cloudflare Headers',
			},
			400
		);
	}

	if (!linkInfoFromDb) {
		return c.json(
			{
				message: 'Link not found',
			},
			404
		);
	}

	const headers = cfInfo.data;
	const destination = getDestinationForCountry(linkInfoFromDb, headers.country!);

	const queueMessage: LinkClickMessageType = {
		type: 'LINK_CLICK',
		data: {
			id: c.req.param('id'),
			country: headers.country!,
			accountId: linkInfoFromDb.accountId,
			destination: destination,
			latitude: headers.latitude,
			longitude: headers.longitude,
			timestamp: new Date().toISOString(),
		},
	};
	c.executionCtx.waitUntil(c.env.QUEUE.send(queueMessage));
	return c.redirect(destination);
});
