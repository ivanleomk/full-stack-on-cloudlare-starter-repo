import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { addEvaluation } from '@repo/data-ops/queries/evaluation';
import { collectDestinationInfo } from '@/helpers/browser-render';
import { aiDestinationChecker } from '@/helpers/ai-destination-checker';
import { initDatabase } from '@repo/data-ops/database';

export class DestinationEvaluationWorkflow extends WorkflowEntrypoint<Env, unknown> {
	async run(event: Readonly<WorkflowEvent<DestinationStatusEvaluationParams>>, step: WorkflowStep) {
		initDatabase(this.env.DB);
		const collectedData = await step.do('collect rendered destination page data', async () => {
			return await collectDestinationInfo(this.env, event.payload.destinationUrl);
		});

		const aiStatus = await step.do('Use AI to check status of the page', async () => {
			return await aiDestinationChecker(this.env, collectedData.bodyText);
		});

		const evaluationId = await step.do('Save Evaluation in database', async () => {
			return await addEvaluation({
				linkId: event.payload.linkId,
				accountId: event.payload.accountId,
				destinationUrl: event.payload.destinationUrl,
				status: aiStatus.status,
				reason: aiStatus.statusReason,
			});
		});

		const result = await step.do('Backup destination HTML in R2', async () => {
			const accountId = event.payload.accountId;
			const r2HtmlPath = `${accountId}/html/${evaluationId}`;
			const r2BodyPath = `${accountId}/body-text/${evaluationId}`;

			await this.env.BUCKET.put(r2HtmlPath, collectedData.html);
			await this.env.BUCKET.put(r2BodyPath, collectedData.bodyText);
		});

		return aiStatus;
	}
}
